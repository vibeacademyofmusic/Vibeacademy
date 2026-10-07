const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
  return compiled.exports
}

const model = load('app/admin/programs/model.ts')
const programs = fs.readFileSync('app/admin/programs/page.tsx', 'utf8')
const data = fs.readFileSync('app/admin/programs/data.ts', 'utf8')
const programPage = fs.readFileSync('app/admin/academic/[id]/page.tsx', 'utf8')
const levelPage = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/page.tsx', 'utf8')
const subjectPage = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/page.tsx', 'utf8')
const operator = fs.readFileSync('app/admin/academic/lesson-operator.tsx', 'utf8')
const lessonPage = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/lessons/[itemId]/page.tsx', 'utf8')
const css = fs.readFileSync('app/globals.css', 'utf8')

test('program hierarchy stays Curriculum, Level, Subject, Component, Lesson', () => {
  assert.deepEqual(model.hierarchy, ['Program', 'Level', 'Subject', 'Lesson'])
  assert.match(data, /curriculums/)
  assert.match(data, /curriculum_levels/)
  assert.match(data, /curriculum_subjects/)
  assert.match(data, /curriculum_subject_components/)
  assert.match(data, /curriculum_component_items/)
  assert.doesNotMatch(data, /academic_lessons|lesson_groups/)
})

test('level workspace lists subjects without turning a course into a level', () => {
  assert.match(levelPage, /Môn học/)
  assert.match(levelPage, /Thêm môn học/)
  assert.match(levelPage, /Chỉnh sửa cấp độ/)
  assert.doesNotMatch(levelPage, /Khóa học/)
})

test('one storage component stays a flat lesson list', () => {
  assert.match(operator, /showGroups \? 'Nhóm đánh giá' : 'Lesson'/)
  assert.match(operator, /componentId=\{soleComponent\?\.id\}/)
  assert.doesNotMatch(operator, /Nhóm đánh giá · \{soleComponent/)
})

test('multiple components keep separate lesson lists', () => {
  assert.match(operator, /showComponentGroups/)
  assert.match(operator, /lesson\.component_id === componentId/)
  assert.match(operator, /componentId=\{component\.id\}/)
})

test('lesson breadcrumb includes the assessment group only when it is academic', () => {
  assert.match(lessonPage, /showGroup && owner/)
  assert.match(lessonPage, /showGroup \? 'Nhóm đánh giá' : 'Cấu trúc nội bộ'/)
})

test('linked courses stay outside the academic tree', () => {
  assert.match(programPage, /Hồ sơ khóa học cũ/)
  assert.match(programPage, /course\.curriculumId === program\.id/)
  assert.match(programPage, /Đây là dữ liệu cũ/)
  const levelRows = programPage.slice(programPage.indexOf('title="Cấp độ"'), programPage.indexOf('Hồ sơ khóa học cũ'))
  assert.doesNotMatch(levelRows, /course\.name/)
})

test('structure health stays separate from content readiness', () => {
  const direct = { status: 'ACTIVE', completionRule: 'DIRECT_ASSESSMENT', components: [], activeLessonCount: 0 }
  assert.equal(model.subjectAcademicValid(direct), true)
  assert.equal(model.subjectContentReady(direct), false)
  assert.equal(model.programAcademicHealth({ activeLevelCount: 1, activeLevelsMissingActiveSubjects: 0, subjects: [direct] }), 'ready')
  assert.equal(model.contentReadinessLabel(false), 'Nội dung Lesson chưa đầy đủ')
  assert.match(programs, /program\.healthLabel/)
  assert.match(programs, /program\.contentLabel/)
  assert.match(programPage, /Cấu trúc học thuật/)
  assert.match(programPage, /Sẵn sàng nội dung/)
})

test('inactive lessons stay out of active counts and rows page past 1000', () => {
  assert.match(data, /item\.status === 'ACTIVE'/)
  assert.match(levelPage, /lesson\.status !== 'ACTIVE'/)
  assert.match(data, /from \+= 1000/)
  assert.match(data, /\.range\(from, to\)/)
  assert.match(subjectPage, /loadPaged/)
})

test('workspace uses the shared page shell and contained tables', () => {
  assert.match(css, /\.vibe-page \{[^}]*min-width:0/)
  assert.match(css, /\.vibe-table-scroll \{[^}]*overflow:auto/)
  assert.match(programPage, /AppPage/)
  assert.match(programPage, /DataTable/)
  assert.match(levelPage, /DataTable/)
  assert.match(programs, /Cấu trúc học thuật/)
  assert.match(programs, /\/admin\/academic\/\$\{program\.id\}/)
  assert.doesNotMatch(programs, /Nhóm đánh giá|Lesson đang hoạt động|Mở chương trình/)
  assert.doesNotMatch(programPage, /Edit Curriculum|Add Grade/)
  assert.doesNotMatch(subjectPage, />Component</)
})
