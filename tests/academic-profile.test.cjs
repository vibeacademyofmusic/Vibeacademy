const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { resolveModule } = require('./helpers/resolve-module.cjs')
const base = path.resolve('app/admin/students/[id]')
// Execute actual server components with a read-only fixture query adapter.
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loadedModule = { exports: {} }
  const localRequire = name => {
    if (name in mocks) return mocks[name]
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) }
    if (name.startsWith('.') || name.startsWith('@/')) return load(resolveModule(file, name), mocks)
    return require(name)
  }
  new Function('require', 'module', 'exports', output)(localRequire, loadedModule, loadedModule.exports)
  return loadedModule.exports
}
const { gradeProgressPercent, subjectProgressValue } = load(path.join(base, 'academic-progress.ts'))
const component = (progressStatus, extra = {}) => ({ status: 'ACTIVE', is_required: true, progressStatus, ...extra })
const subject = (progressStatus, extra = {}) => ({ status: 'ACTIVE', is_required: true, completion_rule: 'DIRECT_ASSESSMENT', progressStatus, components: [], ...extra })
test('direct assessment ignores components and retains fractional display', () => {
  for (const [status, expected] of [['PASS', 1], ['EXEMPT', 1], ['IN_PROGRESS', .5], ['NOT_STARTED', 0]])
    assert.equal(subjectProgressValue('DIRECT_ASSESSMENT', status, [{ status: 'NOT_STARTED' }]), expected)
})
test('optional and inactive subjects do not dilute grade progress', () => {
  assert.equal(gradeProgressPercent('IN_PROGRESS', [subject('IN_PROGRESS'), subject('NOT_STARTED', { is_required: false }), subject('NOT_STARTED', { status: 'INACTIVE' })]), 50)
})
test('component subjects use only required active components', () => {
  assert.equal(gradeProgressPercent('IN_PROGRESS', [subject('IN_PROGRESS', { completion_rule: 'ALL_REQUIRED_COMPONENTS', components: [component('PASS'), component('NOT_STARTED'), component('NOT_STARTED', { is_required: false }), component('NOT_STARTED', { status: 'INACTIVE' })] })]), 50)
})
test('no quarter rounding or premature completion at seven of eight components', () => {
  assert.equal(gradeProgressPercent('IN_PROGRESS', [subject('IN_PROGRESS', { completion_rule: 'ALL_REQUIRED_COMPONENTS', components: Array.from({ length: 8 }, (_, i) => component(i < 7 ? 'PASS' : 'NOT_STARTED')) })]), 87)
})
test('missing required progress remains incomplete', () => {
  assert.equal(gradeProgressPercent('IN_PROGRESS', [subject('PASS'), subject('NOT_STARTED')]), 50)
  assert.equal(subjectProgressValue('ALL_REQUIRED_COMPONENTS', 'PASS', []), 0)
})
test('completed grade is 100%; passing manual grade awaits database confirmation', () => {
  assert.equal(gradeProgressPercent('COMPLETED', [subject('NOT_STARTED')]), 100)
  assert.equal(gradeProgressPercent('IN_PROGRESS', [subject('PASS')]), null)
  assert.equal(gradeProgressPercent('IN_PROGRESS', []), null)
})
function fixtures() {
  return {
    student_curriculum_enrollments: [
      { id: 'g', student_id: 'A', curriculum_id: 'guitar', current_level_id: 'g1', status: 'ACTIVE', is_primary: false },
      { id: 'p', student_id: 'A', curriculum_id: 'piano', current_level_id: 'p1', status: 'ACTIVE', is_primary: true },
      { id: 'b', student_id: 'B', curriculum_id: 'other', status: 'ACTIVE', is_primary: true },
    ],
    curriculums: [{ id: 'piano', name: 'Piano', status: 'ACTIVE' }, { id: 'guitar', name: 'Guitar', status: 'ACTIVE' }],
    curriculum_levels: [{ id: 'p1', curriculum_id: 'piano', name: 'Piano Grade 1', sequence_no: 1, status: 'ACTIVE' }, { id: 'p2', curriculum_id: 'piano', name: 'Piano Grade 2', sequence_no: 2, status: 'ACTIVE' }, { id: 'g1', curriculum_id: 'guitar', name: 'Guitar Grade 1', sequence_no: 1, status: 'ACTIVE' }],
    student_level_progress: [{ id: 'lp1', enrollment_id: 'p', level_id: 'p1', status: 'COMPLETED' }, { id: 'lp2', enrollment_id: 'p', level_id: 'p2', status: 'AVAILABLE' }, { id: 'lg1', enrollment_id: 'g', level_id: 'g1', status: 'IN_PROGRESS' }],
    curriculum_subjects: [{ id: 's1', level_id: 'p1', name: 'Historical subject', status: 'ACTIVE', is_required: true, completion_rule: 'ALL_REQUIRED_COMPONENTS', sort_order: 1 }],
    student_subject_progress: [{ id: 'sp1', level_progress_id: 'lp1', subject_id: 's1', status: 'PASS' }],
    curriculum_subject_components: [{ id: 'c1', subject_id: 's1', name: 'Historical component', status: 'ACTIVE', is_required: true, sort_order: 1 }],
    student_component_progress: [{ id: 'cp1', subject_progress_id: 'sp1', component_id: 'c1', status: 'PASS' }],
  }
}
function client(data) {
  return { from(table) {
    let rows = [...data[table]], single = false, orders = [], limit = Infinity
    const query = {
      select() { return this },
      eq(key, value) { assert.notEqual(value, '', 'no empty UUID query'); rows = rows.filter(row => row[key] === value); return this },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this },
      order(key, options = {}) { orders.push([key, options.ascending !== false]); return this },
      limit(value) { limit = value; return this },
      maybeSingle() { single = true; return this },
      then(resolve, reject) {
        rows.sort((a, b) => { for (const [key, asc] of orders) { if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * (asc ? 1 : -1) } return 0 })
        return Promise.resolve({ data: single ? rows[0] ?? null : rows.slice(0, limit), error: null }).then(resolve, reject)
      },
    }
    return query
  } }
}
async function render(data, studentId = 'A') {
  const noop = async () => {}
  const { default: Component } = load(path.join(base, 'AcademicPrograms.tsx'), {
    '@/lib/supabase/server': { createClient: async () => client(data) },
    '@/lib/display': { displayLabel: status => status },
    '../actions': { assignStudentAcademicProgram: noop, startStudentAcademicLevel: noop, updateComponentProgressStatus: noop, updateDirectSubjectProgressStatus: noop },
  })
  async function resolve(node) {
    if (Array.isArray(node)) return Promise.all(node.map(resolve))
    if (!React.isValidElement(node)) return node
    if (typeof node.type === 'function' && node.type.constructor.name === 'AsyncFunction') {
      const result = await resolve(await node.type(node.props))
      return React.isValidElement(result) ? React.cloneElement(result, { key: node.key }) : result
    }
    const children = await resolve(node.props.children)
    return React.cloneElement(node, {}, ...(Array.isArray(children) ? children : [children]))
  }
  return renderToStaticMarkup(await resolve(await Component({ studentId })))
}
test('renders both programs, primary first; completed history read-only, next grade start only', async () => {
  const html = await render(fixtures())
  assert.ok(html.indexOf('Lộ trình học tập — Piano') < html.indexOf('Lộ trình học tập — Guitar'))
  assert.match(html, /Bắt đầu Piano Grade 2/)
  assert.match(html, /100%/)
  assert.match(html, /Historical subject/)
  assert.match(html, /Historical component/)
  assert.doesNotMatch(html, /name="progress_id"/)
  for (const record of html.split('Hồ sơ học tập').slice(1))
    assert.doesNotMatch(record.split('Lộ trình học tập')[0], /<form/)
  assert.match(html, /value="piano" disabled=""/)
  assert.match(html, /value="guitar" disabled=""/)
})
test('inconsistent current grade blocks start and reports mismatch', async () => {
  const data = fixtures()
  data.student_level_progress[0].status = 'IN_PROGRESS'
  data.student_curriculum_enrollments[1].current_level_id = 'p2'
  const html = await render(data)
  assert.match(html, /Dữ liệu bậc đang học không khớp/)
  assert.doesNotMatch(html, /Bắt đầu Piano Grade 2/)
})
test('completed enrollment remains visible; no programs produces a safe empty state', async () => {
  const data = fixtures()
  data.student_curriculum_enrollments[1].status = 'COMPLETED'
  assert.match(await render(data), /Lộ trình học tập — Piano/)
  assert.match(await render(data, 'empty'), /Chưa có chương trình học/)
})

