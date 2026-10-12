const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function access({ signedIn = true, allowed = true, permissionError = null } = {}) {
  const db = { scoped: true }
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/admin/reports/learning/access.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module, exports: module.exports,
    require: name => name === 'next/navigation' ? { redirect: url => { throw new Error(url) } } : {
      requestClaims: async () => ({ data: { claims: signedIn ? { sub: 'test-user' } : null }, error: null }),
      requestOperationalAdmin: async () => ({ data: allowed, error: permissionError }),
      requestClient: async () => db,
    },
  })
  return module.exports.reportAdminClient()
}
test('operational administrator can enter learning reports with the scoped client', async () => {
  assert.equal((await access()).scoped, true)
})
test('unsupported account and permission lookup error cannot enter reports', async () => {
  await assert.rejects(access({ allowed: false }), /\/admin\?error=/)
  await assert.rejects(access({ permissionError: {} }), /\/admin\?error=/)
})
test('missing login session returns to login', async () => {
  await assert.rejects(access({ signedIn: false }), /\/login$/)
})
