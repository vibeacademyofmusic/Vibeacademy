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
const subjectPage = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/page.tsx', 'utf8')
  + fs.readFileSync('app/admin/academic/lesson-operator.tsx', 'utf8')
const lessonPage = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/lessons/[itemId]/page.tsx', 'utf8')
const editPage = fs.readFileSync('app/admin/academic/[id]/levels/[levelId]/subjects/[subjectId]/components/[componentId]/edit/page.tsx', 'utf8')
const actions = fs.readFileSync('app/admin/academic/actions.ts', 'utf8')
const programsPage = fs.readFileSync('app/admin/programs/page.tsx', 'utf8')
const data = fs.readFileSync('app/admin/programs/data.ts', 'utf8')

function subject(completionRule, components, activeLessonCount = 0, status = 'ACTIVE') {
  return { status, completionRule, components, activeLessonCount }
}

function component(overrides = {}) {
  return {
    status: 'ACTIVE',
    isRequired: true,
    completionRule: 'DIRECT_ASSESSMENT',
    requiredActiveLessons: 0,
    ...overrides,
  }
}

test('SH01 ALL_REQUIRED_COMPONENTS without a required active component is incomplete', () => {
  const row = subject('ALL_REQUIRED_COMPONENTS', [])
  assert.equal(model.subjectAcademicValid(row), false)
  assert.equal(model.programAcademicHealth({ activeLevelCount: 1, activeLevelsMissingActiveSubjects: 0, subjects: [row] }), 'incomplete')
})

test('SH02 ALL_REQUIRED_COMPONENTS with a required active component passes the subject gate', () => {
  const row = subject('ALL_REQUIRED_COMPONENTS', [component()])
  assert.equal(model.subjectAcademicValid(row), true)
})

test('SH03 DIRECT_ASSESSMENT with zero components is structurally valid', () => {
  const row = subject('DIRECT_ASSESSMENT', [], 0)
  assert.equal(model.subjectAcademicValid(row), true)
  assert.equal(model.contentReadinessLabel(model.subjectContentReady(row)), 'Nội dung Lesson chưa đầy đủ')
})

test('SH04 MANUAL with zero components is structurally valid', () => {
  assert.equal(model.subjectAcademicValid(subject('MANUAL', [])), true)
})

test('SH05 ALL_REQUIRED_ITEMS component with no required lesson is incomplete', () => {
  const group = component({ completionRule: 'ALL_REQUIRED_ITEMS', requiredActiveLessons: 0 })
  assert.equal(model.componentItemRuleSatisfied(group), false)
  assert.equal(model.subjectAcademicValid(subject('ALL_REQUIRED_COMPONENTS', [group])), false)
})

test('SH06 DIRECT_ASSESSMENT component with zero lessons is not invalid', () => {
  const group = component({ completionRule: 'DIRECT_ASSESSMENT', requiredActiveLessons: 0 })
  assert.equal(model.componentItemRuleSatisfied(group), true)
  assert.equal(model.subjectAcademicValid(subject('ALL_REQUIRED_COMPONENTS', [group], 0)), true)
})

test('SH07 inactive component does not satisfy the required active gate', () => {
  const row = subject('ALL_REQUIRED_COMPONENTS', [component({ status: 'INACTIVE' })])
  assert.equal(model.subjectHasRequiredActiveComponent(row), false)
  assert.equal(model.subjectAcademicValid(row), false)
})

test('SH08 optional component does not satisfy the required active gate', () => {
  const row = subject('ALL_REQUIRED_COMPONENTS', [component({ isRequired: false })])
  assert.equal(model.subjectHasRequiredActiveComponent(row), false)
  assert.equal(model.subjectAcademicValid(row), false)
})

test('SH09 program summary propagates a real structural failure', () => {
  const health = model.programAcademicHealth({
    activeLevelCount: 1,
    activeLevelsMissingActiveSubjects: 0,
    subjects: [subject('ALL_REQUIRED_COMPONENTS', [])],
  })
  assert.equal(health, 'incomplete')
  assert.equal(model.healthLabel(health), 'Cần bổ sung cấu trúc học thuật')
})

