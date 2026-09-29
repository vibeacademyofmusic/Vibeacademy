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
  invoice: null,
  recipients: [{ id: 'p1', name: 'Phụ huynh A', phone: '0901234567', canViewFinance: true, isPrimary: true, active: true }],
  templateApproved: false,
  consentGranted: false,
}

test('one tuition template does not turn package price into debt or send early', () => {
  const { evaluateTuitionNotice } = load()
  const early = evaluateTuitionNotice(base)
  assert.equal(early.status, 'Sắp đến kỳ cập nhật')
  assert.ok(early.blockers.some(item => item.includes('Chưa đến khoảng nhắc')))
  assert.equal(early.parameters, null)
  assert.match(early.preview, /Kính gửi Quý phụ huynh và nhạc sinh/)
  assert.match(early.preview, /Xin vui lòng phản hồi duy trì chương trình học và gia hạn học phí\?/)
  assert.match(early.preview, /Nút phản hồi: Tiếp tục học/)
  assert.match(early.preview, /Nút phản hồi: Dừng học/)
  assert.doesNotMatch(early.preview, /Bấm vào đây để phản hồi|Xem học phí|5\.500\.000|amount_due/)
  const debt = evaluateTuitionNotice({ ...base, eventCode: 'BALANCE_50_V1', today: '2026-10-29', invoice: null, templateApproved: true, consentGranted: true })
  assert.equal(debt.status, null)
  assert.ok(debt.blockers.some(item => item.includes('không được dùng làm số nợ')))
})

test('overdue issued balance and multiple parents stay distinct', () => {
  const { evaluateTuitionNotice } = load()
  const overdue = evaluateTuitionNotice({
    ...base,
    eventCode: 'BALANCE_50_V1',
    windowStart: '2026-09-01',
    windowEnd: '2026-09-15',
    today: '2026-09-29',
    invoice: { status: 'ISSUED', outstanding: 1000 },
    templateApproved: true,
    consentGranted: true,
  })
  assert.equal(overdue.status, 'Học phí quá hạn')
  assert.equal(overdue.parameters.tuition_status, 'Học phí quá hạn')
  assert.equal(Object.hasOwn(overdue.parameters, 'amount_due_display'), false)
  const many = evaluateTuitionNotice({
    ...base,
    today: '2026-10-29',
    recipients: [
      { id: 'p1', name: 'Phụ huynh A', phone: '0901234567', canViewFinance: true, isPrimary: false, active: true },
      { id: 'p2', name: 'Phụ huynh B', phone: '0901234999', canViewFinance: true, isPrimary: false, active: true },
    ],
    templateApproved: true,
    consentGranted: true,
  })
  assert.equal(many.recipient, null)
  assert.ok(many.blockers.some(item => item.includes('không gửi cho tất cả')))
})

test('confirmation records a local error and does not claim Zalo delivery', () => {
  const actions = fs.readFileSync('app/admin/tuition/reminders/actions.ts', 'utf8')
  assert.match(actions, /sendZaloTemplateMessage/)
  assert.match(actions, /begin_tuition_zalo_send/)
  assert.match(actions, /finish_tuition_zalo_send/)
  assert.match(actions, /p_outcome: 'ERROR'/)
  assert.equal(actions.includes("p_outcome: 'SENT'"), false)
})

test('send status is chưa gửi, đã gửi, or lỗi', () => {
  const { zaloAttemptLabel, evaluateTuitionNotice } = load()
  assert.equal(zaloAttemptLabel(null), 'Chưa gửi')
  assert.equal(zaloAttemptLabel('SENT'), 'Đã gửi')
  assert.equal(zaloAttemptLabel('FAILED'), 'Gửi lỗi')
  const ready = evaluateTuitionNotice({
    ...base,
    today: '2026-09-29',
    windowStart: '2026-09-29',
    windowEnd: '2026-10-28',
    consentGranted: true,
  })
  assert.equal(ready.attemptAllowed, true)
  assert.equal(ready.status, 'Sắp đến kỳ cập nhật')
  assert.ok(ready.deliveryBlockers.some(item => item.includes('bản nháp')))
})
