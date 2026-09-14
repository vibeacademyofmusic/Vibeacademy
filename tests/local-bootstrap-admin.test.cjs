const { test } = require('node:test')
const assert = require('node:assert/strict')
const { REFUSED, localUrl, guardedFetch, parseEmail, bootstrap } = require('../scripts/local-bootstrap-admin.cjs')
test('only explicit HTTP loopback endpoints are allowed', () => {
  assert.equal(localUrl('http://localhost:54321'), 'http://127.0.0.1:54321')
  assert.equal(localUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321')
  for (const url of ['https://project.supabase.co', 'http://localhost.example.com', 'http://127.0.0.1@example.com', 'http://192.168.1.5', 'http://localhost/path', 'http://localhost?url=remote', 'not a URL']) {
    assert.throws(() => localUrl(url), { message: REFUSED })
  }
})
test('bootstrap refuses a nonlocal URL before any network request', async () => {
  await assert.rejects(bootstrap({ email: 'test@vibe.local', url: 'https://example.invalid', key: 'mock' }), { message: REFUSED })
})
test('every request is pinned to local origin and redirects are forbidden', async () => {
  let calls = 0
  const request = guardedFetch('http://127.0.0.1:54321', async (_, options) => {
    calls++; assert.equal(options.redirect, 'error')
  })
  assert.throws(() => request('https://example.invalid'), { message: REFUSED })
  assert.equal(calls, 0)
  await request('http://127.0.0.1:54321/auth/v1/admin/users')
  assert.equal(calls, 1)
})
test('email is configurable; no force, URL, password, or credential overrides', () => {
  assert.equal(parseEmail([]), 'admin@vibe.local')
  assert.equal(parseEmail(['--email', 'TEST@vibe.local']), 'test@vibe.local')
  for (const flag of ['--force-production', '--url', '--password', '--service-role-key']) {
    assert.throws(() => parseEmail([flag, 'anything']))
  }
})
test('a refused target exits nonzero with the exact refusal message', () => {
  const { spawnSync } = require('node:child_process')
  const script = `require('./scripts/local-bootstrap-admin.cjs').bootstrap({email:'test@vibe.local',url:'https://example.invalid',key:'mock'}).catch(error => { console.error(error.message); process.exitCode = 1 })`
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), REFUSED)
})
