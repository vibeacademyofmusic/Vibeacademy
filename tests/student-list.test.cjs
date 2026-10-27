const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const fs = require('node:fs')
const m = { exports: {} }
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('app/admin/students/student-list.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(m, m.exports)
const { groupStudentRows, loadStudentRows } = m.exports
test('one profile keeps both weekly shifts, while same-name profiles remain distinct', () => {
  const rows = [{student_id:'a',enrollment_id:'monday',name:'An'}, {student_id:'b',enrollment_id:'other',name:'An'}, {student_id:'a',enrollment_id:'wednesday',name:'An'}]
  const groups = groupStudentRows(rows)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].rows.map(r=>r.enrollment_id), ['monday','wednesday'])
})
test('grouping after API pagination keeps a student spanning batch boundaries together', async () => {
  const source = Array.from({length:1001}, (_,i)=>({student_id:String(Math.floor(i/2)),enrollment_id:String(i)}))
  const calls=[]
  const rows=await loadStudentRows(async (offset, limit)=>{calls.push(offset);return source.slice(offset,offset+limit)})
  const groups=groupStudentRows(rows)
  assert.deepEqual(calls,[0,500,1000])
  assert.equal(groups.length,501)
  assert.equal(groups[250].rows.length,2)
  assert.equal(groups.slice(25,50)[0].student_id,'25')
})
test('loading failure is not converted to an empty or partial list', async()=>{
  await assert.rejects(loadStudentRows(async()=>{throw Error('failed')}), /failed/)
})
