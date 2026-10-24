const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function update({ allowed = true, rows = [{ id: 'progress' }], error = null, status = 'IN_PROGRESS' } = {}) {
  let writes = 0
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'test-operations-user' } }, error: null }) },
    from: () => ({ update: () => { writes++; return { eq: () => ({ select: async () => ({ data: rows, error }) }) } } }),
  }
  const module = { exports: {} }
  const mocks = {
    'next/navigation': { redirect: url => { throw new Error(url) } },
    'next/cache': { revalidatePath() {} },
    '@/lib/auth/request': { requestOperationalAdmin: async () => ({ data: allowed, error: null }) },
    '@/lib/supabase/server': { createClient: async () => db },
    '../../../lib/authorization': { requireOperationsStaff: async () => db },
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/admin/students/actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => {
    assert.ok(name in mocks, name)
    return mocks[name]
  }, console: { error() {} } })
  const form = new FormData()
  for (const [key, value] of Object.entries({ progress_id: 'progress', student_id: 'student', status })) form.set(key, value)
  let outcome
  try { await module.exports.updateLessonProgressStatus(form) } catch (e) { outcome = e.message }
  return { outcome, writes }
}
test('operational admin can save both started and passed lesson states', async () => {
  for (const status of ['IN_PROGRESS', 'PASS']) {
    const result = await update({ status })
    assert.equal(result.writes, 1)
    assert.equal(result.outcome, undefined)
  }
})
test('unsupported role cannot write progress', async () => {
  assert.equal((await update({ allowed: false })).writes, 0)
})
test('RLS-filtered zero-row updates never report success', async () => {
  const result = await update({ rows: [] })
  assert.match(result.outcome, /error=/)
  assert.doesNotMatch(result.outcome, /success=/)
})
test('database scheduled-start restriction remains an error', async () => {
  const result = await update({ error: { message: 'scheduled start' }, rows: [] })
  assert.match(decodeURIComponent(result.outcome), /before the scheduled start date/)
})
