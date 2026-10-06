const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadFile(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = { exports: {} }
  const localRequire = (name) => {
    if (!name.startsWith('.')) return require(name)
    const target = path.resolve(path.dirname(file), name)
    return loadFile(fs.existsSync(target + '.ts') ? target + '.ts' : target, cache)
  }
  new Function('exports', 'require', 'module', code)(loaded.exports, localRequire, loaded)
  cache.set(file, loaded.exports)
  return loaded.exports
}

function load() {
  return loadFile('lib/integrations/zalo/tuition-notice.ts')
}

const base = {
  reminderStatus: 'PENDING',
  eventCode: 'RENEWAL_V1',
  windowStart: '2026-10-29',
  windowEnd: '2026-11-28',
  today: '2026-09-29',
  periodStart: '2026-08-29',
  periodEnd: '2026-11-28',
  studentName: 'TEST Nhắc học phí',
  studentCode: 'TEST-NHAC-HP',
  branchName: 'Vibe Academy Cần Thơ',
  packageAmount: 1500000,
  currency: 'VND',
  recipients: [{ id: 'p1', name: 'Phụ huynh A', phone: '0901234567', canViewFinance: true, isPrimary: true, active: true }],
  selectedRecipientId: null,
  consentParentIds: [],
  templateReady: false,
  scheduledDispatchEnabled: false,
}

test('approved template uses package tuition and does not send early', () => {
  const { evaluateTuitionNotice } = load()
  const early = evaluateTuitionNotice(base)
  assert.ok(early.blockers.some(item => item.includes('Chưa đến khoảng nhắc')))
  assert.equal(early.parameters, null)
  assert.equal(early.ctaUrl, null)
  assert.match(early.preview, /Học phí gia hạn gói 3 tháng là 1500000 đồng/)
  assert.match(early.preview, /Hạn thanh toán: 28112026/)
  assert.match(early.preview, /Nút phản hồi: Tiếp tục học/)
  assert.match(early.preview, /Nút phản hồi: Liên hệ/)
  assert.match(early.preview, /Không có đường dẫn/)
  assert.match(early.replacementPreview, /Nút phản hồi: Liên hệ/)
  assert.doesNotMatch(early.replacementPreview, /Nút phản hồi: Dừng học/)
  assert.match(early.replacementPreview, /chưa được duyệt/)
  assert.doesNotMatch(early.preview, /amount_due|secure_payment|outstanding/)
  const debt = evaluateTuitionNotice({
    ...base,
    eventCode: 'BALANCE_50_V1',
    today: '2026-10-29',
    packageAmount: 1000,
    consentParentIds: ['p1'],
    templateReady: true,
  })
  assert.equal(debt.parameters, null)
  assert.ok(debt.blockers.some(item => item.includes('Không điền số nợ')))
})

test('parameter limits, missing consent, and the wrong recipient stay blocked', () => {
  const { evaluateTuitionNotice, tuitionTemplateParameters } = load()
  const longName = evaluateTuitionNotice({
    ...base,
    today: '2026-10-29',
    consentParentIds: ['p1'],
    templateReady: true,
    studentName: 'Học viên có tên dài hơn ba mươi ký tự',
  })
  assert.equal(longName.parameters, null)
  assert.ok(longName.blockers.some(item => item.includes('student_name dài hơn 30')))
  const missingConsent = evaluateTuitionNotice({ ...base, today: '2026-10-29', templateReady: true })
  assert.ok(missingConsent.blockers.some(item => item.includes('chưa có sự đồng ý')))
  const wrong = evaluateTuitionNotice({ ...base, today: '2026-10-29', selectedRecipientId: 'other', consentParentIds: ['p1'], templateReady: true })
  assert.equal(wrong.recipient, null)
  assert.ok(wrong.blockers.some(item => item.includes('không còn quyền xem học phí')))
  const otherConsent = evaluateTuitionNotice({
    ...base,
    today: '2026-10-29',
    templateReady: true,
    consentParentIds: ['p2'],
    recipients: [
      { id: 'p1', name: 'Phụ huynh A', phone: '0901234567', canViewFinance: true, isPrimary: true, active: true },
      { id: 'p2', name: 'Phụ huynh B', phone: '0901234999', canViewFinance: true, isPrimary: false, active: true },
    ],
  })
  assert.equal(otherConsent.recipient.id, 'p1')
  assert.ok(otherConsent.blockers.some(item => item.includes('Người nhận này chưa có sự đồng ý')))
  const exact = tuitionTemplateParameters({ ...base, customerName: 'Phụ huynh A' })
  assert.deepEqual(Object.keys(exact.parameters), ['student_name', 'student_code', 'days_left', 'period', 'amount', 'due_date'])
  assert.equal(exact.parameters.amount, '1500000')
  assert.equal(exact.parameters.due_date, '28112026')
  assert.equal(exact.parameters.period, '29/08/2026-28/11/2026')
})

