const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const model = require('../app/admin/coordination/calendar-model.ts')
const moduleObject = { exports: {} }
const source = ts.transpileModule(fs.readFileSync('app/admin/coordination/calendar-data.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
vm.runInNewContext(source, { exports: moduleObject.exports, module: moduleObject, require: name => { if(name==='./calendar-model') return model; throw Error(name) }, crypto: globalThis.crypto, console: { error() {} }, Date })
const { loadCalendar } = moduleObject.exports
const valid = {version:1,monday:'2026-10-26',snapshot_at:'2026-10-26T08:00:00Z',branches:[],rows:[]}

test('loader rejects invalid input without querying', async () => {
  const db = { rpc: () => { throw Error('must not query') } }
  assert.equal((await loadCalendar(db,'2026-02-30','')).data,null)
  assert.equal((await loadCalendar(db,'2026-10-26','not-a-branch')).data,null)
})
test('database error, missing migration and malformed payload never become zero', async () => {
  for (const result of [{data:null,error:{code:'PGRST202'}},{data:null,error:null},{data:{rows:[]},error:null}]) {
    const output=await loadCalendar({rpc:async()=>result},'2026-10-26','')
    assert.equal(output.data,null); assert.ok(output.error); assert.ok(output.reference)
  }
})
test('a successful empty snapshot stays distinct and is scoped to the requested week', async () => {
  const db={rpc:async()=>({data:valid,error:null})}
  assert.equal((await loadCalendar(db,'2026-10-26','')).data.rows.length,0)
  assert.equal((await loadCalendar(db,'2026-11-03','')).data,null)
})