test('all three awards are equally complete and preserve their display value', () => {
 const {academicStatusLabel}=load(path.join(base,'academic-progress.ts'))
 for(const award of ['PASS','MERIT','DISTINCTION']) {
  assert.equal(subjectProgressValue('DIRECT_ASSESSMENT',award,[]),1)
  assert.equal(subjectProgressValue('ALL_REQUIRED_COMPONENTS','NOT_STARTED',[{status:award}]),1)
  assert.equal(gradeProgressPercent('IN_PROGRESS',[subject(award),subject('NOT_STARTED')]),50)
 }
 assert.equal(academicStatusLabel('MERIT'),'Merit');assert.equal(academicStatusLabel('DISTINCTION'),'Distinction')
})
test('editable direct subjects expose precisely five choices and Save; record preserves Merit',async()=>{
 const d=fixtures();d.student_level_progress[0].status='IN_PROGRESS';d.student_level_progress[0].started_at='2020-01-01T00:00:00Z'
 d.curriculum_subjects[0].completion_rule='DIRECT_ASSESSMENT';d.student_subject_progress[0].status='MERIT'
 const html=await render(d)
 const choice=html.match(/<select[^>]*name="status"[\s\S]*?<\/select>/)[0]
 assert.equal((choice.match(/<option/g)||[]).length,5)
 for(const s of ['NOT_STARTED','IN_PROGRESS','PASS','MERIT','DISTINCTION']) assert.ok(choice.includes(`value="${s}"`))
 assert.doesNotMatch(choice,/NOT_PASSED|EXEMPT/);assert.match(html,/Lưu/)
 assert.match(html.split('Hồ sơ học tập')[1],/>Merit</)
})
test('component subject exposes only component editor and future grade stays locked',async()=>{
 const d=fixtures();d.student_level_progress[0].status='IN_PROGRESS';d.student_level_progress[0].started_at='2020-01-01T00:00:00Z'
 let html=await render(d)
 assert.match(html,/name="progress_id" value="cp1"/);assert.doesNotMatch(html,/name="progress_id" value="sp1"/)
 d.student_level_progress[0].started_at='2099-01-01T00:00:00Z';html=await render(d)
 assert.doesNotMatch(html,/name="progress_id"/);assert.match(html,/Chưa đến ngày bắt đầu grade/)
})
test('scheduled edit gate compares timestamps instead of timestamp versus calendar string',()=>{
 const {isAcademicScheduled}=load(path.join(base,'academic-progress.ts'))
 const now=Date.parse('2026-09-18T03:00:00Z')
 assert.equal(isAcademicScheduled('2026-09-18T00:00:00Z',now),false)
 assert.equal(isAcademicScheduled('2026-09-18T17:00:00Z',now),true)
})
