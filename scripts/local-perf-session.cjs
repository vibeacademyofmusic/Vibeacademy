#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js')
const { execFileSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const { localUrl, guardedFetch } = require('./local-bootstrap-admin.cjs')

async function main() {
  const output = execFileSync('./node_modules/.bin/supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="([^"]*)"$/)
    if (m) values[m[1]] = m[2]
  }
  const url = localUrl(values.API_URL)
  const admin = createClient(url, values.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: guardedFetch(url) },
  })
  const email = 'admin@vibe.local'
  const password = 'LocalPerfAudit-Admin-2026!'
  let user
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    user = data.users.find(u => u.email?.toLowerCase() === email)
    if (user || data.users.length < 100) break
  }
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    user = data.user
    console.log('created')
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
    if (error) throw error
    console.log('password_reset')
  }
  await admin.from('profiles').upsert({ id: user.id, full_name: 'Local Developer Admin', status: 'ACTIVE' }, { onConflict: 'id' })
  const { data: role } = await admin.from('roles').select('id').eq('code', 'SUPER_ADMIN').single()
  const { data: existing } = await admin.from('user_roles').select('id').eq('user_id', user.id).eq('role_id', role.id).maybeSingle()
  if (!existing) {
    const { error } = await admin.from('user_roles').insert({ user_id: user.id, role_id: role.id })
    if (error) throw error
    console.log('role_granted')
  } else console.log('role_ok')

  // Sign in as browser would and capture cookies for authenticated curl timing
  const anon = createClient(url, values.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: guardedFetch(url) },
  })
  const { data: session, error: signError } = await anon.auth.signInWithPassword({ email, password })
  if (signError || !session.session) throw signError || new Error('no session')
  writeFileSync('/tmp/vibe-perf-session.json', JSON.stringify({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_at: session.session.expires_at,
    user_id: user.id,
  }))
  console.log('session_saved=/tmp/vibe-perf-session.json')
  console.log('EMAIL_READY=' + email)
}
main().catch(err => { console.error(err); process.exit(1) })
