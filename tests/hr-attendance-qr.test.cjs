const fs = require('node:fs')
const test = require('node:test')
const assert = require('node:assert/strict')

const read = (path) =>
  fs.readFileSync(path, 'utf8')

test('HR attendance page owns QR workspace', () => {
  const page = read(
    'app/admin/hr/attendance/page.tsx',
  )

  assert.match(
    page,
    /title="Chấm công"/,
  )

  assert.match(
    page,
    /<QrAttendanceShell \/>/,
  )

  assert.equal(
    page.split('<QrAttendanceShell />').length - 1,
    1,
  )

  assert.match(
    page,
    /Tổng quan hôm nay/,
  )

  assert.match(
    page,
    /Bảng công tháng/,
  )

  const overview = page.indexOf('Tổng quan hôm nay')
  const qr = page.indexOf('<QrAttendanceShell />')
  const issues = page.indexOf('Vấn đề cần xử lý')
  const filters = page.indexOf('label="Tháng"')
  const matrix = page.indexOf('Bảng công tháng')
  assert.ok(overview < qr && qr < issues && issues < filters && filters < matrix)
})

test('monthly matrix recognizes QR verification', () => {
  const model = read(
    'app/admin/hr/attendance/model.ts',
  )

  assert.match(
    model,
    /qr_verified/,
  )

  assert.match(
    model,
    /Đã xác nhận bằng QR/,
  )

  assert.match(
    model,
    /Đi muộn \/ về sớm/,
  )

  assert.match(
    model,
    /!e\.qr_verified/,
  )
})

test('attendance loader reads guarded QR verification RPC', () => {
  const data = read(
    'app/admin/employees/attendance/data.ts',
  )

  assert.match(
    data,
    /get_employee_attendance_qr_verified_entries/,
  )

  for (const field of [
    'work_date',
    'shift_code',
    'status',
    'checker',
    'revision',
    'arrived_at',
    'departed_at',
    'late_minutes',
    'early_minutes',
    'entry_kind',
    'paid_leave_minutes',
    'unpaid_leave_minutes',
    'request_id',
    'qr_verified',
  ]) {
    assert.match(data, new RegExp(field))
  }
})

test('scan page does not expose raw QR error codes by default', () => {
  const page = read(
    'app/attendance/scan/page.tsx',
  )

  assert.match(
    page,
    /Mã QR đã hết hạn/,
  )

  assert.match(
    page,
    /Hôm nay bạn không có ca phù hợp/,
  )
})

test('my attendance uses the guarded own-view RPC', () => {
  const page = read('app/my-attendance/page.tsx')
  assert.match(page, /get_my_attendance_today/)
  assert.match(page, /Ngày hôm nay/)
  assert.match(page, /Vào ca/)
  assert.match(page, /Ra ca/)
  assert.match(page, /Trạng thái/)
})

test('QR scan URL prefers the configured app origin', () => {
  const ts = require('typescript')
  const source = read('app/admin/hr/attendance/scan-url.ts')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
  const url = compiled.exports.attendanceScanUrl(
    'sample-token',
    'http://192.168.1.50:3000/',
    'http://localhost:3000',
  )
  assert.equal(url, 'http://192.168.1.50:3000/attendance/scan?t=sample-token')
  assert.equal(url.startsWith('http://localhost'), false)
  const fallback = compiled.exports.attendanceScanUrl(
    'sample-token',
    '',
    'http://localhost:3000',
  )
  assert.equal(fallback, 'http://localhost:3000/attendance/scan?t=sample-token')
  const client = read('app/admin/hr/attendance/QrAttendanceClient.tsx')
  assert.match(client, /attendanceScanUrl\(/)
  assert.match(client, /NEXT_PUBLIC_APP_URL/)
  assert.doesNotMatch(
    client,
    /\$\{window\.location\.origin\}\/attendance\/scan/,
  )
})

test('QR admin UI uses VIBE design language', () => {
  const client = read(
    'app/admin/hr/attendance/QrAttendanceClient.tsx',
  )

  assert.match(
    client,
    /vibe-card/,
  )

  assert.match(
    client,
    /vibe-table/,
  )

  assert.match(
    client,
    /vibe-button/,
  )
})
