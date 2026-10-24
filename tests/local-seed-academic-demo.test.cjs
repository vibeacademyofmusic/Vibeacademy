const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  REFUSED, TEST_CODES, FORBIDDEN_SUBJECTS, localUrl, guardedFetch, parseArgs, buildPlan,
  missingKeys, ownedCurriculumIds, resolveProgramIdentity, run,
} = require('../scripts/local-seed-academic-demo.cjs')

function plan() {
  return buildPlan()
}

test('S01 remote target refused', async () => {
  assert.throws(() => localUrl('https://project.supabase.co'), { message: REFUSED })
  assert.throws(() => localUrl('http://192.168.1.5:54321'), { message: REFUSED })
  let created = false
  await assert.rejects(run({
    mode: 'seed',
    url: 'https://example.supabase.co',
    key: 'remote-key',
    createClientImpl() { created = true },
  }), { message: REFUSED })
  assert.equal(created, false)
  await assert.rejects(run({
    mode: 'dry-run',
    url: 'https://example.supabase.co',
    key: 'remote-key',
    createClientImpl() { created = true },
  }), { message: REFUSED })
  assert.equal(created, false)
})

test('S02 S03 S04 S05 S06 S07 S08 catalog counts', () => {
  const catalog = plan()
  assert.equal(catalog.counts.programs, 4)
  assert.deepEqual(catalog.programs.map(row => row.code), TEST_CODES)
  for (const code of TEST_CODES) {
    assert.equal(catalog.levels.filter(row => row.program === code).length, 9)
  }
  const levelKeys = new Set(catalog.levels.map(row => `${row.program}|${row.code}`))
  for (const key of levelKeys) {
    assert.equal(catalog.subjects.filter(row => `${row.program}|${row.level}` === key).length, 4)
  }
  for (const subject of catalog.subjects) {
    const lessons = catalog.lessons.filter(row => row.program === subject.program && row.level === subject.level && row.subject === subject.code)
    assert.equal(lessons.length, 10)
  }
  assert.equal(catalog.counts.levels, 36)
  assert.equal(catalog.counts.subjects, 144)
  assert.equal(catalog.counts.lessons, 1440)
  assert.equal(catalog.counts.components, 144)
})

test('S09 no forbidden extra subjects', () => {
  const names = plan().subjects.map(row => row.name)
  for (const forbidden of FORBIDDEN_SUBJECTS) {
    assert.equal(names.some(name => name === forbidden || name.startsWith(`${forbidden} `)), false)
  }
  const codes = new Set(plan().subjects.map(row => row.code))
  assert.deepEqual([...codes].sort(), ['AURAL', 'REPERTOIRE', 'SIGHTREADING', 'TECHNIQUE_FOUNDATION'])
})

test('S10 second-run idempotent', () => {
  const catalog = plan()
  const lessonKeys = catalog.lessons.map(row => `${row.program}|${row.level}|${row.subject}|${row.code}`)
  assert.equal(missingKeys(lessonKeys, lessonKeys).length, 0)
  assert.equal(missingKeys(lessonKeys, lessonKeys.slice(0, 10)).length, 1430)
})

test('canonical identity is reused and cleanup cannot own it', () => {
  const rows = [
    { id: 'piano', code: 'PIANO' },
    { id: 'legacy', code: 'TEST_PIANO' },
  ]
  assert.equal(resolveProgramIdentity(rows, { code: 'TEST_PIANO' }).id, 'piano')
  assert.deepEqual(ownedCurriculumIds(rows), ['legacy'])
  assert.deepEqual(ownedCurriculumIds([{ id: 'piano', code: 'PIANO' }]), [])
})

test('S11 non-test data untouched', () => {
  const rows = [
    { id: 'keep', code: 'LOCAL_KEEP' },
    { id: 'guitar', code: 'TEST_GUITAR' },
    { id: 'other', code: 'GUITAR' },
  ]
  assert.deepEqual(ownedCurriculumIds(rows), ['guitar'])
})

