// Real local Auth and Storage verification. No browser/user session is read.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { createClient } = require('@supabase/supabase-js')
const workdir = '/private/tmp/vibe-execution-20260930'
const origin = 'http://127.0.0.1:56321'
async function main() {
  const status = execFileSync('node_modules/.bin/supabase', ['status', '--workdir', workdir, '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const env = Object.fromEntries([...status.matchAll(/^([A-Z0-9_]+)="([^\"]*)"$/gm)].map(m => [m[1], m[2]]))
  assert.equal(env.API_URL, origin)
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => {
    assert.equal(new URL(url).origin, origin, 'External HTTP blocked')
    return fetch(url, { ...init, redirect: 'error' })
  } } }
  const root = createClient(origin, env.SERVICE_ROLE_KEY, options)
  const client = createClient(origin, env.ANON_KEY, options)
  const password = crypto.randomBytes(24).toString('base64url') + 'aA!7'
  const email = `platform.${crypto.randomUUID()}@example.test`
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(created.error)
  const signed = await client.auth.signInWithPassword({ email, password })
  assert.ifError(signed.error)
  assert.equal(signed.data.user.id, created.data.user.id)
  const bucket = 'execution-byte-probe'
  const buckets = await root.storage.listBuckets()
  assert.ifError(buckets.error)
  if (!buckets.data.some(b => b.id === bucket)) assert.ifError((await root.storage.createBucket(bucket, { public: false })).error)
  const bytes = Buffer.from('VIBE synthetic Storage bytes 20260930\n')
  const object = `${crypto.randomUUID()}.txt`
  assert.ifError((await root.storage.from(bucket).upload(object, bytes, { contentType: 'text/plain' })).error)
  const downloaded = await root.storage.from(bucket).download(object)
  assert.ifError(downloaded.error)
  assert.deepEqual(Buffer.from(await downloaded.data.arrayBuffer()), bytes)
  const denied = await client.storage.from(bucket).download(object)
  assert.ok(denied.error, 'Synthetic user must not read a private service-owned object')
  assert.ifError((await client.auth.signOut()).error)
  const result = { auth_password_sign_in: 'PASS', storage_upload_download_bytes: 'PASS',
    private_storage_access: 'DENIED', bucket, object, byte_count: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    external_http: 'blocked by exact local origin', source_recovery: 'not tested; synthetic local platform only' }
  fs.writeFileSync('docs/verification/execution-20260930/raw/platform.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
