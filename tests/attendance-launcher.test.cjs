/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id } = require('./helpers/finance-operations.cjs')
const { renderToStaticMarkup } = require('react-dom/server')
const model = () => harness().load('../attendance/launcher-model.ts')
test('date validation, Vietnam default, and all server-side filters', () => {
 const m = model()
 const f = m.attendanceFilters({ date:'2026-09-28', branch:id(1), class:id(2), teacher:id(3), student:' Minh ', status:'ABSENT', page:'2' })
 assert.deepEqual(f, {date:'2026-09-28',branch:id(1),class:id(2),teacher:id(3),student:'Minh',status:'ABSENT',page:2})
 assert.notEqual(m.attendanceFilters({date:'2026-02-30'}).date,'2026-02-30')
 assert.equal(m.attendanceFilters({branch:'invalid',page:'-5'}).page,1)
})
test('return URL retains filters and rejects external or unrelated destinations', () => {
 const m = model(), href=m.attendanceListHref({date:'2026-09-28',student:'Minh',teacher:id(3)})
 assert.equal(m.attendanceReturn(href),href)
 for (const value of ['https://evil.test','//evil.test','/admin/students?tab=waiting','/admin/students-evil?tab=attendance']) {
  assert.match(m.attendanceReturn(value,'2026-09-28'),/^\/admin\/students\?tab=attendance&date=2026-09-28/)
 }
})
test('launcher renders canonical roster directly and forwards filters to bounded RPC', async () => {
 const h=harness(), calls=[]
 h.db.rpc=async(name,args)=>{ calls.push({name,args}); return {error:null,data:{rows:[{session_id:id(9),class_name:'Piano',class_code:'PI',starts_at:'2026-09-28T11:00:00Z',ends_at:'2026-09-28T12:00:00Z',total:1,marked:0,absent:0,attendance_state:'UNMARKED',student_names:'Minh'}],total:1,branches:[],teachers:[],classes:[]}} }
 const Page=h.load('../attendance/Launcher.tsx').default
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({date:'2026-09-28',branch:id(1),teacher:id(2),student:'Minh',status:'UNMARKED',page:'2'})}))
 assert.match(html,new RegExp(`/admin/attendance/${id(9)}\\?return_to=`))
 assert.doesNotMatch(html,/href="\/admin\/classes\//)
 assert.equal(calls[0].args.p_offset,25)
 assert.equal(calls[0].args.p_branch,id(1));assert.equal(calls[0].args.p_teacher,id(2));assert.equal(calls[0].args.p_student,'Minh')
 assert.equal(calls[0].args.p_date,'2026-09-28');assert.equal(calls[0].args.p_status,'UNMARKED')
 assert.match(html,/Mở điểm danh/)
})
test('empty and failed queries show an explicit state without class detours', async()=>{
 for(const error of [null,{code:'PGRST202'}]) {
 const h=harness();h.db.rpc=async()=>({data:null,error})
 const html=renderToStaticMarkup(await h.load('../attendance/Launcher.tsx').default({searchParams:Promise.resolve({})}))
 assert.match(html,error?/database chưa được cập nhật/:/Không có buổi học phù hợp/)
 assert.doesNotMatch(html,/href="\/admin\/classes/)
 }
})
test('branch roster is readable without exposing admin mutation controls', async () => {
 const h=harness({
  session_occurrences:[{id:id(9),schedule_id:id(8),occurrence_date:'2026-09-28',starts_at:'2026-09-28T11:00:00Z',ends_at:'2026-09-28T12:00:00Z',status:'SCHEDULED',occurrence_type:'REGULAR'}],
  schedules:[{id:id(8),class_id:id(7),timezone:'Asia/Ho_Chi_Minh'}],
  classes:[{id:id(7),branch_id:id(6),code:'TEST',name:'Test class'}],
  branches:[{id:id(6),name:'Test branch'}],
  enrollments:[], // Branch table RLS intentionally hides enrollment rows.
  students:[{id:id(4),full_name:'Test student',student_code:'TEST'}],
 })
 h.db.rpc=async name=>({error:null,data:name==='can_access_session'?true:name==='has_role'?false:name==='attendance_roster_read'?[{enrollment_id:id(5),student_id:id(4),full_name:'Test student',student_code:'TEST',attendance_id:null,status:null,notes:null}]:[]})
 const page=await h.load('../attendance/[id]/page.tsx').default({params:Promise.resolve({id:id(9)}),searchParams:Promise.resolve({})})
 const html=renderToStaticMarkup(page)
 assert.match(html,/Test student/)
 assert.match(html,/Bạn đang xem sổ điểm danh/)
 assert.match(html,/<button[^>]*disabled=""/)
 assert.doesNotMatch(html,/<details|Quản lý buổi học/)
})
test('forged session is denied before any session rows are loaded',async()=>{
 const h=harness();h.db.rpc=async()=>({data:false,error:null})
 await assert.rejects(()=>h.load('../attendance/[id]/page.tsx').default({params:Promise.resolve({id:id(9)}),searchParams:Promise.resolve({})}),{code:'NOT_FOUND'})
 assert.equal(h.calls.length,0)
})
