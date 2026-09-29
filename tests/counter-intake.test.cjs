const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function compile(file, mocks) {
  const m = { exports: {} }
  const dir = path.dirname(file)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(n => {
    if (n in mocks) return mocks[n]
    if (n.startsWith('.')) {
      const resolved = path.resolve(dir, n)
      const tsFile = fs.existsSync(`${resolved}.ts`) ? `${resolved}.ts` : fs.existsSync(`${resolved}.tsx`) ? `${resolved}.tsx` : null
      if (tsFile) return compile(tsFile, mocks)
    }
    return require(n)
  }, m, m.exports)
  return m.exports
}

const { homeAddress, isOver18, normalizeVnPhone, addCalendarYears } = compile('app/admin/business/registrations/intake.ts', {})
const { CounterForm } = compile('app/admin/business/registrations/new/CounterForm.tsx', {
  '../actions': { createRegistration: () => {}, updateRegistrationIntake: () => {} },
  '../workspace.module.css': new Proxy({}, { get: (_target, key) => String(key) }),
})

function actions() {
  const calls = []
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: 'synthetic' } } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: 'record-id', error: null } } }
  return { calls, actions: compile('app/admin/business/registrations/actions.ts', {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: url => { throw Object.assign(Error('redirect'), { url }) } },
    '@/lib/supabase/server': { createClient: async () => client },
    '@supabase/supabase-js': {},
    '@/lib/integrations/momo/signature': {},
    '@/lib/integrations/payos/client': {},
  }) }
}

async function submit(action, data) {
  const form = new FormData()
  for (const [key, value] of Object.entries(data)) form.set(key, value)
  await assert.rejects(action(form), error => !!error.url)
}

const base = {
  request_id: '44444444-4444-4444-8444-444444444444',
  branch_id: '33333333-3333-4333-8333-333333333333',
  student_name: 'Synthetic Student',
  student_date_of_birth: '2014-08-08',
  student_over_18: 'no',
  parent_name: 'Synthetic Parent',
  parent_phone: '0900000000',
  zalo_phone: '0900000001',
  home_address: '12 Duong Thu',
  curriculum_id: '11111111-1111-4111-8111-111111111111',
  level_id: '22222222-2222-4222-8222-222222222222',
}

test('over 18 means the 18th birthday has passed, not the birthday itself', () => {
  const today = '2026-09-29'
  assert.equal(isOver18('2008-09-29', today), false)
  assert.equal(isOver18('2008-09-28', today), true)
  assert.equal(addCalendarYears('2008-02-29', 18), '2026-02-28')
  assert.equal(isOver18('2008-02-29', '2026-02-28'), false)
  assert.equal(isOver18('2008-02-29', '2026-03-01'), true)
})

test('address and phone rules reject blanks and letters and normalize the same way', () => {
  assert.equal(homeAddress('   '), null)
  assert.equal(homeAddress('  12   Duong   Thu '), '12 Duong Thu')
  assert.equal(homeAddress('x'.repeat(301)), null)
  assert.equal(normalizeVnPhone('09ab000000'), null)
  assert.equal(normalizeVnPhone('0900 000 001'), '84900000001')
  assert.equal(normalizeVnPhone('+84 900 000 001'), '84900000001')
})

test('new counter form starts unchecked, requires the Zalo number and address, and has no subject', () => {
  const html = renderToStaticMarkup(React.createElement(CounterForm, { branches: [{ id: 'b', name: 'Quầy' }], lead: null, curriculums: [], levels: [], today: '2026-09-29' }))
  assert.match(html, /Trên 18 tuổi/)
  assert.match(html, /Số điện thoại cung cấp là số Zalo/)
  assert.match(html, /Tôi đồng ý nhận thông báo đăng ký, học tập và thanh toán qua Zalo\./)
  assert.match(html, /name="home_address"/)
  assert.match(html, /name="zalo_phone"/)
  assert.match(html, /name="student_over_18" value="no"/)
  assert.doesNotMatch(html, /name="subject_id"/)
  assert.doesNotMatch(html, /name="consent_method"/)
  assert.doesNotMatch(html, /checked=""/)
})

