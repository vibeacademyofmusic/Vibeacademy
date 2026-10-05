import assert from 'node:assert/strict'
import test from 'node:test'
import { isCanonicalProgramCode, isOperationalProgram } from '../lib/academic/canonical-programs.ts'

test('only the four active canonical programs are operational', () => {
  assert.equal(isOperationalProgram({ code: 'PIANO', status: 'ACTIVE' }), true)
  assert.equal(isOperationalProgram({ code: 'GUITAR', status: 'ACTIVE' }), true)
  assert.equal(isOperationalProgram({ code: 'VIOLIN', status: 'ACTIVE' }), true)
  assert.equal(isOperationalProgram({ code: 'DRUMS', status: 'ACTIVE' }), true)
  assert.equal(isOperationalProgram({ code: 'DRUMS', status: 'INACTIVE' }), false)
  assert.equal(isOperationalProgram({ code: 'TEST_PIANO', status: 'ACTIVE' }), false)
  assert.equal(isOperationalProgram({ code: 'ZC-CUR', status: 'ACTIVE' }), false)
  assert.equal(isCanonicalProgramCode('GUITAR'), true)
})
