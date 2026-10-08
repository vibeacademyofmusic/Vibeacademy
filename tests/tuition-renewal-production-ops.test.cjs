const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readConfig, run } = require('../scripts/tuition/renewal-maintenance-runner.cjs')

test('production renewal runner accepts only HTTPS internal maintenance endpoints', () => {
  assert.equal(readConfig({}), null)
  assert.equal(readConfig({ VIBE_MAINTENANCE_URL: 'http://manage.vibe.edu.vn/api/internal/zalo/maintenance', CRON_SECRET: 'secret' }), null)
  assert.equal(readConfig({ VIBE_MAINTENANCE_URL: 'https://manage.vibe.edu.vn/not-maintenance', CRON_SECRET: 'secret' }), null)
  const config = readConfig({ VIBE_MAINTENANCE_URL: 'https://manage.vibe.edu.vn/api/internal/zalo/maintenance', CRON_SECRET: 'secret' })
  assert.equal(config.url, 'https://manage.vibe.edu.vn/api/internal/zalo/maintenance')
  assert.equal(config.timeoutMs, 30000)
})

test('production renewal runner sends one bearer request without exposing the secret in its result', async () => {
  const calls = []
  const config = readConfig({ VIBE_MAINTENANCE_URL: 'https://manage.vibe.edu.vn/api/internal/tuition/renewal-automation', CRON_SECRET: 'top-secret' })
  const result = await run(config, async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ state: 'OK', claimed: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.authorization, 'Bearer top-secret')
  assert.equal(result.renewal_state, 'OK')
  assert.equal(result.renewal_claimed, 1)
  assert.equal(JSON.stringify(result).includes('top-secret'), false)
})