test('SH10 program summary does not mark a direct assessment subject incomplete', () => {
  const row = subject('DIRECT_ASSESSMENT', [], 0)
  const health = model.programAcademicHealth({
    activeLevelCount: 1,
    activeLevelsMissingActiveSubjects: 0,
    subjects: [row],
  })
  assert.equal(health, 'ready')
  assert.equal(model.healthLabel(health), 'Đủ cấu trúc học thuật')
  assert.equal(model.contentReadinessLabel(false), 'Nội dung Lesson chưa đầy đủ')
  assert.doesNotMatch(programsPage, /contentLabel|Sẵn sàng nội dung/)
  assert.doesNotMatch(programsPage, /Cần bổ sung cấu trúc"/)
})

test('UI01 direct assessment does not force a component layer', () => {
  assert.equal(model.showComponentGroups('DIRECT_ASSESSMENT', [{ status: 'ACTIVE' }]), false)
  assert.equal(model.showComponentGroups('MANUAL', []), false)
  assert.match(subjectPage, /showComponentGroups/)
  assert.match(subjectPage, /showGroups \? 'Nhóm đánh giá' : 'Lesson'/)
})

test('UI02 component-based subject shows assessment groups', () => {
  assert.equal(model.showComponentGroups('ALL_REQUIRED_COMPONENTS', [{ status: 'ACTIVE' }]), true)
  assert.equal(model.showComponentGroups('ALL_REQUIRED_COMPONENTS', []), true)
  assert.match(subjectPage, /Nhóm đánh giá/)
})

test('UI03 multi-component subject keeps grouping', () => {
  assert.equal(model.showComponentGroups('DIRECT_ASSESSMENT', [{ status: 'ACTIVE' }, { status: 'ACTIVE' }]), true)
  assert.equal(model.showComponentGroups('MANUAL', [{ status: 'ACTIVE' }, { status: 'INACTIVE' }]), false)
  assert.match(subjectPage, /lesson\.component_id === componentId/)
})

test('UI04 component is never labeled as Level', () => {
  assert.equal(model.componentRuleLabel('ALL_REQUIRED_ITEMS'), 'Hoàn thành từ Lesson bắt buộc')
  assert.doesNotMatch(subjectPage, /Nhóm đánh giá[\s\S]{0,80}Level/)
  assert.equal(model.hierarchy.includes('Component'), false)
})

test('UI05 program summary stays Program Level Subject Lesson', () => {
  assert.equal(model.hierarchyPath([
    { id: 'a', name: 'Pre', sequence: 1 },
    { id: 'b', name: 'Grade 8', sequence: 9 },
  ]), 'Pre → Grade 8 → Môn → Lesson')
  assert.match(programsPage, /program\.path/)
  assert.doesNotMatch(programsPage, /Component → Item/)
})

test('UI06 internal component editor remains available and writes completion rule', () => {
  assert.match(subjectPage, /Cấu trúc nội bộ/)
  assert.match(subjectPage, /name="completion_rule"/)
  assert.match(editPage, /name="completion_rule"/)
  assert.match(actions, /completion_rule: completionRule/)
  assert.match(actions, /DIRECT_ASSESSMENT', 'ALL_REQUIRED_ITEMS'/)
})

test('UI07 component results stay in progress and report contracts', () => {
  const journey = fs.readFileSync('app/my-learning/Journey.tsx', 'utf8')
  const report = fs.readFileSync('app/admin/reports/learning/[id]/ReportDocument.tsx', 'utf8')
  const progress = fs.readFileSync('app/admin/students/[id]/AcademicPrograms.tsx', 'utf8')
  assert.match(journey, /component\.name/)
  assert.match(report, /c\.name/)
  assert.match(progress, /updateComponentProgressStatus/)
  assert.match(lessonPage, /showComponentGroups/)
  assert.match(data, /completion_rule/)
  assert.match(data, /\.range\(from, to\)/)
})