test('multiple parents are not all selected', () => {
  const { evaluateTuitionNotice } = load()
  const many = evaluateTuitionNotice({
    ...base,
    today: '2026-10-29',
    consentParentIds: ['p1', 'p2'],
    templateReady: true,
    recipients: [
      { id: 'p1', name: 'Phụ huynh A', phone: '0901234567', canViewFinance: true, isPrimary: false, active: true },
      { id: 'p2', name: 'Phụ huynh B', phone: '0901234999', canViewFinance: true, isPrimary: false, active: true },
    ],
  })
  assert.equal(many.recipient, null)
  assert.equal(many.parameters, null)
  assert.ok(many.blockers.some(item => item.includes('không gửi cho tất cả')))
})

test('confirmation records a local error and does not claim Zalo delivery', () => {
  const actions = fs.readFileSync('app/admin/tuition/reminders/actions.ts', 'utf8')
  assert.match(actions, /sendManualTuitionZalo/)
  assert.equal(actions.includes('sendAuthorizedTuitionTest'), false)
  assert.match(actions, /tuitionSendBeginMessage/)
  assert.equal(actions.includes("'success'"), true)
  assert.equal(actions.includes('Chưa gửi — chưa thể phản hồi.\', \'success\''), false)
  assert.match(actions, /begin_tuition_zalo_send/)
  assert.match(actions, /finish_tuition_zalo_send/)
  assert.match(actions, /sent.state === 'ACCEPTED'/)
  assert.match(actions, /p_outcome: sent\.state === 'ACCEPTED' \? 'SENT' : 'ERROR'/)
  assert.match(actions, /templateId: notice\.templateId/)
  assert.match(actions, /sent.state === 'AMBIGUOUS'/)
  assert.equal(actions.includes('fetch('), false)
  const outbound = fs.readFileSync('lib/integrations/zalo/outbound.ts', 'utf8')
  assert.equal(outbound.includes('fetch('), false)
  const migration = fs.readFileSync('supabase/migrations/20260930160000_zalo_tuition_template_643118.sql', 'utf8')
  assert.match(migration, /provider_template_id = '643118'/)
  assert.match(migration, /enabled = false/)
  assert.equal(migration.includes("provider_template_id = '640377'"), false)
  assert.match(migration, /Tuition Zalo already prepared/)
})

test('begin failures name the blocked check and a timeout is not success', () => {
  const { tuitionSendBeginMessage } = load()
  assert.match(tuitionSendBeginMessage('Tuition Zalo already prepared'), /Không gửi trùng/)
  assert.match(tuitionSendBeginMessage('Tuition Zalo consent required'), /đồng ý/)
  assert.match(tuitionSendBeginMessage('Tuition Zalo window has not started'), /Chưa đến khoảng nhắc/)
  assert.match(tuitionSendBeginMessage('SUPER_ADMIN role required'), /không có quyền/)
  assert.match(tuitionSendBeginMessage('unknown'), /Không tạo được lần gửi/)
  const actions = fs.readFileSync('app/admin/tuition/reminders/actions.ts', 'utf8')
  assert.match(actions, /sent\.state === 'AMBIGUOUS'/)
  assert.match(actions, /sent\.state === 'ACCEPTED' \? 'SENT' : 'ERROR'/)
})

test('send status is chưa gửi, đã gửi, or lỗi', () => {
  const { zaloAttemptLabel, evaluateTuitionNotice } = load()
  assert.equal(zaloAttemptLabel(null), 'Chưa gửi')
  assert.equal(zaloAttemptLabel('SENT'), 'Đã gửi')
  assert.equal(zaloAttemptLabel('FAILED'), 'Gửi thất bại')
  const ready = evaluateTuitionNotice({
    ...base,
    today: '2026-09-29',
    windowStart: '2026-09-29',
    windowEnd: '2026-10-28',
    periodEnd: '2026-10-28',
    consentParentIds: ['p1'],
    templateReady: true,
  })
  assert.equal(ready.attemptAllowed, true)
  assert.equal(ready.parameters.amount, '1500000')
  assert.equal(ready.ctaUrl, null)
  assert.equal(ready.priceVnd, 400)
  assert.ok(ready.deliveryBlockers.some(item => item.includes('Gửi theo lịch đang tắt')))
  assert.equal(ready.deliveryBlockers.some(item => item.includes('Lịch gửi thật đang bật')), false)
})
