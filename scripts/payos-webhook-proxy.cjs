const http = require('node:http')

const listen = Number(process.env.PAYOS_PROXY_PORT || 3099)
const target = new URL(process.env.PAYOS_PROXY_TARGET || 'http://127.0.0.1:3000')
const allowed = new Set([
  '/api/integrations/payos/webhook',
  '/api/integrations/zalo/webhook',
])
const allowedHosts = new Set([
  ...String(process.env.PAYOS_PROXY_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean),
])

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const host = String(request.headers.host || '').split(':')[0].toLowerCase()
  if (request.method !== 'POST' || !allowed.has(url.pathname) || !allowedHosts.has(host)) {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"ok":false,"error":"PREVIEW_CALLBACK_ONLY"}')
    return
  }
  const headers = { ...request.headers, host: target.host }
  const forwarded = http.request({
    hostname: target.hostname,
    port: target.port,
    path: url.pathname,
    method: 'POST',
    headers,
  }, (upstream) => {
    response.writeHead(upstream.statusCode || 502, upstream.headers)
    upstream.pipe(response)
  })
  forwarded.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' })
    response.end('{"ok":false,"error":"PREVIEW_UNREACHABLE"}')
  })
  request.pipe(forwarded)
})

server.listen(listen, '127.0.0.1', () => {
  console.log(`preview-callback-proxy listening 127.0.0.1:${listen}`)
})
