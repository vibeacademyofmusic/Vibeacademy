const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected } = require('./helpers/finance-operations.cjs')
const context = harness().load('../tuition/reminders/dialog-context.ts')
function form(values) { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f }
test('dialog close preserves filters and removes selected panels/messages', () => {
  const href = context.reminderReturnHref({ branch:id(1), page:'3', reply:'CONTACT', renew:id(2), error:'old' })
  const url = new URL(href,'http://local'); assert.equal(url.searchParams.get('page'),'3'); assert.equal(url.searchParams.get('branch'),id(1)); assert.equal(url.searchParams.get('reply'),'CONTACT'); assert.equal(url.searchParams.has('renew'),false); assert.equal(url.searchParams.has('error'),false)
})
test('action failure retains selected dialog, parent and list filters without allowing open redirects', () => {
  const f=form({return_context:`/admin/tuition/reminders?branch=${id(1)}&page=3&zalo=${id(2)}&parent=${id(3)}&evil=x`})
  const url=new URL(context.reminderActionHref(f,'Lỗi'),'http://local'); assert.equal(url.searchParams.get('zalo'),id(2)); assert.equal(url.searchParams.get('parent'),id(3)); assert.equal(url.searchParams.get('page'),'3'); assert.equal(url.searchParams.has('evil'),false); assert.equal(url.searchParams.get('error'),'Lỗi')
  for (const raw of ['https://evil.test','//evil.test','/admin/tuition/reminders-other?zalo=x']) assert.equal(new URL(context.reminderActionHref(form({return_context:raw}),'Lỗi'),'http://local').pathname,'/admin/tuition/reminders')
})
test('invalid send stays in selected Zalo dialog before any sending RPC', async () => {
  const h=harness(); const actions=h.load('../tuition/reminders/actions.ts')
  const result=await redirected(actions.confirmTuitionZalo,{reminder_id:'invalid',return_context:'/admin/tuition/reminders?page=2&zalo=invalid'})
  assert.equal(result.searchParams.get('page'),'2'); assert.equal(result.searchParams.get('zalo'),'invalid'); assert.ok(result.searchParams.get('error')); assert.equal(h.calls.length,0)
})
test('invalid resolution retains process dialog and filters without writing records', async () => {
  const h=harness(); const actions=h.load('../tuition/reminders/actions.ts')
  const result=await redirected(actions.resolveReminder,{reminder_id:id(2),status:'PAID',reason:'invalid',return_context:`/admin/tuition/reminders?page=2&process=${id(2)}`})
  assert.equal(result.searchParams.get('process'),id(2)); assert.equal(result.searchParams.get('page'),'2'); assert.ok(result.searchParams.get('error')); assert.equal(h.calls.filter(c=>c.rpc==='resolve_tuition_reminder').length,0)
})

test('all selected operations render inside the shared video dialog, history is separate and no inline editor remains', async () => {
  const { renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
  const row={id:id(2),enrollment_tuition_id:id(10),student_id:id(11),window_start:'2026-10-01',window_end:'2026-10-31',status:'PENDING',starts_on:'2026-08-01',effective_ends_on:'2026-10-31',plan_name_snapshot:'3 tháng',branch_name_snapshot:'Cần Thơ',amount:5500000,currency:'VND',full_name:'TEST Dialog',student_code:'TEST-DIALOG'}
  for (const [panel,title] of [['renew','Tạo gia hạn học phí'],['zalo','Gửi thông báo học phí'],['history','Lịch sử Zalo'],['process','Xử lý nhắc học phí'],['auto','Zalo tự động']]) {
    const h=harness({tuition_reminder_operations:[row]})
    const html=renderToStaticMarkup(await h.load('../tuition/reminders/page.tsx').default({searchParams:Promise.resolve({[panel]:panel==='auto'?'1':id(2),branch:id(3),page:'2'})}))
    assert.match(html,/<dialog[^>]*aria-labelledby=/); assert.ok(html.includes(title),title); assert.equal((html.match(/<dialog/g)||[]).length,1)
    assert.ok(html.includes('Đóng cửa sổ'))
    if(panel==='history') { assert.ok(html.includes('Lịch sử gửi')); assert.equal(html.includes('Xác nhận gửi cho học viên này'),false) }
    if(panel==='renew') { assert.ok(html.includes('name="return_context"')); assert.ok(html.includes('name="starts_on"')); assert.ok(html.includes('name="payment_option"')) }
  }
})
test('unavailable selected reminder is an error inside a dialog, not silently hidden',async()=>{
  const {renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
  for(const key of ['renew','zalo','history','process']) {
    const h=harness();const html=renderToStaticMarkup(await h.load('../tuition/reminders/page.tsx').default({searchParams:Promise.resolve({[key]:id(2)})}))
    assert.match(html,/<dialog/);assert.match(html,/role="alert"/);assert.ok(html.includes('Không tìm thấy'))
  }
})