test('S12 cleanup TEST-only', async () => {
  const deleted = []
  let reads = 0
  const client = {
    from() {
      const state = { filters: [] }
      const chain = {
        select() { return chain },
        in(column, values) { state.filters.push([column, values]); return chain },
        delete() { state.action = 'delete'; return chain },
        range() { return chain },
        then(resolve) {
          if (state.action === 'delete') {
            deleted.push(state)
            return resolve({ error: null })
          }
          reads += 1
          return resolve({
            data: reads === 1 ? [
              { id: 'keep', code: 'LOCAL_KEEP' },
              { id: 'guitar', code: 'TEST_GUITAR' },
              { id: 'piano', code: 'TEST_PIANO' },
            ] : [],
            error: null,
          })
        },
      }
      return chain
    },
  }
  const result = await run({
    mode: 'cleanup',
    url: 'http://127.0.0.1:54321',
    key: 'local-test-key',
    log() {},
    client,
  })
  assert.equal(result.removed, 2)
  assert.equal(deleted.length, 1)
  assert.deepEqual(deleted[0].filters, [
    ['id', ['guitar', 'piano']],
    ['code', TEST_CODES],
  ])
})

test('S13 Pre first and S14 Grade 8 last', () => {
  for (const code of TEST_CODES) {
    const levels = plan().levels.filter(row => row.program === code).sort((a, b) => a.sequence - b.sequence)
    assert.equal(levels[0].code, 'PRE')
    assert.equal(levels[0].name, 'Pre')
    assert.equal(levels[0].levelType, 'FOUNDATION')
    assert.equal(levels.at(-1).code, 'GRADE_8')
    assert.equal(levels.at(-1).name, 'Grade 8')
    assert.equal(levels.at(-1).sequence, 9)
  }
})

test('S15 valid status and completion constraints', () => {
  const catalog = plan()
  for (const row of [...catalog.programs, ...catalog.levels, ...catalog.subjects, ...catalog.components, ...catalog.lessons]) {
    assert.equal(row.status, 'ACTIVE')
  }
  assert.ok(catalog.levels.every(row => row.completion === 'ALL_REQUIRED_SUBJECTS'))
  assert.ok(catalog.subjects.every(row => row.completion === 'ALL_REQUIRED_COMPONENTS'))
  assert.ok(catalog.components.every(row => row.completion === 'ALL_REQUIRED_ITEMS'))
  assert.ok(catalog.levels.every(row => ['FOUNDATION', 'GRADE', 'DIPLOMA', 'OTHER'].includes(row.levelType)))
})

test('dry-run prints the approved totals and does not open a client', async () => {
  assert.equal(localUrl('http://localhost:54321'), 'http://127.0.0.1:54321')
  assert.equal(parseArgs([]), 'seed')
  assert.equal(parseArgs(['--dry-run']), 'dry-run')
  assert.throws(() => parseArgs(['--url', 'https://example.supabase.co']))
  const lines = []
  let created = false
  const counts = await run({
    mode: 'dry-run',
    url: 'http://127.0.0.1:54321',
    key: 'local-test-key',
    log: line => lines.push(line),
    createClientImpl() { created = true },
  })
  assert.equal(created, false)
  assert.deepEqual(counts, { programs: 4, levels: 36, subjects: 144, components: 144, lessons: 1440 })
  assert.deepEqual(lines, ['Programs: 4', 'Levels: 36', 'Subjects: 144', 'Lessons: 1440', 'Components: 144'])
})

test('every request is pinned to local origin', async () => {
  let calls = 0
  const request = guardedFetch('http://127.0.0.1:54321', async (_, options) => {
    calls += 1
    assert.equal(options.redirect, 'error')
  })
  assert.throws(() => request('https://example.supabase.co'), { message: REFUSED })
  await request('http://127.0.0.1:54321/rest/v1/curriculums')
  assert.equal(calls, 1)
})
