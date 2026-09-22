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

test('crm tabs cover the pipeline without exposing raw groups', () => {
  assert.deepEqual(model.tabs.map(tab => tab.label), ['Tất cả', 'Khách hàng mới', 'Tiềm năng', 'Cơ hội', 'Đã chốt', 'Đã mất'])
  assert.deepEqual(model.tabStatuses('new'), ['NEW', 'CONTACTED'])
  assert.deepEqual(model.tabStatuses('potential'), ['QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED'])
  assert.deepEqual(model.tabStatuses('opportunity'), ['PROPOSAL_SENT', 'NEGOTIATING'])
  assert.deepEqual(model.tabStatuses('won'), ['WON'])
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

test('crm errors stay in Vietnamese', () => {
  assert.match(model.crmError('CRM_LEAD_STALE'), /Tải lại/)
  assert.match(model.crmError('CRM_LEAD_ALREADY_CONVERTED'), /đã được gắn/)
  assert.equal(model.crmError('permission denied'), 'Không thực hiện được thao tác.')
})
