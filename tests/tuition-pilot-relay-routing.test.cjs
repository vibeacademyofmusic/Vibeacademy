const test = require('node:test')
const assert = require('node:assert/strict')
const { webhookUpstream } = require('../scripts/pilot/relay-overlay/pilot-routing.cjs')
const { check } = require('../scripts/pilot/staging-preflight.cjs')
test('staging Zalo cutover does not redirect PayOS or change the prior route before activation', () => {
  const env = { PREVIEW_WEBHOOK_UPSTREAM: 'https://existing.example', ZALO_PILOT_WEBHOOK_UPSTREAM: 'https://pilot.example' }
  assert.equal(webhookUpstream('/api/integrations/zalo/webhook', env), 'https://pilot.example')
  assert.equal(webhookUpstream('/api/integrations/payos/webhook', env), 'https://existing.example')
  assert.equal(webhookUpstream('/api/integrations/zalo/webhook', { ...env, ZALO_PILOT_WEBHOOK_UPSTREAM: '' }), 'https://existing.example')
})
test('staging build rejects production, wrong database, mismatched OA and enabled outbound', () => {
  const env = { VERCEL_ENV: 'preview', VIBE_PILOT_ENVIRONMENT: 'staging', NEXT_PUBLIC_SUPABASE_URL: 'https://owpfqwdrmyzcmjahehek.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture', ZALO_OA_SECRET_KEY: 'fixture', ZALO_APP_ID: '1355275380325944240', ZALO_OA_ID: '4520912928458797082', ZALO_PILOT_OUTBOUND: 'disabled', ZALO_TOKEN_RENEWAL_ENABLED: 'false', ZALO_TEMPLATE_SEND_ENABLED: 'false' }
  assert.deepEqual(check(env), [])
  for (const delta of [{ VERCEL_ENV: 'production' }, { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }, { ZALO_PILOT_OUTBOUND: 'enabled' }, { ZALO_OA_ID: 'other' }, { ZALO_TOKEN_RENEWAL_ENABLED: 'true' }, { ZALO_TEMPLATE_SEND_ENABLED: 'true' }, { VIBE_PILOT_APPROVED_SUPABASE_REF: 'qhznfywwrhmcwbkujclm', NEXT_PUBLIC_SUPABASE_URL: 'https://qhznfywwrhmcwbkujclm.supabase.co' }]) assert.ok(check({ ...env, ...delta }).length)
})