test('reopening a draft shows saved consent without checking the box or inheriting a new number', () => {
  const saved = { id: 'app', version: 2, student_over_18: false, parent_name: 'Synthetic Parent', parent_phone: '84900000000', student_date_of_birth: '2014-08-08', home_address: '12 Duong Thu', zalo_phone: '84900000001', curriculum_id: 'c', level_id: 'l' }
  const html = renderToStaticMarkup(React.createElement(CounterForm, {
    branches: [{ id: 'b', name: 'Quầy' }], lead: null, curriculums: [{ id: 'c', name: 'Piano' }], levels: [{ id: 'l', name: 'Pre', curriculum_id: 'c' }], today: '2026-09-29',
    existing: saved, consentPhone: '84900000001',
  }))
  assert.match(html, /Đã ghi nhận đồng ý cho số Zalo đang lưu/)
  assert.match(html, /name="zalo_phone"[^>]*value="84900000001"/)
  assert.match(html, /name="home_address"/)
  assert.doesNotMatch(html, /name="phone_consent"[^>]*checked/)
  const changed = renderToStaticMarkup(React.createElement(CounterForm, {
    branches: [{ id: 'b', name: 'Quầy' }], lead: null, curriculums: [], levels: [], today: '2026-09-29',
    existing: { ...saved, zalo_phone: '84900000009' }, consentPhone: '84900000001',
  }))
  assert.match(changed, /Đổi số Zalo không giữ đồng ý/)
  assert.doesNotMatch(changed, /Đã ghi nhận đồng ý cho số Zalo đang lưu/)
})

test('collapsed over-18 form still submits the parent values already entered', () => {
  const html = renderToStaticMarkup(React.createElement(CounterForm, {
    branches: [{ id: 'b', name: 'Quầy' }], lead: null, curriculums: [], levels: [], today: '2026-09-29',
    existing: { id: 'app', version: 2, student_over_18: true, parent_name: 'Kept Parent', parent_phone: '84900000000', student_date_of_birth: '2000-01-01', home_address: '12 Duong Thu', zalo_phone: '84900000001' },
  }))
  assert.match(html, /name="parent_name" value="Kept Parent"/)
  assert.match(html, /name="parent_phone" value="84900000000"/)
  assert.match(html, /name="student_over_18" value="yes"/)
  assert.doesNotMatch(html, /Phụ huynh \/ người giám hộ/)
})

test('over 18 without a parent is accepted by the action', async () => {
  const h = actions()
  await submit(h.actions.createRegistration, { ...base, student_date_of_birth: '2000-01-01', student_over_18: 'yes', parent_name: '', parent_phone: '' })
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].args.p_over_18, true)
  assert.equal(h.calls[0].args.p_parent_name, '')
  assert.equal(h.calls[0].args.p_subject, null)
})

test('a minor without a parent is rejected before the RPC', async () => {
  const h = actions()
  await submit(h.actions.createRegistration, { ...base, parent_name: '', parent_phone: '' })
  assert.equal(h.calls.length, 0)
})

test('blank address, letter phone, and a forged source never reach the RPC', async () => {
  for (const patch of [{ home_address: '   ' }, { zalo_phone: '09ab000001' }, { parent_phone: 'abc' }]) {
    const h = actions()
    await submit(h.actions.createRegistration, { ...base, ...patch })
    assert.equal(h.calls.length, 0)
  }
})

test('unchecked consent still saves and does not claim consent', async () => {
  const h = actions()
  await submit(h.actions.createRegistration, base)
  assert.equal(h.calls[0].args.p_consent, false)
  assert.equal(h.calls[0].args.p_consent_method, '')
  assert.equal(h.calls[0].args.p_zalo_phone, '84900000001')
})

test('checked consent uses the counter source and the Zalo number, not the parent number', async () => {
  const h = actions()
  await submit(h.actions.createRegistration, { ...base, phone_consent: 'yes', consent_method: 'WRITTEN' })
  assert.equal(h.calls[0].args.p_consent, true)
  assert.equal(h.calls[0].args.p_consent_method, 'IN_PERSON')
  assert.equal(h.calls[0].args.p_zalo_phone, '84900000001')
  assert.notEqual(h.calls[0].args.p_zalo_phone, h.calls[0].args.p_parent_phone)
})
