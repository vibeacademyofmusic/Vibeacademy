/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test'),ts=require('typescript')
const output=ts.transpileModule(fs.readFileSync('app/admin/business/crm/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const loaded={exports:{}}
new Function('module','exports','require',output)(loaded,loaded.exports,()=>({redirect:url=>url}))
test('legacy CRM redirect preserves repeated parameters, search and lifecycle tabs',async()=>{
 const url=await loaded.exports.default({searchParams:Promise.resolve({tab:'admission',source:['PHONE','ZALO'],q:'Nguyễn',page:'2'})})
 const parsed=new URL(url,'http://localhost:3000')
 assert.equal(parsed.pathname,'/admin/business/registrations')
 assert.equal(parsed.searchParams.get('workspace'),'crm')
 assert.equal(parsed.searchParams.get('tab'),'admission')
 assert.deepEqual(parsed.searchParams.getAll('source'),['PHONE','ZALO'])
 assert.equal(parsed.searchParams.get('q'),'Nguyễn')
 assert.equal(parsed.searchParams.get('page'),'2')
})
test('CRM filter retains workspace and counter explicitly selects academic subject',()=>{
 assert.match(fs.readFileSync('app/admin/business/crm/CrmContent.tsx','utf8'),/name="workspace" value="crm"/)
 assert.match(fs.readFileSync('app/admin/business/registrations/new/CounterForm.tsx','utf8'),/name="subject_id" required/)
 assert.match(fs.readFileSync('app/admin/business/registrations/actions.ts','utf8'),/p_subject: subjectId/)
})
