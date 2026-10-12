const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function runLogin({ role, lead = false, authError = null, gateError = null }) {
  let signedOut = false
  const db = {
    auth: {
      signInWithPassword: async () => ({ error: authError }),
      signOut: async () => { signedOut = true },
    },
    rpc: async (fn, args) => fn === 'operational_admin'
      ? { data: lead, error: gateError }
      : { data: args?.role_code === role, error: null },
  }
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync('app/login/actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: name => {
      if (name === 'next/cache') return { revalidatePath() {} }
      if (name === 'next/navigation') return { redirect: path => { throw { redirect: path } } }
      if (name === '@/lib/supabase/server') return { createClient: async () => db }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  const form = new FormData()
  form.set('email', 'synthetic@example.test')
  form.set('password', 'synthetic-test-password')
  let destination
  try { await module.exports.login(form) } catch (error) {
    if (!error.redirect) throw error
    destination = error.redirect
  }
  return { destination, signedOut }
}

test('operations lead enters admin without the SUPER_ADMIN role', async () => {
  assert.deepEqual(await runLogin({ lead: true }), { destination: '/admin', signedOut: false })
})
test('existing owner and finance destinations remain available', async () => {
  assert.equal((await runLogin({ role: 'SUPER_ADMIN' })).destination, '/admin')
  assert.equal((await runLogin({ role: 'FINANCE' })).destination, '/finance')
})
test('authenticated account without a supported role is signed out', async () => {
  assert.deepEqual(await runLogin({}), {
    destination: '/login?error=This%20account%20does%20not%20have%20admin%20access', signedOut: true,
  })
})
test('failed operational permission lookup does not admit an account', async () => {
  assert.equal((await runLogin({ lead: true, gateError: { message: 'unavailable' } })).signedOut, true)
})
test('invalid password cannot enter the role routing flow', async () => {
  assert.equal((await runLogin({ lead: true, authError: { message: 'invalid' } })).destination,
    '/login?error=Invalid%20email%20or%20password')
})
