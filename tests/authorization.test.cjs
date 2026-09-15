/* eslint-disable @typescript-eslint/no-require-imports -- Test actual TypeScript authorization helper through the shared harness. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id } = require('./helpers/finance-operations.cjs')
function setup(signedIn, role, permission, error = null) {
  const h = harness({}, null, role, signedIn)
  h.db.rpc = async (name, args) => {
    h.calls.push({ name, args })
    return { data: name === 'has_role' ? role : permission, error }
  }
  return { h, authorize: h.load('../../../lib/authorization.ts').requireAdminPermission }
}
test('unauthenticated request stops before authorization RPCs', async () => {
  const { h, authorize } = setup(false, true, true)
  await assert.rejects(authorize('branches.manage'), e => e.url === '/login')
  assert.equal(h.calls.length, 0)
})
test('permission alone cannot open legacy admin actions to a new role', async () => {
  const { h, authorize } = setup(true, false, true)
  await assert.rejects(authorize('branches.manage'), e => e.url.includes('Unauthorized'))
  assert.equal(h.calls.length, 1)
})
test('admin with denied permission cannot mutate', async () => {
  const { authorize } = setup(true, true, false)
  await assert.rejects(authorize('branches.manage'), e => e.url.includes('Unauthorized'))
})
test('authorization RPC errors fail closed', async () => {
  const { authorize } = setup(true, true, true, { message: 'unavailable' })
  await assert.rejects(authorize('branches.manage'), e => e.url.includes('Unauthorized'))
})
test('active admin permission returns session client and forwards explicit branch scope', async () => {
  const { h, authorize } = setup(true, true, true)
  assert.equal(await authorize('branches.manage', id(3)), h.db)
  assert.deepEqual(h.calls, [
    { name: 'has_role', args: { role_code: 'SUPER_ADMIN' } },
    { name: 'has_permission', args: { p_permission: 'branches.manage', p_branch: id(3) } },
  ])
})
