const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
const ts = require('typescript')

function loadRules() {
  const code = ts.transpileModule(fs.readFileSync('app/admin/academic/lesson-rules.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
  return compiled.exports
}

const rules = loadRules()
const context = {
  curriculum_id: id(1),
  level_id: id(2),
  subject_id: id(3),
  component_id: id(4),
  lesson_id: id(5),
}

test('L01 create calls the guarded lesson function with a normalized code', async () => {
  const h = harness()
  const result = await redirected(h.load('../academic/actions.ts').createCurriculumLesson, {
    ...context, code: ' l11 ', name: 'Lesson 11 — CRUD Probe', sort_order: '11', is_required: 'true', status: 'ACTIVE',
  })
  assert.equal(result.searchParams.get('success'), 'Đã tạo Lesson')
  const call = h.calls.find(entry => entry.rpc === 'create_curriculum_lesson')
  assert.equal(call.args.p_code, 'L11')
  assert.equal(call.args.p_component_id, id(4))
  assert.ok(h.invalidated.includes('/admin/programs'))
})

test('L02 edit does not send a new component parent', async () => {
  const h = harness()
  const result = await redirected(h.load('../academic/actions.ts').updateCurriculumLesson, {
    ...context, component_id: id(9), code: 'L11', name: 'Lesson 11 — CRUD Probe Updated', sort_order: '11', is_required: 'true', status: 'ACTIVE',
  })
  assert.equal(result.searchParams.get('success'), 'Đã cập nhật Lesson')
  const call = h.calls.find(entry => entry.rpc === 'update_curriculum_lesson')
  assert.equal(call.args.p_name, 'Lesson 11 — CRUD Probe Updated')
  assert.equal(call.args.p_component_id, undefined)
})

test('L03 L04 reorder sends direction and reloads program health', async () => {
  const h = harness()
  const up = await redirected(h.load('../academic/actions.ts').reorderCurriculumLesson, { ...context, direction: 'up', scope: 'active' })
  assert.equal(up.searchParams.get('success'), 'Đã đổi thứ tự Lesson')
  assert.equal(h.calls.find(entry => entry.rpc === 'reorder_curriculum_lesson').args.p_direction, 'up')
  const down = await redirected(h.load('../academic/actions.ts').reorderCurriculumLesson, { ...context, direction: 'down', scope: 'active' })
  assert.equal(down.searchParams.get('success'), 'Đã đổi thứ tự Lesson')
})

test('L06 retire uses the lifecycle function and keeps a Vietnamese guard', async () => {
  const h = harness({}, { message: 'Nhóm đánh giá hoàn thành từ Lesson bắt buộc cần ít nhất một Lesson bắt buộc đang hoạt động.', code: 'P0001' })
  const result = await redirected(h.load('../academic/actions.ts').retireCurriculumLesson, context)
  assert.match(result.searchParams.get('error'), /ít nhất một Lesson bắt buộc/)
  assert.equal(h.calls.find(entry => entry.rpc === 'retire_curriculum_lesson').args.p_lesson_id, id(5))
})

test('LSEC06 invalid code never reaches the database function', async () => {
  const h = harness()
  const result = await redirected(h.load('../academic/actions.ts').createCurriculumLesson, { ...context, code: 'bad code', name: 'Lesson', sort_order: '1', status: 'ACTIVE' })
  assert.match(result.searchParams.get('error'), /Mã Lesson/)
  assert.equal(h.calls.some(entry => entry.rpc === 'create_curriculum_lesson'), false)
})

test('missing component explains the parent blocker', async () => {
  const h = harness({ curriculum_subjects: [{ id: id(3), level_id: id(2), completion_rule: 'ALL_REQUIRED_COMPONENTS' }] })
  const result = await redirected(h.load('../academic/actions.ts').createCurriculumLesson, { ...context, component_id: '', code: 'L11', name: 'Lesson', sort_order: '1', status: 'ACTIVE' })
  assert.equal(result.searchParams.get('error'), 'Bạn cần tạo Nhóm đánh giá trước khi thêm Lesson.')
})

test('L11 L12 subject page keeps groups and a flat storage parent', async () => {
  const h = harness({
    curriculums: [{ id: id(1), name: 'Guitar' }],
    curriculum_levels: [{ id: id(2), curriculum_id: id(1), name: 'Grade 1' }],
    curriculum_subjects: [{ id: id(3), level_id: id(2), name: 'Technique', code: 'TECH', family_code: 'TECH', completion_rule: 'ALL_REQUIRED_COMPONENTS', status: 'ACTIVE', is_required: true, subject_level: 1 }],
    curriculum_subject_components: [
      { id: id(4), subject_id: id(3), name: 'Scales & Arpeggios', code: 'SCALES', status: 'ACTIVE', is_required: true, completion_rule: 'ALL_REQUIRED_ITEMS', sort_order: 1 },
      { id: id(6), subject_id: id(3), name: 'Etude', code: 'ETUDE', status: 'ACTIVE', is_required: true, completion_rule: 'ALL_REQUIRED_ITEMS', sort_order: 2 },
    ],
    curriculum_component_items: [
      { id: id(5), component_id: id(4), code: 'L01', name: 'Lesson 01', sort_order: 1, status: 'ACTIVE', is_required: true },
      { id: id(7), component_id: id(6), code: 'L01', name: 'Lesson 01', sort_order: 1, status: 'ACTIVE', is_required: true },
    ],
  })
  const grouped = h.load('../academic/[id]/levels/[levelId]/subjects/[subjectId]/page.tsx').default
  const groupedHtml = renderToStaticMarkup(await grouped({
    params: Promise.resolve({ id: id(1), levelId: id(2), subjectId: id(3) }),
    searchParams: Promise.resolve({}),
  }))
  assert.match(groupedHtml, /Nhóm đánh giá/)
  assert.match(groupedHtml, /Scales &amp; Arpeggios/)
  assert.match(groupedHtml, /Etude/)
  assert.match(groupedHtml, /Thêm Lesson|Tạo Lesson/)
  assert.match(groupedHtml, /Chỉnh sửa/)

  const flatHarness = harness({
    curriculums: [{ id: id(1), name: 'Guitar' }],
    curriculum_levels: [{ id: id(2), curriculum_id: id(1), name: 'Grade 1' }],
    curriculum_subjects: [{ id: id(3), level_id: id(2), name: 'Repertoire', code: 'REP', family_code: 'REP', completion_rule: 'DIRECT_ASSESSMENT', status: 'ACTIVE', is_required: true, subject_level: 1 }],
    curriculum_subject_components: [
      { id: id(4), subject_id: id(3), name: 'Storage Parent', code: 'STORE', status: 'ACTIVE', is_required: true, completion_rule: 'DIRECT_ASSESSMENT', sort_order: 1 },
    ],
    curriculum_component_items: [
      { id: id(5), component_id: id(4), code: 'L01', name: 'Lesson 01', sort_order: 1, status: 'ACTIVE', is_required: true },
    ],
  })
  const flat = flatHarness.load('../academic/[id]/levels/[levelId]/subjects/[subjectId]/page.tsx').default
  const flatHtml = renderToStaticMarkup(await flat({
    params: Promise.resolve({ id: id(1), levelId: id(2), subjectId: id(3) }),
    searchParams: Promise.resolve({}),
  }))
  assert.match(flatHtml, /<h2[^>]*>Lesson<\/h2>/)
  assert.match(flatHtml, /Cấu trúc nội bộ/)
  assert.doesNotMatch(flatHtml, /Nhóm đánh giá[\s\S]{0,40}Storage Parent/)
  const scalesAt = groupedHtml.indexOf('Scales')
  const etudeAt = groupedHtml.indexOf('Etude')
  assert.ok(scalesAt >= 0 && etudeAt > scalesAt)
  const scalesBlock = groupedHtml.slice(scalesAt, etudeAt)
  assert.match(scalesBlock, new RegExp(id(5)))
  assert.doesNotMatch(scalesBlock, new RegExp(id(7)))
})

test('L13 lesson breadcrumb includes the assessment group only when it is visible', async () => {
  const h = harness({
    curriculums: [{ id: id(1), name: 'Guitar' }],
    curriculum_levels: [{ id: id(2), curriculum_id: id(1), name: 'Grade 1' }],
    curriculum_subjects: [{ id: id(3), level_id: id(2), name: 'Technique', completion_rule: 'ALL_REQUIRED_COMPONENTS' }],
    curriculum_subject_components: [{ id: id(4), subject_id: id(3), name: 'Core', status: 'ACTIVE' }],
    curriculum_component_items: [{ id: id(5), component_id: id(4), code: 'L01', name: 'Lesson 01', sort_order: 1, status: 'ACTIVE', is_required: true }],
  })
  const Page = h.load('../academic/[id]/levels/[levelId]/subjects/[subjectId]/lessons/[itemId]/page.tsx').default
  const html = renderToStaticMarkup(await Page({
    params: Promise.resolve({ id: id(1), levelId: id(2), subjectId: id(3), itemId: id(5) }),
    searchParams: Promise.resolve({}),
  }))
  assert.match(html, /Core/)
  assert.match(html, /Chỉnh sửa/)
  assert.match(html, /Ngừng sử dụng/)
  assert.match(html, /Dữ liệu học tập trước đây được giữ lại/)
})

test('L14 L15 health and content stay separate from lesson writes', () => {
  const modelCode = ts.transpileModule(fs.readFileSync('app/admin/programs/model.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', modelCode)(require, compiled, compiled.exports)
  const direct = { status: 'ACTIVE', completionRule: 'DIRECT_ASSESSMENT', components: [], activeLessonCount: 0 }
  assert.equal(compiled.exports.subjectAcademicValid(direct), true)
  assert.equal(compiled.exports.contentReadinessLabel(false), 'Nội dung Lesson chưa đầy đủ')
  const blocked = { status: 'ACTIVE', completionRule: 'ALL_REQUIRED_COMPONENTS', activeLessonCount: 0, components: [{ status: 'ACTIVE', isRequired: true, completionRule: 'ALL_REQUIRED_ITEMS', requiredActiveLessons: 0 }] }
  assert.equal(compiled.exports.subjectAcademicValid(blocked), false)
})

test('L16 lesson counts still page past the 1000-row cap', () => {
  const data = fs.readFileSync('app/admin/programs/data.ts', 'utf8')
  assert.match(data, /curriculum_component_items/)
  assert.match(data, /\.range\(from, to\)/)
  assert.match(data, /from \+= 1000/)
})

test('lesson code suggestion follows the Lnn repository sequence', () => {
  assert.equal(rules.nextLessonCode(['L01', 'L09', 'CORE']), 'L10')
  assert.equal(rules.lessonCodeValid('L11'), true)
  assert.equal(rules.lessonCodeValid('bad code'), false)
})
