/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness } = require('./helpers/finance-operations.cjs')

const { inspectPortrait, publicCard, teachingBadgeLabel, positionBadgeLabel, isCurrentAssignment } = harness().load('../../../lib/staff/profile.ts')

function png(width, height) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes[16] = (width >>> 24) & 255
  bytes[17] = (width >>> 16) & 255
  bytes[18] = (width >>> 8) & 255
  bytes[19] = width & 255
  bytes[20] = (height >>> 24) & 255
  bytes[21] = (height >>> 16) & 255
  bytes[22] = (height >>> 8) & 255
  bytes[23] = height & 255
  return bytes
}

test('teaching badges keep the subject and positions stay VAS VAM VAH', () => {
  assert.equal(teachingBadgeLabel('TEACHER', 'Guitar'), 'Giáo viên Guitar')
  assert.equal(teachingBadgeLabel('ASSISTANT', 'Piano'), 'Trợ giảng Piano')
  assert.equal(teachingBadgeLabel('TEACHER', '  '), null)
  assert.equal(teachingBadgeLabel('LEAD', 'Guitar'), null)
  assert.equal(positionBadgeLabel('VAM'), 'VAM')
  assert.equal(positionBadgeLabel('MANAGER'), null)
  const card = publicCard({
    fullName: 'Lý Minh Kha',
    employeeCode: 'VIBE-HQ-0099',
    today: '2026-09-26',
    branchName: 'Cần Thơ',
    teaching: [
      { capacity: 'TEACHER', subjectName: 'Guitar', status: 'ACTIVE', effectiveFrom: '2026-09-01', effectiveTo: null },
      { capacity: 'ASSISTANT', subjectName: 'Piano', status: 'ACTIVE', effectiveFrom: '2026-09-01', effectiveTo: null },
      { capacity: 'TEACHER', subjectName: 'Violin', status: 'INACTIVE', effectiveFrom: '2026-01-01', effectiveTo: '2026-08-01' },
      { capacity: 'TEACHER', subjectName: 'Guitar', status: 'ACTIVE', effectiveFrom: '2026-10-01', effectiveTo: null },
    ],
    positions: [
      { code: 'VAM', status: 'ACTIVE', effectiveFrom: '2026-09-01', effectiveTo: null },
      { code: 'VAS', status: 'ACTIVE', effectiveFrom: '2026-09-01', effectiveTo: null },
      { code: 'VAH', status: 'ACTIVE', effectiveFrom: '2026-12-01', effectiveTo: null },
    ],
  })
  assert.deepEqual(card.teachingBadges, ['Giáo viên Guitar', 'Trợ giảng Piano'])
  assert.deepEqual(card.positionBadges, ['VAM', 'VAS'])
  assert.equal(card.branchName, 'Cần Thơ')
  assert.deepEqual(Object.keys(card).sort(), ['branchName', 'employeeCode', 'fullName', 'positionBadges', 'teachingBadges'])
  assert.equal(isCurrentAssignment({ status: 'ACTIVE', effectiveFrom: '2026-09-27', effectiveTo: null }, '2026-09-26'), false)
})

test('portrait inspection accepts a real image header and rejects the wrong file', () => {
  assert.equal(inspectPortrait(png(800, 1000), 'image/png').ok, true)
  assert.equal(inspectPortrait(png(100, 100), 'image/png').ok, false)
  assert.equal(inspectPortrait(png(5000, 500), 'image/png').ok, false)
  assert.equal(inspectPortrait(Uint8Array.from([71, 73, 70, 56, 57, 97]), 'image/gif').ok, false)
  assert.equal(inspectPortrait(png(800, 800), 'image/jpeg').ok, false)
  const huge = new Uint8Array(2_000_001)
  huge.set([137, 80, 78, 71, 13, 10, 26, 10])
  assert.match(inspectPortrait(huge, 'image/png').message, /2 MB/)
})

test('staff card and legacy teacher route do not expose private HR data', () => {
  const card = fs.readFileSync('app/documents/staff-cards/NameCard.tsx', 'utf8')
  const page = fs.readFileSync('app/documents/staff-cards/[id]/page.tsx', 'utf8')
  const teachers = fs.readFileSync('app/admin/teachers/page.tsx', 'utf8')
  const legacy = fs.readFileSync('app/admin/teachers/[id]/page.tsx', 'utf8')
  const actions = fs.readFileSync('app/admin/employees/actions.ts', 'utf8')
  const portrait = fs.readFileSync('app/admin/employees/portrait.ts', 'utf8')
  for (const source of [card, page]) {
    assert.equal(/email|phone|citizen|cccd|salary|payroll/i.test(source), false)
  }
  assert.match(card, /vibe-logo\.png/)
  assert.match(teachers, /\/admin\/employees\?selected=/)
  assert.match(legacy, /redirect\(`\/admin\/employees\?selected=/)
  assert.match(legacy, /Không tự tạo hoặc gộp/)
  assert.match(actions, /confirm'\) !== 'LINK'/)
  assert.match(portrait, /remove\(\[path\]\)/)
  assert.match(portrait, /staff-portraits/)
})

 test('videographer label follows the existing dated position workflow', () => {
  assert.equal(positionBadgeLabel('VIDEOGRAPHER'), 'CAM OP')
  assert.equal(positionBadgeLabel('UNKNOWN'), null)
  const card = publicCard({ fullName: 'Test', employeeCode: 'TEST', teaching: [], today: '2026-10-05', positions: [
    { code: 'VIDEOGRAPHER', status: 'ACTIVE', effectiveFrom: '2026-10-05', effectiveTo: null },
    { code: 'VAS', status: 'ACTIVE', effectiveFrom: '2026-10-06', effectiveTo: null },
  ] })
  assert.deepEqual(card.positionBadges, ['CAM OP'])
})
