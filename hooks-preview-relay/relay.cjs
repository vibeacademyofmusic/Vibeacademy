const ALLOWED = new Set([
  '/api/integrations/payos/webhook',
  '/api/integrations/zalo/webhook',
])
const FORWARDED_HEADERS = ['content-type', 'x-zevent-signature', 'x-zevent-timestamp']
const MAX_BODY_BYTES = 64 * 1024
const UPSTREAM_TIMEOUT_MS = 8000

function json(status, error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function relayRequest(request, upstream, fetchImpl, options = {}) {
  const url = new URL(request.url)
  if (request.method !== 'POST' || !ALLOWED.has(url.pathname)) return json(404, 'PREVIEW_CALLBACK_ONLY')
  let target
  try {
    target = new URL(upstream)
  } catch {
    return json(503, 'PREVIEW_UPSTREAM_UNSET')
  }
  if (target.protocol !== 'https:') return json(503, 'PREVIEW_UPSTREAM_UNSET')
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return json(413, 'PREVIEW_BODY_TOO_LARGE')
  const body = Buffer.from(await request.arrayBuffer())
  if (body.length > maxBytes) return json(413, 'PREVIEW_BODY_TOO_LARGE')
  const headers = {}
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers[name] = value
  }
  target.pathname = url.pathname
  target.search = ''
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS
  let timer
  try {
    const response = await Promise.race([
      fetchImpl(target, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('timeout')
          error.name = 'TimeoutError'
          reject(error)
        }, timeoutMs)
      }),
    ])
    const out = Buffer.from(await response.arrayBuffer())
    return new Response(out, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return json(timedOut ? 504 : 502, timedOut ? 'PREVIEW_UPSTREAM_TIMEOUT' : 'PREVIEW_UPSTREAM_FAILED')
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { relayRequest, ALLOWED, FORWARDED_HEADERS, MAX_BODY_BYTES, UPSTREAM_TIMEOUT_MS }
