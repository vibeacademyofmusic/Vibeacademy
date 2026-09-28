const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const code = ts.transpileModule(fs.readFileSync('app/admin/business/crm/model.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const compiled = { exports: {} }
new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
const model = compiled.exports

test('crm tabs are views of one pipeline', () => {
  assert.deepEqual(model.tabs.map(tab => tab.label), ['Tất cả', 'Khách mới', 'Tiềm năng', 'Cơ hội', 'Đang nhập học', 'Đã chuyển đổi', 'Không tiếp tục'])
  assert.deepEqual(model.tabStatuses('new'), ['NEW', 'CONTACTED'])
  assert.deepEqual(model.tabStatuses('potential'), ['QUALIFIED'])
  assert.deepEqual(model.tabStatuses('opportunity'), ['TRIAL_BOOKED', 'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATING'])
  assert.equal(model.tabStatuses('admission'), null)
  assert.equal(model.tabStatuses('converted'), null)
  assert.equal(model.tabMode('admission'), 'admission')
  assert.equal(model.tabMode('converted'), 'converted')
  assert.deepEqual(model.tabStatuses('lost'), ['LOST'])
  assert.equal(model.tabStatuses('all'), null)
})

test('pipeline actions stay on the adjacent step', () => {
  assert.deepEqual(model.nextSteps.NEW.map(step => step.status), ['CONTACTED', 'LOST'])
  assert.deepEqual(model.nextSteps.NEGOTIATING.map(step => step.status), ['WON', 'LOST'])
  assert.equal(model.nextSteps.WON, undefined)
  assert.equal(model.nextSteps.LOST, undefined)
  assert.equal(model.nextSteps.QUALIFIED[0].label, 'Đặt lịch học thử')
})

test('journey labels use registration and conversion facts', () => {
  assert.equal(model.journeyLabel('NEW', false, false), 'Mới')
  assert.equal(model.journeyLabel('WON', false, true), 'Đang nhập học')
  assert.equal(model.journeyLabel('WON', true, false), 'Đã trở thành học viên')
  assert.equal(model.shownCount(true, 0), '—')
  assert.equal(model.shownCount(false, 0), '0')
  assert.equal(model.shownCount(false, null), '—')
  assert.equal(model.paymentLabel(null), '—')
  assert.equal(model.paymentLabel({ status: 'DRAFT', invoiceId: null, confirmedAt: null }), 'Chưa có hóa đơn')
  assert.equal(model.paymentLabel({ status: 'PAYMENT_PENDING', invoiceId: 'invoice', confirmedAt: null }), 'Chờ thanh toán')
  assert.equal(model.channelStateLabel.NONE, 'Chưa liên kết')
  assert.equal(model.followUpState(null, '2026-09-22'), 'Chưa hẹn')
  assert.equal(model.followUpState('2026-09-21', '2026-09-22'), 'Quá hạn')
})

test('crm workspace does not offer a standalone learning-profile action', () => {
  const page = fs.readFileSync('app/admin/business/crm/CrmContent.tsx', 'utf8')
  const detail = fs.readFileSync('app/admin/business/crm/[id]/page.tsx', 'utf8')
  const navigation = fs.readFileSync('app/admin/navigation.ts', 'utf8')
  assert.match(page, /CRM & Tuyển sinh/)
  assert.match(navigation, /CRM & Tuyển sinh/)
  assert.doesNotMatch(page + detail, /Tạo hồ sơ học tập/)
  assert.match(detail, /Mở hồ sơ học viên/)
  assert.match(detail, /Bắt đầu đăng ký/)
  assert.match(detail, /Hẹn follow-up/)
})
test('crm errors stay in Vietnamese', () => {
  assert.match(model.crmError('CRM_LEAD_STALE'), /Tải lại/)
  assert.match(model.crmError('CRM_LEAD_ALREADY_CONVERTED'), /đã được gắn/)
  assert.equal(model.crmError('permission denied'), 'Không thực hiện được thao tác.')
})
