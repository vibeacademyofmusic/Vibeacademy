'use strict'

const crypto = require('node:crypto')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const MAX_BODY_BYTES = 65536
const RETRYABLE = new Set([
  'unknown_tracking',
  'send_not_accepted',
  'apply_failed',
  'APPLY_FAILED',
  'IGNORED',
  'unreadable',
])
const SECRET_KEYS = new Set(['access_token', 'refresh_token', 'app_secret', 'oa_secret', 'secret'])

function readEnv(env) {
  const appId = (env.ZALO_APP_ID || '').trim()
  const oaId = (env.ZALO_OA_ID || '').trim()
  const oaSecret = (env.ZALO_OA_SECRET_KEY || '').trim()
  if (!appId || !oaId || !oaSecret) return null
  return { appId, oaId, oaSecret }
}

function partyId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = value.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function signatureOk(header, appId, rawBody, timestamp, oaSecret) {
  if (header == null || String(header).trim() === '') return false
  const match = String(header).trim().match(/^mac\s*=\s*([0-9a-f]{64})$/i)
  if (!match) return false
  const expected = crypto.createHash('sha256')
    .update(appId, 'utf8')
    .update(rawBody)
    .update(timestamp, 'utf8')
    .update(oaSecret, 'utf8')
    .digest('hex')
  const provided = Buffer.from(match[1].toLowerCase(), 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted)
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function openStore(dbPath) {
  const { DatabaseSync } = require('node:sqlite')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=FULL')
  db.exec(`CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY,
    payload_digest TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    external_event_id TEXT,
    payload TEXT,
    status TEXT NOT NULL,
    outcome TEXT,
    received_at TEXT NOT NULL,
    processed_at TEXT
  )`)
  const columns = db.prepare('PRAGMA table_info(webhook_events)').all()
  if (!columns.some((column) => column.name === 'payload')) {
    db.exec('ALTER TABLE webhook_events ADD COLUMN payload TEXT')
  }
  const insert = db.prepare(`INSERT INTO webhook_events
    (payload_digest, event_type, external_event_id, payload, status, outcome, received_at, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const find = db.prepare(`SELECT payload_digest, status, outcome, processed_at
    FROM webhook_events WHERE payload_digest = ?`)
  return {
    save(event) {
      const now = new Date().toISOString()
      const processedAt = RETRYABLE.has(event.outcome) ? null : now
      try {
        insert.run(
          event.payloadDigest,
          event.eventType,
          event.externalEventId,
          event.payload,
          event.status,
          event.outcome,
          now,
          processedAt,
        )
        return { duplicate: false, status: event.status, outcome: event.outcome }
      } catch (error) {
        if (!String(error.message || error).includes('UNIQUE')) throw error
        const existing = find.get(event.payloadDigest)
        return {
          duplicate: true,
          status: existing.status,
          outcome: existing.outcome,
        }
      }
    },
  }
}

function externalEventId(body) {
  const root = body.msg_id
  if (typeof root === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(root)) return root
  const message = body.message
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const msgId = message.msg_id
    if (typeof msgId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(msgId)) return msgId
  }
  return null
}

function processWebhook({ rawBody, signature, env, store }) {
  if (!env) return { status: 503, body: { ok: false, error: 'ZALO_WEBHOOK_NOT_CONFIGURED' } }
  if (!rawBody || Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }
  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }
  if (Object.keys(body).some((key) => SECRET_KEYS.has(key))) {
    return { status: 400, body: { ok: false, error: 'SECRET_MATERIAL_REFUSED' } }
  }
  const appId = body.app_id
  const timestamp = body.timestamp
  const eventName = body.event_name
  if (
    typeof appId !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof eventName !== 'string' ||
    !/^\d{10,16}$/.test(timestamp) ||
    !/^[A-Za-z0-9_]{1,80}$/.test(eventName)
  ) {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }
  if (!signatureOk(signature, appId, rawBody, timestamp, env.oaSecret) || appId !== env.appId) {
    return { status: 401, body: { ok: false, error: 'INVALID_SIGNATURE' } }
  }
  const hasOaField = Object.prototype.hasOwnProperty.call(body, 'oa_id')
  if (hasOaField && body.oa_id !== env.oaId) {
    return { status: 401, body: { ok: false, error: 'INVALID_SIGNATURE' } }
  }
  const addressed = hasOaField || partyId(body.sender) === env.oaId || partyId(body.recipient) === env.oaId
  if (!addressed) {
    const sample = body.message
    if (
      eventName === 'user_send_text' &&
      sample &&
      sample.msg_id === 'This is message id' &&
      sample.text === 'This is testing message'
    ) {
      return { status: 200, body: { ok: true, status: 'VERIFICATION' } }
    }
    return { status: 401, body: { ok: false, error: 'INVALID_SIGNATURE' } }
  }

  const supported = eventName === 'user_click_response_button' || eventName === 'user_received_message'
    || eventName === 'user_send_text'
  const outcome = supported && (eventName === 'user_click_response_button' || eventName === 'user_received_message')
    ? 'unknown_tracking'
    : null
  let saved
  try {
    saved = store.save({
      payloadDigest: crypto.createHash('sha256').update(rawBody).digest('hex'),
      eventType: eventName,
      externalEventId: externalEventId(body),
      payload: rawBody,
      status: supported ? 'ACCEPTED' : 'UNSUPPORTED',
      outcome,
    })
  } catch {
    return { status: 500, body: { ok: false, error: 'WEBHOOK_NOT_RECORDED' } }
  }
  if (saved.outcome && RETRYABLE.has(saved.outcome)) {
    return { status: 503, body: { ok: false, error: 'WEBHOOK_PENDING', status: saved.outcome } }
  }
  return {
    status: 200,
    body: {
      ok: true,
      duplicate: saved.duplicate,
      status: saved.status,
    },
  }
}

function createServer(env, store) {
  return http.createServer(async (req, res) => {
    const urlPath = (req.url || '').split('?')[0]
    if (req.method !== 'POST' || urlPath !== '/api/integrations/zalo/webhook') {
      send(res, 404, { ok: false })
      return
    }
    const chunks = []
    let size = 0
    try {
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          send(res, 400, { ok: false, error: 'MALFORMED_JSON' })
          return
        }
        chunks.push(chunk)
      }
    } catch {
      send(res, 400, { ok: false, error: 'MALFORMED_JSON' })
      return
    }
    const rawBody = Buffer.concat(chunks).toString('utf8')
    const result = processWebhook({
      rawBody,
      signature: req.headers['x-zevent-signature'],
      env,
      store,
    })
    const message = (() => {
      try {
        const parsed = JSON.parse(rawBody)
        return parsed && parsed.message && typeof parsed.message === 'object' ? parsed.message : {}
      } catch {
        return {}
      }
    })()
    console.info(JSON.stringify({
      component: 'zalo_gateway',
      event_name: (() => {
        try { return JSON.parse(rawBody).event_name || null } catch { return null }
      })(),
      http_status: result.status,
      outcome: result.body.status || result.body.error || null,
      tracking_id: typeof message.tracking_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(message.tracking_id)
        ? message.tracking_id
        : null,
    }))
    send(res, result.status, result.body)
  })
}

if (require.main === module) {
  const env = readEnv(process.env)
  if (!env) {
    console.error(JSON.stringify({ component: 'zalo_gateway', result: 'misconfigured' }))
    process.exit(1)
  }
  const dbPath = process.env.GATEWAY_DB || '/var/lib/vibe-zalo-gateway/events.db'
  const server = createServer(env, openStore(dbPath))
  server.listen(3000, '127.0.0.1', () => {
    console.info(JSON.stringify({ component: 'zalo_gateway', result: 'listening' }))
  })
}

module.exports = { processWebhook, readEnv, openStore, createServer }
