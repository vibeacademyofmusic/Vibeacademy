/* eslint-disable @typescript-eslint/no-require-imports -- Execute real server actions. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected } = require('./helpers/finance-operations.cjs')
function setup(role, error = null, signedIn = true) {
  const h = harness({}, null, false, signedIn)
  h.db.rpc = async (name, args) => {
    h.calls.push({ name, args })
    return name === 'has_role' ? { data: args.role_code === role, error: null } : { data: null, error }
  }
  return { h, action: h.load('../students/actions.ts').updateStudentBasic }
}
test('branch basic update forwards only safe fields; ignores forged branch/status/account', async () => {
  const { h, action } = setup('BRANCH_ADMIN')
  const result = await redirected(action, { id: id(1), full_name: 'Name', preferred_name: 'N', branch_id: id(2), status: 'ACTIVE', user_id: id(3) })
  assert.ok(result.searchParams.has('success'))
  assert.deepEqual(h.calls.find(c => c.name === 'update_student_basic').args, { p_student: id(1), p_full_name: 'Name', p_preferred_name: 'N' })
})
test('database cross-branch denial is not reported as success', async () => {
  const { h, action } = setup('BRANCH_ADMIN', { message: 'Unauthorized' })
  const result = await redirected(action, { id: id(1), full_name: 'Name' })
  assert.ok(result.searchParams.has('error'))
  assert.equal(h.invalidated.length, 0)
})
test('client supplied admin role cannot bypass staff authentication', async () => {
  const { h, action } = setup('PARENT')
  const result = await redirected(action, { id: id(1), full_name: 'Name', role: 'SUPER_ADMIN' })
  assert.equal(result.pathname, '/login')
  assert.ok(!h.calls.some(c => c.name === 'update_student_basic'))
})
test('signed-out user cannot reach mutation RPC', async () => {
  const { h, action } = setup('SUPER_ADMIN', null, false)
  assert.equal((await redirected(action, { id: id(1), full_name: 'Name' })).pathname, '/login')
  assert.equal(h.calls.length, 0)
})
test('invalid input is rejected before mutation RPC', async () => {
  const { h, action } = setup('BRANCH_ADMIN')
  assert.ok((await redirected(action, { id: 'bad', full_name: '' })).searchParams.has('error'))
  assert.ok(!h.calls.some(c => c.name === 'update_student_basic'))
})
