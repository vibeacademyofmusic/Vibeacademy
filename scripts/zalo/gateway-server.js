'use strict'

const crypto = require('node:crypto')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const MAX_BODY_BYTES = 65536
const FORWARDABLE_EVENTS = new Set(['user_click_response_button', 'user_received_message'])
const SECRET_KEYS = new Set(['access_token', 'refresh_token', 'app_secret', 'oa_secret', 'secret'])

function readEnv(env) {
  const appId = (env.ZALO_APP_ID || '').trim()
  const oaId = (env.ZALO_OA_ID || '').trim()
  const oaSecret = (env.ZALO_OA_SECRET_KEY || '').trim()
  if (!appId || !oaId || !oaSecret) return null
  return { appId, oaId, oaSecret }
}

function readForwardEnv(env) {
  const raw = (env.GATEWAY_UPSTREAM_URL || '').trim()
  if (!raw) return null
  let url
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
  const interval = Number(env.GATEWAY_FORWARD_INTERVAL_MS || 2000)
  const timeout = Number(env.GATEWAY_FORWARD_TIMEOUT_MS || 8000)
  return {
    url: url.toString(),
    intervalMs: Number.isInteger(interval) && interval >= 1000 ? interval : 2000,
    timeoutMs: Number.isInteger(timeout) && timeout >= 1000 && timeout <= 30000 ? timeout : 8000,
  }
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

function ensureColumn(db, columns, name, ddl) {
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE webhook_events ADD COLUMN ${name} ${ddl}`)
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
  ensureColumn(db, columns, 'payload', 'TEXT')
  ensureColumn(db, columns, 'signature', 'TEXT')
  ensureColumn(db, columns, 'server_header', 'TEXT')
  ensureColumn(db, columns, 'forward_attempts', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, columns, 'next_attempt_at', 'TEXT')
  ensureColumn(db, columns, 'last_http_status', 'INTEGER')
  ensureColumn(db, columns, 'last_error', 'TEXT')
  ensureColumn(db, columns, 'forwarded_at', 'TEXT')

  const insert = db.prepare(`INSERT INTO webhook_events
    (payload_digest, event_type, external_event_id, payload, status, outcome, received_at, processed_at,
     signature, server_header, forward_attempts, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
  const find = db.prepare(`SELECT id, payload_digest, status, outcome, processed_at
    FROM webhook_events WHERE payload_digest = ?`)
  const pending = db.prepare(`SELECT id, payload_digest, event_type, external_event_id, payload, signature, server_header, forward_attempts
    FROM webhook_events
    WHERE processed_at IS NULL
      AND payload IS NOT NULL
      AND signature IS NOT NULL
      AND outcome = 'queued'
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY id
    LIMIT ?`)
  const forwarded = db.prepare(`UPDATE webhook_events
    SET outcome='forwarded', processed_at=?, forwarded_at=?, last_http_status=?, last_error=NULL
    WHERE id=? AND processed_at IS NULL`)
  const retry = db.prepare(`UPDATE webhook_events
    SET forward_attempts=forward_attempts+1, next_attempt_at=?, last_http_status=?, last_error=?
    WHERE id=? AND processed_at IS NULL`)

  return {
    save(event) {
      const now = new Date().toISOString()
      const queued = event.outcome === 'queued'
      try {
        insert.run(
          event.payloadDigest,
          event.eventType,
          event.externalEventId,
          event.payload,
          event.status,
          event.outcome,
          now,
          queued ? null : now,
          event.signature || null,
          event.serverHeader || null,
          queued ? now : null,
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
    pending(limit = 20, now = new Date().toISOString()) {
      return pending.all(now, Math.max(1, Math.min(Number(limit) || 20, 100)))
    },
    markForwarded(id, httpStatus) {
      const now = new Date().toISOString()
      forwarded.run(now, now, httpStatus, id)
    },
    markRetry(id, attempts, httpStatus, errorText) {
      const delaySeconds = Math.min(300, Math.max(2, 2 ** Math.min(Number(attempts) + 1, 8)))
      const next = new Date(Date.now() + delaySeconds * 1000).toISOString()
      retry.run(next, httpStatus ?? null, String(errorText || 'UPSTREAM_FAILED').slice(0, 160), id)
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

function processWebhook({ rawBody, signature, serverHeader = null, env, store }) {
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
  const outcome = supported && FORWARDABLE_EVENTS.has(eventName) ? 'queued' : null
  let saved
  try {
    saved = store.save({
      payloadDigest: crypto.createHash('sha256').update(rawBody).digest('hex'),
      eventType: eventName,
      externalEventId: externalEventId(body),
      payload: rawBody,
      status: supported ? 'ACCEPTED' : 'UNSUPPORTED',
      outcome,
      signature: String(signature || ''),
      serverHeader: typeof serverHeader === 'string' ? serverHeader : null,
    })
  } catch {
    return { status: 500, body: { ok: false, error: 'WEBHOOK_NOT_RECORDED' } }
  }

  // Once the signed provider event is durably stored, this gateway owns delivery.
  // Zalo receives a fast 200 and the background worker retries staging independently.
  return {
    status: 200,
    body: {
      ok: true,
      duplicate: saved.duplicate,
      status: saved.status,
      queued: saved.outcome === 'queued',
    },
  }
}

async function forwardPending(store, forwardEnv, transport = fetch, limit = 20) {
  if (!forwardEnv) return { attempted: 0, forwarded: 0, failed: 0, disabled: true }
  const rows = store.pending(limit)
  let forwarded = 0
  let failed = 0
  for (const row of rows) {
    let httpStatus = null
    try {
      const headers = {
        'content-type': 'application/json; charset=utf-8',
        'x-zevent-signature': row.signature,
        'x-vibe-zalo-relay': 'vietnam-gateway',
      }
      if (row.server_header) headers['x-zevent-server'] = row.server_header
      const response = await transport(forwardEnv.url, {
        method: 'POST',
        headers,
        body: row.payload,
        redirect: 'error',
        signal: AbortSignal.timeout(forwardEnv.timeoutMs),
      })
      httpStatus = Number(response.status) || null
      if (response.ok) {
        store.markForwarded(row.id, httpStatus)
        forwarded += 1
        console.info(JSON.stringify({
          component: 'zalo_gateway_forward',
          event_id: row.id,
          event_type: row.event_type,
          external_event_id: row.external_event_id || null,
          http_status: httpStatus,
          outcome: 'forwarded',
        }))
        continue
      }
      failed += 1
      store.markRetry(row.id, row.forward_attempts, httpStatus, `HTTP_${httpStatus ?? 'UNKNOWN'}`)
    } catch (error) {
      failed += 1
      store.markRetry(row.id, row.forward_attempts, httpStatus, error instanceof Error ? error.name : 'UPSTREAM_FAILED')
    }
    console.info(JSON.stringify({
      component: 'zalo_gateway_forward',
      event_id: row.id,
      event_type: row.event_type,
      external_event_id: row.external_event_id || null,
      http_status: httpStatus,
      outcome: 'retry',
    }))
  }
  return { attempted: rows.length, forwarded, failed, disabled: false }
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
      serverHeader: req.headers['x-zevent-server'],
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
  const store = openStore(dbPath)
  const forwardEnv = readForwardEnv(process.env)
  const server = createServer(env, store)
  server.listen(3000, '127.0.0.1', () => {
    console.info(JSON.stringify({
      component: 'zalo_gateway',
      result: 'listening',
      forwarding: Boolean(forwardEnv),
    }))
  })
  if (forwardEnv) {
    const run = () => forwardPending(store, forwardEnv).catch(() => undefined)
    run()
    setInterval(run, forwardEnv.intervalMs)
  }
}

module.exports = { processWebhook, readEnv, readForwardEnv, openStore, createServer, forwardPending }
