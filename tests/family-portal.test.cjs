/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const student = { id: '81000000-0000-4000-8000-000000000001', full_name: 'Learner One', student_code: 'L1' }
function harness(fixtures = {}, signedIn = true, error = null) {
  const calls = []
  const db = { auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: 'user' } } : null }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: fixtures[name] || [], error } } }
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/app/login/actions': { logout: async () => {} },
    '@/app/admin/payroll/data': { money: (v, currency) => `${v} ${currency}` },
    'next/navigation': { redirect: url => { throw new Error(url) }, notFound: () => { throw new Error('NOT_FOUND') } },
    'next/link': { default: ({ children, href, ...props }) => { delete props.prefetch; return React.createElement('a', { href, ...props }, children) } },
  }
  function load(file) {
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    const mod = { exports: {} }
    const req = name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('.') || name.startsWith('@/')) {
        const target = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name)
        return load(target + (fs.existsSync(target + '.tsx') ? '.tsx' : '.ts'))
      }
      return require(name)
    }
    new Function('require', 'module', 'exports', source)(req, mod, mod.exports)
    return mod.exports
  }
  return { calls, render: async params => renderToStaticMarkup(await load(path.resolve('app/my-learning/page.tsx')).default({ searchParams: Promise.resolve(params) })) }
}
test('family portal rejects signed-out access before querying', async () => {
  const h = harness({}, false)
  await assert.rejects(h.render({}), /\/login/)
  assert.equal(h.calls.length, 0)
})
test('unrelated student is not found before any journey or finance query', async () => {
  const h = harness()
  await assert.rejects(h.render({ student: student.id }), /NOT_FOUND/)
  assert.deepEqual(h.calls.map(c => c.name), ['portal_students'])
})
test('picker only renders server-authorized identities and paginates', async () => {
  const h = harness({ portal_students: [student] })
  const html = await h.render({ page: '2' })
  assert.match(html, /Learner One/)
  assert.equal(h.calls[0].args.p_offset, 25)
  assert.match(html, /Trang trước/)
})
test('selected tab loads only bounded attendance and uses Vietnam time', async () => {
  const h = harness({ portal_students: [student], student_attendance_history: [{ attendance_id: 'a', class_name: 'Piano', starts_at: '2026-09-16T00:00:00Z', attendance_status: 'PRESENT' }] })
  const html = await h.render({ student: student.id, tab: 'attendance', page: '2' })
  assert.deepEqual(h.calls.map(c => c.name), ['portal_students', 'student_attendance_history'])
  assert.deepEqual(h.calls[1].args, { p_student: student.id, p_offset: 25, p_limit: 26 })
  assert.match(html, /07:00/)
  assert.match(html, /Có mặt/)
})
test('journey shows both programs and completed versus available without write actions', async () => {
  const h = harness({ portal_students: [student], portal_academic_journey: [
    { program_id: 'p', curriculum: 'Piano', is_primary: true, status: 'ACTIVE', levels: [{ id: '1', name: 'Grade 1', status: 'COMPLETED', subjects: [] }, { id: '2', name: 'Grade 2', status: 'AVAILABLE', subjects: [] }] },
    { program_id: 'g', curriculum: 'Guitar', status: 'ACTIVE', levels: [] },
  ] })
  const html = await h.render({ student: student.id })
  assert.match(html, /Piano/); assert.match(html, /Guitar/); assert.match(html, /100%/); assert.match(html, /Sẵn sàng bắt đầu/)
  assert.doesNotMatch(html, /Start Grade|name="status"|name="score"/)
})
test('finance does not mislabel invoice subtotal as full customer balance', async () => {
  const h = harness({ portal_students: [student], student_debt_history: [{ invoice_id: 'i', invoice_number: 'INV1', currency: 'VND', total_amount: 4000000, allocated_amount: 3000000, outstanding_balance: 1000000 }] })
  const html = await h.render({ student: student.id, tab: 'debt' })
  assert.match(html, /1000000 VND/)
  assert.match(html, /không phải tổng số dư tài khoản/)
})
test('projection errors do not masquerade as an empty successful list', async () => {
  await assert.rejects(harness({}, true, { message: 'private DB detail' }).render({}), /Không thể tải hồ sơ học tập/)
})
