const { relayRequest, MAX_BODY_BYTES } = require('./relay.cjs')

async function readLimited(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function handleNodeRequest(req, res, env = process.env, fetchImpl = globalThis.fetch) {
  const body = req.method === 'GET' || req.method === 'HEAD' ? Buffer.alloc(0) : await readLimited(req, MAX_BODY_BYTES)
  if (body === null) {
    res.statusCode = 413
    res.setHeader('content-type', 'application/json')
    res.end('{"ok":false,"error":"PREVIEW_BODY_TOO_LARGE"}')
    return
  }
  const host = req.headers.host || 'hooks-preview.vibe.edu.vn'
  const headers = {}
  for (const name of ['content-type', 'content-length', 'x-zevent-signature', 'x-zevent-timestamp']) {
    const value = req.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  const request = new Request(`https://${host}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  })
  const result = await relayRequest(request, env.PREVIEW_WEBHOOK_UPSTREAM, fetchImpl)
  res.statusCode = result.status
  res.setHeader('content-type', result.headers.get('content-type') || 'application/json')
  res.end(Buffer.from(await result.arrayBuffer()))
}

module.exports = { handleNodeRequest }
