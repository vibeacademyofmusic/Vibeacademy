/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness } = require('./helpers/finance-operations.cjs')

test('NAV: class ops lists live under Học viên, rooms stay in Vận hành', () => {
  const { navigationGroups, activeNavigationHref, trainingTabs } = harness().load('../navigation.ts')
  const ops = navigationGroups.find(g => g.name === 'VẬN HÀNH').items
  assert.equal(ops.some(i => i.href === '/admin/students'), true)
  assert.equal(ops.some(i => i.name === 'Vận hành lớp học'), false)
  assert.equal(trainingTabs.some(i => i.href === '/admin/rooms'), true)
  assert.equal(activeNavigationHref('/admin/attendance/abc'), '/admin/students')
  assert.equal(activeNavigationHref('/admin/classes/abc'), '/admin/students')
  assert.equal(activeNavigationHref('/admin/schedule'), '/admin/students')
  assert.equal(activeNavigationHref('/admin/rooms'), '/admin/students')
  assert.equal(activeNavigationHref('/admin/attendance/retention'), '/admin/students')
})

test('UI: workspace modes and mixed-level copy exist', () => {
  const page = fs.readFileSync('app/admin/classes/page.tsx', 'utf8')
  const workspace = fs.readFileSync('app/admin/classes/_ops/Workspace.tsx', 'utf8')
  const model = fs.readFileSync('app/admin/classes/_ops/model.ts', 'utf8')
  assert.match(page, /teaching-shifts/)
  assert.match(workspace, /Ca dạy/)
  assert.match(model, /Tổng quan/)
  assert.match(model, /Ca dạy/)
  assert.match(model, /Lịch học/)
  assert.match(model, /Phòng học/)
  assert.match(model, /Điểm danh/)
  assert.match(workspace, /Đồng bộ buổi học/)
  assert.match(workspace, /chưa có ca học được tạo từ lịch/i)
  assert.match(model, /OUTSIDE_SCOPE/)
  assert.match(model, /formatLevelScope/)
})

test('MIX: enrollment uses Academic Program level and blocks outside scope', () => {
  const enroll = fs.readFileSync('app/admin/classes/[id]/actions.ts', 'utf8')
  const section = fs.readFileSync('app/admin/classes/[id]/StudentEnrollmentSection.tsx', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20260924130000_mixed_level_class_ops_v1.sql', 'utf8')
  assert.match(enroll, /class_enrollment_compatibility/)
  assert.match(section, /class_student_current_level|loadClassRoster/)
  assert.match(section, /Không copy Course\.level_id|Student Academic Program/)
  assert.doesNotMatch(migration, /alter table public\.enrollments[\s\S]{0,200}add column/i)
  assert.doesNotMatch(migration, /add column if not exists level_id/)
  assert.match(migration, /accepted_from_level_id/)
  assert.match(migration, /OUTSIDE_SCOPE/)
})

test('ATT: attendance detail shows Academic Program current Level', () => {
  const page = fs.readFileSync('app/admin/attendance/[id]/page.tsx', 'utf8')
  assert.match(page, /class_student_current_level/)
  assert.match(page, /Trình độ hiện tại/)
  assert.doesNotMatch(page, /courses\.level_id.*as Student|Trình độ lớp/)
})

test('ATT: generator remains idempotent conflict target', () => {
  const fixture = fs.readFileSync('scripts/local-mixed-level-class-fixture.cjs', 'utf8')
  const actions = fs.readFileSync('app/admin/attendance/actions.ts', 'utf8')
  assert.match(fixture, /generate_session_occurrences/)
  assert.match(fixture, /TEST Mixed Guitar/)
  assert.match(fixture, /Grade 5|Pre/)
  assert.match(actions, /generate_session_occurrences/)
  assert.match(actions, /return_to/)
  assert.ok(fs.existsSync('supabase/migrations/20260924130000_mixed_level_class_ops_v1.sql'))
})

test('MIX: course.level_id not treated as student level in ops model', () => {
  const model = fs.readFileSync('app/admin/classes/_ops/model.ts', 'utf8')
  const data = fs.readFileSync('app/admin/classes/_ops/data.ts', 'utf8')
  assert.match(model, /formatLevelScope/)
  assert.match(data, /class_student_current_level/)
  assert.match(data, /accepted_from_level_id/)
})

test('list routes redirect into the Học viên tabs', () => {
  for (const [file, tab] of [
    ['app/admin/schedule/page.tsx', 'schedule'],
    ['app/admin/attendance/page.tsx', 'attendance'],
  ]) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /redirect/)
    assert.match(source, new RegExp(tab))
    assert.match(source, /\/admin\/students/)
  }
  assert.match(fs.readFileSync('app/admin/rooms/page.tsx', 'utf8'), /view="rooms"/)
  assert.ok(fs.existsSync('app/admin/attendance/[id]/page.tsx'))
  assert.ok(fs.existsSync('app/admin/classes/[id]/page.tsx'))
})
