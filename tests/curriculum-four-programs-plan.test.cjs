/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner uses CommonJS. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPlan, counts } = require('../scripts/curriculum-four-programs-plan.cjs')

test('owner matrix produces 37 levels, 184 subjects and 2640 lessons', () => {
  assert.deepEqual(counts(buildPlan()), [
    { program: 'Piano', levels: 10, subjects: 49, lessons: 810 },
    { program: 'Drums', levels: 9, subjects: 45, lessons: 610 },
    { program: 'Guitar', levels: 9, subjects: 45, lessons: 610 },
    { program: 'Violin', levels: 9, subjects: 45, lessons: 610 },
  ])
})

test('foundation and grade boundaries match the approved subject matrix', () => {
  const plan = buildPlan()
  assert.equal(plan.flatMap(p => p.levels).filter(l => l.levelType === 'FOUNDATION').length, 5)
  for (const program of plan) for (const level of program.levels) {
    const names = level.subjects.map(s => s.name)
    assert.equal(names.includes('Methode Book'), level.grade === null)
    assert.equal(names.includes('Repertoire'), level.grade !== null)
    assert.equal(names.includes('Ensemble'), level.grade >= 4)
    assert.equal(names.includes('Music History'), level.grade >= 7)
    assert.equal(names.includes('Media Product'), level.grade >= 7)
    assert.equal(names.includes('Music Theory'), false)
    assert.equal(level.subjects[0].lessons.length, level.grade === null ? 50 : 10)
  }
})

test('lesson keys are stable, unique and mapping remains explicitly unresolved', () => {
  const first = buildPlan()
  assert.deepEqual(first, buildPlan())
  const lessons = first.flatMap(p => p.levels.flatMap(l => l.subjects.flatMap(s => {
    assert.equal(s.componentMapping, null)
    assert.equal(s.lessons[0].name, 'Lesson 01')
    return s.lessons
  })))
  assert.equal(new Set(lessons.map(l => l.key)).size, 2640)
})
