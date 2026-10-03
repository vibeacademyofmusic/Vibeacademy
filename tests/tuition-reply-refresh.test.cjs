const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

test('open screen refreshes every 20 seconds while visible and on return; unmount cleans up', () => {
  const events = new Map()
  let tick, cleanup, refreshes=0, cleared=false
  const windowMock = { setInterval(fn,ms) { assert.equal(ms,20000); tick=fn; return 7 }, clearInterval(id) { assert.equal(id,7); cleared=true } }
  const documentMock = { visibilityState:'visible', addEventListener(name,fn) { events.set(name,fn) }, removeEventListener(name,fn) { assert.equal(events.get(name),fn); events.delete(name) } }
  const loaded = {exports:{}}
  const source=ts.transpileModule(fs.readFileSync('app/admin/tuition/reminders/ReplySyncRefresh.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','exports','window','document',source)(name=>name==='react'?{useEffect(fn){cleanup=fn()}}:{useRouter(){return {refresh(){refreshes++}}}},loaded.exports,windowMock,documentMock)
  assert.equal(loaded.exports.ReplySyncRefresh(),null)
  tick(); assert.equal(refreshes,1)
  documentMock.visibilityState='hidden'; tick(); assert.equal(refreshes,1)
  documentMock.visibilityState='visible'; events.get('visibilitychange')(); assert.equal(refreshes,2)
  cleanup(); assert.ok(cleared); assert.equal(events.size,0)
})
