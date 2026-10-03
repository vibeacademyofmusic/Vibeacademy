const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const code = ts.transpileModule(fs.readFileSync('app/admin/business/reports/model.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const compiled = { exports: {} }
new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
const model = compiled.exports

test('cohort rates stay empty when the denominator is zero', () => {
  assert.equal(model.cohortRate(0, 0), null)
  assert.equal(model.formatRate(null), 'Chưa đủ dữ liệu')
  assert.equal(model.cohortRate(1, 4), 0.25)
})

test('missing or zero budget is not displayed as a cost', () => {
  assert.equal(model.costPer(null, 3), null)
  assert.equal(model.costPer(0, 3), null)
  assert.equal(model.costPer(300, 0), null)
  assert.equal(model.formatCost(null), 'Chưa có dữ liệu chi phí')
  assert.equal(model.costPer(300, 3), 100)
})
