import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, calendarIssues, calendarTotals, localDate, parseCalendarSnapshot, periodFor, slotCapacity, slotCounts, slotState, validCalendarDate } from '../app/admin/coordination/calendar-model.ts'

const student = (id, attendance = null) => ({ enrollment_id: `e-${id}`, student_id: id, name: `Fixture ${id}`, attendance })
const slot = (patch = {}) => ({ id:'s1',session_id:'s1',schedule_id:'sc1',class_id:'c1',roster_date:'2026-10-26',starts_at:'2026-10-26T09:00:00Z',ends_at:'2026-10-26T10:30:00Z',original_starts_at:null,status:'SCHEDULED',occurrence_type:'REGULAR',class_name:'Fixture class',class_code:'P1',branch_id:'b1',branch_name:'Branch 1',curriculum_id:null,program_name:'Piano',room_id:'r1',room_name:'Piano 1',room_capacity:6,class_capacity:6,teacher_id:'t1',teacher_name:'Teacher 1',assignment_type:'PRIMARY',roster:[student('a')],...patch })
const snapshot = rows => ({version:1,monday:'2026-10-26',snapshot_at:'2026-10-26T08:00:00Z',branches:[{id:'b1',name:'Branch 1'}],rows})

test('Vietnam date and period boundaries do not depend on host timezone', () => {
  assert.equal(localDate('2026-10-25T18:00:00Z'), '2026-10-26')
  assert.equal(periodFor('2026-10-26T04:59:00Z'), 'morning')
  assert.equal(periodFor('2026-10-26T05:00:00Z'), 'afternoon')
  assert.equal(periodFor('2026-10-26T10:59:00Z'), 'afternoon')
  assert.equal(periodFor('2026-10-26T11:00:00Z'), 'evening')
  assert.equal(addDays('2026-12-28', 6), '2027-01-03')
})
test('invalid dates and malformed responses never become empty success', () => {
  for (const date of ['2026-02-30','2025-02-29','garbage','1999-12-31']) assert.equal(validCalendarDate(date), false)
  assert.equal(validCalendarDate('2028-02-29'), true)
  for (const bad of [null,{}, {rows:[]},snapshot([slot({roster:null})]),snapshot([slot({status:'UNKNOWN'})]),snapshot([slot({class_capacity:-1})]),snapshot([slot({starts_at:'2026-11-03T09:00:00Z'})]),snapshot([slot(),slot()])]) assert.throws(() => parseCalendarSnapshot(bad))
  assert.equal(parseCalendarSnapshot(snapshot([])).rows.length, 0)
})
test('session visits and distinct students differ; cancelled sessions are excluded', () => {
  const rows = [slot({roster:[student('a'),student('b')]}),slot({id:'s2',roster:[student('a')]}),slot({id:'cancel',status:'CANCELLED',roster:[student('c')]}),slot({id:'plan',session_id:null,status:'PLANNED',roster:[student('d')]})]
  assert.deepEqual(calendarTotals(rows), {sessions:2,planned:1,cancelled:1,visits:4,students:3})
})
test('attendance separates not yet marked from absence and includes late as present', () => {
  assert.deepEqual(slotCounts(slot({roster:[student('a','PRESENT'),student('b','LATE'),student('c','ABSENT'),student('d','EXCUSED'),student('e')]})), {total:5,marked:4,present:2,absent:2,unmarked:1})
})
test('clock time is not evidence that a session was taught', () => {
  assert.equal(slotState(slot(), '2026-10-26T09:15:00Z'), 'Trong khung giờ học')
  assert.equal(slotState(slot(), '2026-10-26T11:00:00Z'), 'Đã qua giờ · chưa hoàn tất')
  assert.equal(slotState(slot({status:'COMPLETED'}), '2026-10-26T11:00:00Z'), 'Đã ghi nhận hoàn tất')
})
test('capacity uses the smaller room/class limit and unknown stays unknown', () => {
  assert.equal(slotCapacity(slot({class_capacity:4})), 4)
  assert.equal(slotCapacity(slot({room_capacity:3})), 3)
  assert.equal(slotCapacity(slot({room_capacity:null})), null)
  assert.ok(calendarIssues([slot({room_capacity:null})], '2026-10-26T11:00:00Z').get('s1').includes('Chưa đủ thông tin sức chứa'))
})
test('room conflicts include other programs but exclude adjacency and cancellation', () => {
  const first = slot()
  const overlap = slot({id:'s2',program_name:'Violin',starts_at:'2026-10-26T10:00:00Z'})
  assert.ok(calendarIssues([first,overlap], '2026-10-26T08:00:00Z').get('s1').includes('Chồng lịch phòng'))
  for (const row of [slot({id:'s2',starts_at:first.ends_at,ends_at:'2026-10-26T12:00:00Z'}),slot({id:'s2',status:'CANCELLED'}),slot({id:'s2',room_id:'r2'})]) assert.equal(calendarIssues([first,row], '2026-10-26T08:00:00Z').get('s1').includes('Chồng lịch phòng'), false)
})
test('a valid empty snapshot differs from an invalid/incomplete roster', () => {
  assert.equal(parseCalendarSnapshot(snapshot([slot({roster:[]})])).rows[0].roster.length, 0)
  assert.throws(() => parseCalendarSnapshot(snapshot([slot({roster:[student('a','UNKNOWN')]})])))
  assert.throws(() => parseCalendarSnapshot(snapshot([slot({roster:[student('a'),student('a')]})])))
})
