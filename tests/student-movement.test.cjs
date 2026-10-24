const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function loadMovement() {
  const code = ts.transpileModule(fs.readFileSync('app/admin/students/movement.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = { exports: {} }
  new Function('exports', 'require', code)(loaded.exports, require)
  return loaded.exports
}

test('a selected month stays inside that calendar month', () => {
  const { monthWindow, monthLabel, dateLabel, distinctCount } = loadMovement()
  assert.deepEqual(monthWindow('2026-09', '2026-01-15'), {
    month: '2026-09', start: '2026-09-01', end: '2026-09-30', next: '2026-10-01',
  })
  assert.deepEqual(monthWindow('2026-02', '2026-09-29').end, '2026-02-28')
  assert.equal(monthWindow('nope', '2026-09-29').month, '2026-09')
  assert.equal(monthLabel('2026-09'), 'Tháng 09/2026')
  assert.equal(dateLabel('2026-09-01'), '01/09/2026')
  assert.equal(distinctCount(['a', 'a', 'b']), 2)
  const { instrumentLabel, instrumentShares } = loadMovement()
  assert.equal(instrumentLabel('Drums', 'TEST_DRUMS'), 'Trống')
  assert.equal(instrumentLabel('Piano', 'TEST_PIANO'), 'Piano')
  const shares = instrumentShares([
    { studentId: 'p1', name: 'Piano', code: 'TEST_PIANO' },
    { studentId: 'p2', name: 'Piano', code: 'TEST_PIANO' },
    { studentId: 'g1', name: 'Guitar', code: 'TEST_GUITAR' },
    { studentId: 'v1', name: 'Violin', code: 'TEST_VIOLIN' },
    { studentId: 'd1', name: 'Drums', code: 'TEST_DRUMS' },
  ], 6)
  assert.deepEqual(shares.map(row => row.name), ['Piano', 'Guitar', 'Violin', 'Trống', 'Chưa gắn môn'])
  assert.equal(shares[0].students, 2)
  assert.equal(shares.at(-1).students, 1)
})

test('student dashboard exports the approved movement report', () => {
  const hub = fs.readFileSync('app/admin/students/hub.tsx', 'utf8')
  const data = fs.readFileSync('app/admin/students/movement-data.ts', 'utf8')
  const paper = fs.readFileSync('app/documents/students/movement/StudentMovementDocument.tsx', 'utf8')
  for (const text of ['Học viên mới trong tháng', 'Đang bảo lưu', 'Nghỉ khi hết khóa', 'Chi nhánh', 'Xuất báo cáo', 'Cơ cấu theo môn']) {
    assert.ok(hub.includes(text), text)
  }
  assert.match(data, /admission_date/)
  assert.match(data, /COMPLETED/)
  assert.match(data, /WITHDRAWN/)
  assert.match(data, /count_paused_student_enrollments/)
  assert.match(paper, /BÁO CÁO HỌC VIÊN/)
  assert.match(paper, /CƠ CẤU THEO MÔN/)
  assert.match(paper, /financial-report-print.css/)
})
