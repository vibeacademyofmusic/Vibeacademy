const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const load = require('./helpers/zalo-module-loader.cjs')()
const { writePilotFailure, correlationFromError } = load('lib/observability/pilot-failure.ts')

test('synthetic server failure log has environment, time, and correlation without secrets or student data', () => {
  const lines = []
  const record = writePilotFailure({
    failure: 'SERVER_REQUEST',
    correlationId: 'corr-synthetic-001',
  }, { VERCEL_ENV: 'preview' }, line => lines.push(line), new Date('2026-09-30T00:00:00.000Z'))
  const leaked = {
    token: 'live-looking-token',
    studentName: 'Nguyen Van A',
    phone: '84987654321',
  }
  const text = lines.join('\n')
  assert.equal(lines.length, 1)
  assert.equal(record.failure, 'SERVER_REQUEST')
  assert.equal(record.environment, 'preview')
  assert.equal(record.timestamp, '2026-09-30T00:00:00.000Z')
  assert.equal(record.correlationId, 'corr-synthetic-001')
  assert.equal(text.includes(leaked.token), false)
  assert.equal(text.includes(leaked.studentName), false)
  assert.equal(text.includes(leaked.phone), false)
  assert.equal(Object.keys(JSON.parse(text)).sort().join(','), 'correlationId,environment,failure,source,timestamp')
})

test('request errors use the digest and do not log the error message', () => {
  const id = correlationFromError(Object.assign(new Error('student Nguyen Van A token live-looking-token'), { digest: 'digest-abc' }))
  assert.equal(id, 'digest-abc')
  const lines = []
  writePilotFailure({ failure: 'SERVER_REQUEST', correlationId: id }, { VERCEL_ENV: 'preview' }, line => lines.push(line))
  assert.equal(lines[0].includes('Nguyen'), false)
  assert.equal(lines[0].includes('live-looking-token'), false)
  const source = fs.readFileSync('instrumentation.ts', 'utf8')
  assert.match(source, /onRequestError/)
  assert.match(source, /writePilotFailure/)
  assert.equal(source.includes('error.message'), false)
})
