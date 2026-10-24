const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const source = fs.readFileSync('app/admin/students/legacy-reference-programs.ts', 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const loaded = { exports: {} }
new Function('exports', 'require', code)(loaded.exports, require)
const { groupReferencePrograms, loadReferencePrograms, CAN_THO_OPENING_BATCH_ID } = loaded.exports

test('a student keeps both source programs without creating an academic enrollment', async () => {
  const rows = [
    { target_student_id: 'student-1', source_excel_row: 97, curriculum_id: 'drums', level_id: 'grade-1', program_state: 'MAPPED_AWAITING_ACADEMIC_START', normalized_payload: { source_program: 'DRUM', original_grade: '1B' } },
    { target_student_id: 'student-1', source_excel_row: 96, curriculum_id: 'violin', level_id: 'grade-1', program_state: 'MAPPED_AWAITING_ACADEMIC_START', normalized_payload: { source_program: 'VIOLIN', original_grade: '1A' } },
    { target_student_id: 'student-2', source_excel_row: 40, curriculum_id: null, level_id: null, program_state: 'UNMAPPED', normalized_payload: { source_program: 'HARP', original_grade: '1' } },
  ]
  const calls = []
  const query = {
    select(columns) { calls.push(['select', columns]); return this },
    eq(column, value) { calls.push(['eq', column, value]); return this },
    in(column, values) { calls.push(['in', column, values]); return this },
    async order(column) { calls.push(['order', column]); return { data: rows, error: null } },
  }
  const db = { from(table) { calls.push(['from', table]); return query } }
  const programs = await loadReferencePrograms(db, ['student-1', 'student-2'])

  assert.deepEqual(programs.get('student-1').map(item => [item.name, item.grade, item.mapped]), [
    ['Violin', '1A', true], ['Trống', '1B', true],
  ])
  assert.deepEqual(programs.get('student-2').map(item => [item.name, item.mapped]), [['Harp', false]])
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'import_batch_id' && call[2] === CAN_THO_OPENING_BATCH_ID))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'disposition' && call[2] === 'IMPORT'))
  assert.ok(calls.some(call => call[0] === 'in' && call[1] === 'target_student_id'))
  assert.equal(calls.some(call => ['insert', 'update', 'rpc'].includes(call[0])), false)
})

test('rows without a linked student or source program stay out of the profile', () => {
  const programs = groupReferencePrograms([
    { target_student_id: null, source_excel_row: 5, curriculum_id: null, level_id: null, program_state: 'OUTSIDE_SCOPE', normalized_payload: { source_program: 'PIANO' } },
    { target_student_id: 'student-1', source_excel_row: 10, curriculum_id: null, level_id: null, program_state: 'UNMAPPED', normalized_payload: { source_program: '' } },
  ])
  assert.equal(programs.size, 0)
})
