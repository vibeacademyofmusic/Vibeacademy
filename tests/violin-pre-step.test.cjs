const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const { buildPlan } = require('../lib/academic/violin-pre-step.cjs')
const { buildSql } = require('../scripts/violin-pre-step-sql.cjs')

const plan = buildPlan()

test('violin pre step has two required 50-lesson books and no advertising pages', () => {
  assert.equal(plan.level_code, 'PRE_STEP')
  assert.equal(plan.level_name, 'Pre Step')
  assert.equal(plan.level_type, 'FOUNDATION')
  assert.deepEqual(plan.books.map(book => book.subject_code), ['FT_JOGGERS_B1', 'FT_RUNNERS_B2'])
  for (const book of plan.books) {
    assert.equal(book.is_required, true)
    assert.equal(book.lessons.length, 50)
    const pages = book.lessons.flatMap(lesson => lesson.source_pdf_pages.split('-').map(Number))
    assert.equal(pages.some(page => page >= 18 && page <= 21), false)
    for (const lesson of book.lessons) {
      for (const field of ['learning_objectives', 'classroom_activities', 'homework', 'teacher_notes', 'content_scope']) {
        assert.ok(lesson[field].length > 20, lesson.stable_key)
      }
      assert.match(lesson.teacher_notes, /VIBE biên soạn/)
      assert.doesNotMatch(lesson.homework, /phút|điểm đạt|Practice tempo/)
      assert.match(lesson.classroom_activities, /Chuẩn bị:/)
      assert.match(lesson.classroom_activities, /Đọc và nghe:/)
      assert.match(lesson.classroom_activities, /Chơi có hướng dẫn:/)
      assert.match(lesson.classroom_activities, /Sửa trọng tâm:/)
      assert.match(lesson.classroom_activities, /Ghép phạm vi:/)
    }
  }
  const listen = plan.books[0].lessons.find(lesson => lesson.piece_number === 33)
  const cattle = plan.books[0].lessons.find(lesson => lesson.piece_number === 34)
  assert.ok(listen.sort_order < cattle.sort_order)
  assert.equal(listen.source_pdf_pages, '29')
  assert.equal(cattle.source_pdf_pages, '28')
  assert.equal(plan.books[0].lessons[22].title, 'Off to Paris')
  assert.match(plan.books[0].lessons[22].content_scope, /2nd finger/)
  assert.match(plan.books[0].lessons[33].content_scope, /3rd and 4th fingers/)
  const jingle = plan.books[1].lessons.filter(lesson => lesson.piece_number === 9)
  assert.equal(jingle.length, 2)
  assert.match(jingle[0].teacher_notes, /ô nhịp 1–8/)
  assert.match(plan.books[1].lessons.find(lesson => lesson.part === 'LOWER_STAFF_AND_ENSEMBLE').teacher_notes, /không phải bè chỉ dành cho giáo viên/)
  assert.match(plan.books[0].lessons[0].teacher_notes, /tư thế/)
  assert.match(plan.books[0].lessons[49].teacher_notes, /Final Test/)
})

test('migration keeps manual completion and does not label violin plans as Book B', () => {
  const sql = buildSql()
  assert.match(sql, /'PRE_STEP', 'Pre Step', 0, null, 'FOUNDATION', 'MANUAL'/)
  assert.match(sql, /completion_rule is distinct from ''MANUAL''/)
  assert.match(sql, /VIOLIN_PRE_STEP_SOURCE_CONFLICT/)
  assert.match(sql, /VIOLIN_PRE_STEP_PROGRESS_CHANGED/)
  const page = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/lessons/[itemId]/page.tsx', 'utf8')
  assert.match(page, /VIO_PS_FT1_/)
  assert.match(page, /Giáo án Fiddle Time Joggers/)
  assert.match(page, /Giáo án Fiddle Time Runners/)
})
