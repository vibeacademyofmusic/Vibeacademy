/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),ts=require('typescript')
const contents=require('../lib/learning/theory-contents.json')
const moduleFile={exports:{}}
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/learning/question-types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleFile,moduleFile.exports)
const {questionTypes,automaticQuestionTypes}=moduleFile.exports
test('Theory metadata matches approved source document fingerprint',()=>{assert.equal(crypto.createHash('sha256').update(fs.readFileSync(contents.source_document)).digest('hex'),contents.source_sha256)})
test('Theory preserves all 87 module identifiers in exact Grade order',()=>{assert.equal(contents.modules.length,87);assert.equal(new Set(contents.modules.map(m=>m.code)).size,87);for(const [grade,count] of [[1,22],[2,16],[3,17],[4,17],[5,15]]){const rows=contents.modules.filter(m=>m.grade===grade);assert.equal(rows.length,count);assert.deepEqual(rows.map(m=>m.sequence),Array.from({length:count},(_,i)=>i+1));assert.ok(rows.every(m=>m.source_pages&&m.title))}})
test('Missing MT5.15 remains source missing and metadata is not learner content',()=>{assert.equal(contents.modules.find(m=>m.code==='MT5.15').source_state,'SOURCE_MISSING');assert.ok(contents.modules.every(m=>!('body' in m)))})
test('Question capability catalogue retains notation and manual types',()=>{assert.equal(questionTypes.length,16);for(const type of ['NOTE_PLACEMENT','RHYTHM_GROUPING','COMPOSITION','MANUAL_REVIEW'])assert.ok(questionTypes.includes(type))})
test('Only structured choice types are advertised as automatic',()=>{assert.deepEqual(automaticQuestionTypes,['SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE'])})
test('Unsupported notation stays outside automatic capabilities',()=>{for(const type of ['NOTE_PLACEMENT','RHYTHM_GROUPING','COMPOSITION'])assert.ok(!automaticQuestionTypes.includes(type))})
test('Browser-side model exposes no independent scoring function',()=>{assert.equal(moduleFile.exports.gradeStructuredAnswer,undefined)})
