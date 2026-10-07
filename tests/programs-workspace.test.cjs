const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { resolveModule } = require('./helpers/resolve-module.cjs')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const compiled = { exports: {} }
  const localRequire = name => name.startsWith('.') || name.startsWith('@/') ? load(resolveModule(file, name)) : require(name)
  new Function('require', 'module', 'exports', code)(localRequire, compiled, compiled.exports)
  return compiled.exports
}

const model = load('app/admin/programs/model.ts')
const { navigationGroups, trainingTabs, activeNavigationHref, activeWorkspaceTab } = load('app/admin/navigation.ts')
const page = fs.readFileSync('app/admin/programs/page.tsx', 'utf8')
const data = fs.readFileSync('app/admin/programs/data.ts', 'utf8')
const subject = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/page.tsx', 'utf8')
const lesson = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/lessons/[itemId]/page.tsx', 'utf8')

test('H01 workspace keeps Program Level Subject Lesson hierarchy', () => {
  assert.deepEqual(model.hierarchy, ['Program', 'Level', 'Subject', 'Lesson'])
  assert.match(page, /Chương trình/)
  assert.match(page, /Khóa học/)
  assert.doesNotMatch(page, /MetricCard[^]*Levels/)
  assert.doesNotMatch(page, /title: 'Levels'|title: 'Subjects'|title: 'Lessons'/)
})

test('H02 summary path uses the first and last level', () => {
  assert.equal(model.hierarchyPath([
    { id: 'a', name: 'Pre', sequence: 1 },
    { id: 'b', name: 'Grade 8', sequence: 9 },
  ]), 'Pre → Grade 8 → Môn → Lesson')
  assert.equal(model.structureMeta(9, 36, 360), '9 Level · 36 môn · 360 Lesson')
  assert.match(page, /program\.path/)
})

test('H04 counts stay secondary to the hierarchy path', () => {
  assert.match(page, /program\.path/)
  assert.match(page, /text-xs text-gray-500/)
  assert.equal(model.programAcademicHealth({
    activeLevelCount: 9,
    activeLevelsMissingActiveSubjects: 0,
    subjects: [{ status: 'ACTIVE', completionRule: 'DIRECT_ASSESSMENT', components: [], activeLessonCount: 0 }],
  }), 'ready')
  assert.equal(model.healthLabel('incomplete'), 'Cần bổ sung cấu trúc học thuật')
  assert.doesNotMatch(page, /% complete|75%/)
})

test('H05 breadcrumb order is workspace program level subject lesson', () => {
  const trail = fs.readFileSync('app/admin/programs/trail.tsx', 'utf8')
  assert.match(trail, /Chương trình học/)
  assert.match(lesson, /curriculum\.name/)
  assert.match(lesson, /level\.name/)
  assert.match(lesson, /subject\.name/)
  assert.match(lesson, /lesson\.name/)
})

test('H06 component remains the technical parent of a lesson', () => {
  assert.match(subject, /curriculum_subject_components/)
  assert.match(subject, /curriculum_component_items/)
  assert.match(subject, /Cấu trúc nội bộ/)
  assert.match(data, /curriculum_subject_components/)
  assert.match(data, /curriculum_component_items/)
  assert.match(data, /\.range\(from, to\)/)
})

test('N01 N02 N03 N04 curriculum stays one workspace under Đào tạo', () => {
  const training = trainingTabs
  assert.equal(training.filter(item => item.name === 'Chương trình học').length, 1)
  assert.equal(training.find(item => item.name === 'Chương trình học').href, '/admin/programs')
  const names = navigationGroups.flatMap(group => group.items.map(item => item.name))
  assert.equal(names.filter(name => name === 'Khóa học').length, 0)
  assert.equal(names.filter(name => name === 'Chương trình và khóa học').length, 0)
  assert.equal(activeNavigationHref('/admin/academic/program/levels/level'), '/admin/students')
  assert.equal(activeWorkspaceTab('/admin/academic/program/levels/level'), '/admin/programs')
  assert.equal(activeNavigationHref('/admin/courses/course/edit'), '/admin/students')
  assert.equal(activeWorkspaceTab('/admin/courses/course/edit'), '/admin/programs')
  assert.ok(fs.existsSync('app/admin/programs/page.tsx'))
  assert.ok(fs.existsSync('app/admin/academic/[id]/page.tsx'))
  assert.ok(fs.existsSync('app/admin/courses/[id]/edit/page.tsx'))
})

test('P01 P02 program list reads curricula and derives counts', () => {
  assert.match(data, /\.from\('operational_curriculums'\)/)
  assert.match(data, /\.from\('curriculum_levels'\)/)
  assert.match(data, /\.from\('curriculum_subjects'\)/)
  assert.match(data, /structureMeta/)
  assert.equal(model.shownCount(true, 0), '—')
  assert.equal(model.shownCount(false, 0), '0')
})

test('C01 C03 course mode uses the real curriculum foreign key', () => {
  assert.match(data, /\.from\('courses'\)/)
  assert.match(data, /curriculum_id/)
  assert.match(page, /course\.curriculumName \?\? '—'/)
  assert.doesNotMatch(page, /branch_id: course/)
  assert.equal(model.courseDelivery([{ courseId: 'c', status: 'ACTIVE', startDate: '2026-10-01', branchId: null }], '2026-09-23').starting, true)
  assert.equal(model.courseDelivery([{ courseId: 'c', status: 'COMPLETED', startDate: '2026-01-01', branchId: null }], '2026-09-23').ended, true)
})

test('old list routes redirect into the workspace', () => {
  assert.match(fs.readFileSync('app/admin/academic/page.tsx', 'utf8'), /\/admin\/programs\?/)
  assert.match(fs.readFileSync('app/admin/courses/page.tsx', 'utf8'), /view=courses|view', 'courses'/)
  assert.match(fs.readFileSync('app/admin/academic/actions.ts', 'utf8'), /\/admin\/academic\/\$\{created\.id\}/)
})
