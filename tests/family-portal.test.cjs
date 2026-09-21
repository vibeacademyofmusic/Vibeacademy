/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const student = { id: '81000000-0000-4000-8000-000000000001', full_name: 'Learner One', student_code: 'L1' }
function harness(fixtures = {}, signedIn = true, error = null, route = 'app/my-learning/page.tsx') {
  const calls = []
  const db = { auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: 'user' } } : null }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: fixtures[name] || [], error } } }
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/app/login/actions': { logout: async () => {} },
    '@/app/admin/payroll/data': { money: (v, currency) => `${v} ${currency}` },
    'next/cache': { revalidatePath: () => {} },
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
  return { calls, action: () => load(path.resolve('app/my-learning/actions.ts')).submitFeedback, render: async params => renderToStaticMarkup(await load(path.resolve(route)).default({ searchParams: Promise.resolve(params) })) }
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
  assert.deepEqual(h.calls.map(c => c.name), ['portal_students', 'student_attendance_history', 'has_role', 'has_role'])
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
test('teacher portal requires teacher role before data reads', async () => {
  const h = harness({}, true, null, 'app/operations/teacher/page.tsx')
  await assert.rejects(h.render({}), /Unauthorized/)
  assert.deepEqual(h.calls.map(c => c.name), ['has_role'])
})
test('teacher history uses actual-teaching projection and preserves bounded page', async () => {
  const h = harness({ has_role: true, teacher_portal_sessions: [{ session_id: 's', class_name: 'Taught class', starts_at: '2026-09-16T00:00:00Z', ends_at: '2026-09-16T01:00:00Z', status: 'COMPLETED' }] }, true, null, 'app/operations/teacher/page.tsx')
  const html = await h.render({ tab: 'history', page: '3' })
  assert.deepEqual(h.calls[1], { name: 'teacher_portal_sessions', args: { p_offset: 50, p_history: true } })
  assert.match(html, /Taught class/); assert.match(html, /\/my-payroll/)
})
test('teacher feedback summary renders no respondent identity or private resolution', async () => {
  const h = harness({ has_role: true, teacher_feedback_summary: [{ month: '2026-09-01', response_count: 4, overall_average: 4.25, respondent_name: 'PRIVATE', resolution_note: 'PRIVATE' }] }, true, null, 'app/operations/teacher/page.tsx')
  const html = await h.render({ tab: 'feedback' })
  assert.match(html, /4 phản hồi/); assert.match(html, /4.25\/5/); assert.doesNotMatch(html, /PRIVATE/)
})
test('off-cycle self-read displays signed delta and never implies cash payout', async () => {
  const h = harness({ own_payroll_off_cycle_corrections: [{ correction_id: 'c', currency: 'VND', amount: -150, reason: 'Approved correction', approved_at: '2026-09-16T00:00:00Z' }] }, true, null, 'app/my-payroll/page.tsx')
  const html = await h.render({ view: 'corrections' })
  assert.match(html, /-150 VND/); assert.match(html, /không phải xác nhận đã chi tiền/)
  assert.deepEqual(h.calls.map(c => c.name), ['own_payroll_off_cycle_corrections'])
})
test('feedback action delegates identity and eligibility to the canonical RPC', async () => {
  const h = harness(), form = new FormData()
  for (const [key, value] of Object.entries({ student: student.id, session: student.id, respondent: 'PARENT', rating: '4', comment: 'Helpful lesson', teacher_id: 'forged', respondent_user_id: 'forged' })) form.set(key, value)
  await assert.rejects(h.action()(form), /success=feedback/)
  assert.deepEqual(h.calls, [{ name: 'submit_lesson_feedback', args: { p_student_id: student.id, p_session_id: student.id, p_respondent_type: 'PARENT', p_overall: 4, p_comment: 'Helpful lesson', p_reasons: [] } }])
})
test('feedback reasons outside the rating band never reach the database', async () => {
  const h = harness(), form = new FormData()
  for (const [key, value] of Object.entries({ student: student.id, session: student.id, respondent: 'PARENT', rating: '4' })) form.set(key, value)
  form.append('reason', 'CONTENT_UNCLEAR')
  await assert.rejects(h.action()(form), /feedback_invalid/)
  assert.equal(h.calls.length, 0)
})
test('feedback invalid ratings never reach the database mutation', async () => {
  const h = harness(), form = new FormData()
  for (const [key, value] of Object.entries({ student: student.id, session: student.id, respondent: 'PARENT', rating: '6' })) form.set(key, value)
  await assert.rejects(h.action()(form), /feedback_invalid/)
  assert.equal(h.calls.length, 0)
})
test('credit page keeps unapplied credit separate and provides no automatic allocation', async () => {
  const h = harness({ portal_students: [student], student_customer_credits: [{ credit_id: 'c', currency: 'VND', original_amount: 1000000, applied_amount: 400000, refunded_amount: 0, remaining_credit: 600000, voided_amount: 0 }] })
  const html = await h.render({ student: student.id, tab: 'credit' })
  assert.match(html, /600000 VND/); assert.match(html, /chưa tự động phân bổ/)
  assert.equal(h.calls[1].name, 'student_customer_credits')
  assert.doesNotMatch(html, /name="amount"/)
})
test('approved report renders snapshot sections without private or unexpected summary fields', async () => {
  const h = harness({ portal_students: [student], student_approved_reports: [{ report_id: 'r', period_start: '2026-08-01', period_end: '2026-08-31', snapshot: {
    admin_note: 'SECRET-ADMIN', teacher_summary: { general_comment: 'Approved comment', private_note: 'SECRET-SUMMARY' },
    attendance: { scheduled: 4, attended: 3, absent: 1, excused: 0, unmarked: 0, rate: 75 },
    academic: { curriculum: 'Piano', current_grade: 'Grade 2', subjects: [{ grade: 'Grade 2', name: 'Direct subject', is_required: true, status: 'PASS', completion_rule: 'DIRECT_ASSESSMENT', components: [{ name: 'Should not render', status: 'NOT_STARTED' }] }] },
    journals: { count: 1, excerpts: [{ content: 'Approved journal', homework: 'Practice scales' }] },
  } }] })
  const html = await h.render({ student: student.id, tab: 'reports' })
  assert.match(html, /Approved comment/); assert.match(html, /75%/); assert.match(html, /Grade 2/); assert.match(html, /Approved journal/)
  assert.doesNotMatch(html, /SECRET|Should not render|<form[^>]*>.*Duyệt/)
})
