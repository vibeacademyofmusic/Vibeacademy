/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('shared student operations primitives exist', () => {
  const ops = fs.readFileSync('app/admin/_components/vibe/operations.tsx', 'utf8')
  const index = fs.readFileSync('app/admin/_components/vibe/index.tsx', 'utf8')
  for (const token of ['OperationsFilterBar', 'OpsTabs', 'OpsMetricLink', 'OpsStatusBadge', 'opsStatusTone', 'buildQuery']) {
    assert.match(ops, new RegExp(token))
    assert.match(index, new RegExp(token))
  }
})

test('students reports and feedback share vibe ops chrome', () => {
  const students = fs.readFileSync('app/admin/students/page.tsx', 'utf8')
  const reports = fs.readFileSync('app/admin/reports/learning/page.tsx', 'utf8')
  const feedback = fs.readFileSync('app/admin/feedback/page.tsx', 'utf8')
  for (const [name, source] of [['students', students], ['reports', reports], ['feedback', feedback]]) {
    assert.match(source, /AppPage/, name)
    assert.match(source, /PageHeader|OperationsFilterBar/, name)
    assert.match(source, /OpsTabs|OpsMetricLink/, name)
  }
  assert.match(students, /Không tìm thấy học viên phù hợp với bộ lọc/)
  assert.match(reports, /Không có báo cáo cần xử lý/)
  assert.match(feedback, /Không có phản hồi cần xử lý/)
  assert.match(feedback, /label: 'Ca dạy'/)
})

test('learning report list migration enriches ops columns', () => {
  const sql = fs.readFileSync('supabase/migrations/20260924120000_student_operations_ux_v1.sql', 'utf8')
  assert.match(sql, /learning_report_list/)
  assert.match(sql, /class_name/)
  assert.match(sql, /current_grade/)
  assert.match(sql, /teacher_names/)
  assert.match(sql, /count_current_student_enrollments/)
  assert.match(sql, /p_class/)
  assert.match(sql, /p_teacher/)
})
