#!/usr/bin/env node
const { execFileSync } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const REFUSED = 'REFUSED: local admin bootstrap can only run against local Supabase.'
function localUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new Error(REFUSED) }
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:' ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(REFUSED)
  }
  // Pin localhost to loopback; no DNS lookup or redirect may send credentials elsewhere.
  url.hostname = '127.0.0.1'
  return url.origin
}
function readLocalStatus() {
  let output
  try {
    output = execFileSync(path.resolve(__dirname, '../node_modules/.bin/supabase'),
      ['status', '-o', 'env'], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      })
  } catch {
    throw new Error('Local Supabase is unavailable. Run npx supabase start first.')
  }
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="([^"]*)"$/)
    if (match) values[match[1]] = match[2]
  }
  const url = localUrl(values.API_URL)
  if (!values.SERVICE_ROLE_KEY) throw new Error('Local Supabase service-role credential is missing.')
  return { url, key: values.SERVICE_ROLE_KEY }
}
function parseEmail(args) {
  if (!args.length) return 'admin@vibe.local'
  if (args.length !== 2 || args[0] !== '--email' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1])) {
    throw new Error('Usage: npm run local:bootstrap-admin -- --email admin@vibe.local')
  }
  return args[1].toLowerCase()
}
function guardedFetch(origin, fetchImpl = fetch) {
  origin = localUrl(origin)
  return (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? input.href)
    if (url.origin !== origin) throw new Error(REFUSED)
    return fetchImpl(input, { ...init, redirect: 'error' })
  }
}
async function bootstrap({ email, url, key, log = console.log }) {
  url = localUrl(url) // Before constructing any API client, including in tests.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: guardedFetch(url) },
  })
  const { data: role, error: roleError } = await client.from('roles').select('id').eq('code', 'SUPER_ADMIN').single()
  if (roleError || !role) throw new Error('SUPER_ADMIN role is unavailable. Apply local migrations first.')
  let user
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Cannot list local auth users.')
    user = data.users.find(item => item.email?.toLowerCase() === email)
    if (user || data.users.length < 100) break
  }
  let created = false
  if (!user) {
    const password = randomBytes(32).toString('base64url')
    const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error('Cannot create local auth user. Rerun to check whether it already exists.')
    user = data.user
    created = true
    // Print immediately after creation so a later profile/role failure cannot lose the password.
    log(`Created local auth user: ${email}\nInitial password (shown only on creation): ${password}`)
  }
  const { error: profileError } = await client.from('profiles').upsert(
    { id: user.id, full_name: 'Local Developer Admin' }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileError) throw new Error('Cannot ensure local profile. Rerun bootstrap to retry; password is unchanged.')
  const { data: assignments, error: assignmentError } = await client.from('user_roles')
    .select('id').eq('user_id', user.id).eq('role_id', role.id).is('branch_id', null)
  if (assignmentError) throw new Error('Cannot read local role assignments.')
  if (!assignments.length) {
    const { error } = await client.from('user_roles').insert({ user_id: user.id, role_id: role.id })
    // The existing unique scope index also prevents duplicates from concurrent runs.
    if (error && error.code !== '23505') throw new Error('Cannot assign local SUPER_ADMIN. Rerun bootstrap to retry.')
  }
  log(`PASS: ${email} has a local profile and SUPER_ADMIN.${created ? '' : ' Existing password unchanged.'}`)
}
async function main() {
  const email = parseEmail(process.argv.slice(2))
  await bootstrap({ email, ...readLocalStatus() })
}
if (require.main === module) main().catch(error => {
  // Do not print SDK responses, status output, service keys, or request bodies.
  console.error(error.message === REFUSED ? REFUSED : `FAILED: ${error.message}`)
  process.exitCode = 1
})
module.exports = { REFUSED, localUrl, guardedFetch, parseEmail, bootstrap }
