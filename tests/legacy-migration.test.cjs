/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), React = require('react')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
function setup(fixtures = {}, authorized = true) {
  const h = harness(fixtures, null, authorized)
  const rpc = h.db.rpc
  h.db.rpc = async (name, args) => name === 'has_permission' ? (h.calls.push({ rpc: name, args }), { data: authorized, error: null }) : rpc(name, args)
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => h.db },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }) } },
    'next/cache': { revalidatePath() {} },
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
  }
  const load = file => {
    const compiled = { exports: {} }
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText
    new Function('require', 'module', 'exports', output)(name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('.') || name.startsWith('@/')) {
        const target = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name)
        return load(target + (fs.existsSync(target + '.ts') ? '.ts' : '.tsx'))
      }
      return require(name)
    }, compiled, compiled.exports)
    return compiled.exports
  }
  return { ...h, load: name => load(path.resolve('app/admin/migration', name)) }
}
const { columns, parseLegacyCsv } = setup().load('csv.ts')
const source = Object.fromEntries(columns.map(column => [column, column === 'legacy_reference' ? 'source-1' : column === 'class_code' ? '' : 'value']))
const csv = data => columns.join(',') + '\r\n' + data.map(row => columns.map(column => '"' + String(row[column] ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n')
test('CSV preserves Vietnamese text, quoted newlines and exact monetary strings', () => {
  const row = { ...source, full_name: 'Nguyễn, "An"\nBình', final_amount: '5500000.00' }
  assert.deepEqual(parseLegacyCsv('\uFEFF' + csv([row])), [row])
})
test('missing class stays empty for database review, never fabricated by parser', () => {
  assert.equal(parseLegacyCsv(csv([source]))[0].class_code, '')
})
test('duplicate source references and malformed CSV fail before staging', () => {
  assert.throws(() => parseLegacyCsv(csv([source, source])), /trùng/)
  assert.throws(() => parseLegacyCsv(csv([source]).slice(0, -1)), /ngoặc kép/)
  assert.throws(() => parseLegacyCsv('name,value\na,b'), /Cột/)
})
test('CSV limits reject oversized sources and more than 500 students', () => {
  assert.throws(() => parseLegacyCsv('a'.repeat(500001)), /quá lớn/)
  assert.throws(() => parseLegacyCsv(csv(Array.from({ length: 501 }, (_, i) => ({ ...source, legacy_reference: String(i) })))), /500/)
})
test('review sends mapped fields and version but never trusted approval flags', async () => {
  const h = setup()
  await redirected(h.load('actions.ts').reviewLegacy, { ...source, row: id(1), batch: id(2), version: '2', action: 'MAP', reason: 'Verified', confirm: 'yes', status: 'READY', finance_reviewed_by: id(9) })
  const call = h.calls.at(-1)
  assert.equal(call.rpc, 'review_legacy_row')
  assert.equal(call.args.p_version, 2)
  assert.equal(call.args.p_payload.class_code, '')
  assert.equal(call.args.p_payload.status, undefined)
  assert.equal(call.args.p_payload.finance_reviewed_by, undefined)
})
test('import only passes row reference and version to atomic database RPC', async () => {
  const h = setup()
  await redirected(h.load('actions.ts').reviewLegacy, { row: id(1), batch: id(2), version: '2', action: 'IMPORT', reason: 'Checked', confirm: 'yes', final_amount: '1' })
  assert.deepEqual(h.calls.at(-1), { rpc: 'import_legacy_row', args: { p_row: id(1), p_version: 2 } })
})
test('missing confirmation and unauthorized account cannot call import RPC', async () => {
  for (const authorized of [true, false]) {
    const h = setup({}, authorized)
    await redirected(h.load('actions.ts').reviewLegacy, { row: id(1), batch: id(2), version: '2', action: 'IMPORT', reason: 'Checked' })
    assert.ok(!h.calls.some(call => call.rpc === 'import_legacy_row'))
  }
})
test('NEEDS_REVIEW page displays raw source but offers no import action', async () => {
  const h = setup({ migration_batches: [{ id: id(2), source_system: 'TEST', source_file_name: 'test.csv' }], migration_batch_rows: [{ id: id(1), batch_id: id(2), row_number: 1, version: 1, status: 'NEEDS_REVIEW', source_reference: 'source-1', normalized_payload: source, raw_payload: source, validation_result: ['CLASS_MAPPING_REQUIRED'] }] })
  const html = renderToStaticMarkup(await h.load('page.tsx').default({ searchParams: Promise.resolve({ batch: id(2), selected: id(1) }) }))
  assert.match(html, /Cần xác nhận mã lớp/)
  assert.match(html, /Dữ liệu gốc/)
  assert.doesNotMatch(html, /value="IMPORT"/)
})
test('batch import selects only READY rows, caps work and stops on first failed unit', async () => {
  const h = setup({ migration_batch_rows: [{ id: id(10), batch_id: id(2), version: 2, status: 'READY' }, { id: id(11), batch_id: id(2), version: 1, status: 'NEEDS_REVIEW' }, { id: id(12), batch_id: id(2), version: 3, status: 'READY' }, { id: id(13), batch_id: id(2), version: 1, status: 'READY' }] })
  const original = h.db.rpc
  h.db.rpc = async (name, args) => {
    if (name === 'import_legacy_row') { h.calls.push({ rpc: name, args }); return { data: null, error: args.p_row === id(12) ? { code: 'P0001' } : null } }
    return original(name, args)
  }
  const result = await redirected(h.load('actions.ts').batchLegacy, { batch: id(2), action: 'IMPORT_READY', reason: 'Reviewed', confirm: 'yes' })
  assert.match(result.searchParams.get('error'), /Đã nhập 1 dòng/)
  assert.deepEqual(h.calls.filter(c => c.rpc === 'import_legacy_row').map(c => c.args.p_row), [id(10), id(12)])
  assert.equal(h.calls.find(c => c.table === 'migration_batch_rows').limit, 25)
  assert.equal(h.calls.at(-1).rpc, 'record_legacy_import_failure')
})
test('rollback blocker is displayed as a denial, not a success', async () => {
  const h = setup(), original = h.db.rpc
  h.db.rpc = (name, args) => name === 'rollback_legacy_row' ? Promise.resolve({data:'BLOCKED',error:null}) : original(name,args)
  const result = await redirected(h.load('actions.ts').reviewLegacy, {row:id(1),batch:id(2),version:'2',action:'ROLLBACK_APPROVE',reason:'Checked',confirm:'yes'})
  assert.match(result.searchParams.get('error'), /Không được rollback/)
  assert.equal(result.searchParams.get('success'), null)
})
test('batch sign-off uses server-side reconciliation RPC with explicit reason', async () => {
  const h = setup()
  await redirected(h.load('actions.ts').batchLegacy, {batch:id(2),action:'SIGN_OFF',reason:'Exact controls',confirm:'yes'})
  assert.deepEqual(h.calls.at(-1), {rpc:'sign_off_legacy_batch',args:{p_batch:id(2),p_reason:'Exact controls'}})
})
