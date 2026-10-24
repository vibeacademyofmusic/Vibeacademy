// Test-process preload only. Never imported by the deployed application.
const net = require('node:net')
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
const blocked = () => Object.assign(new Error('VIBE_LOCAL_EXTERNAL_NETWORK_BLOCKED'), { code: 'VIBE_LOCAL_EXTERNAL_NETWORK_BLOCKED' })
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!local(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw blocked()
  return originalFetch(input, { ...init, redirect: 'error' })
}
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  // Node normalizes overloads into an array before invoking this method.
  const normalized = Array.isArray(args[0]) ? args[0] : args
  const options = normalized[0]
  if (typeof options === 'object') {
    if (!options.path && !local(options.host ?? 'localhost')) throw blocked()
  } else if (typeof options === 'number') {
    if (!local(typeof normalized[1] === 'string' ? normalized[1] : 'localhost')) throw blocked()
  } else if (typeof options === 'string') {
    // String paths are local Unix sockets; numeric string ports use TCP.
    if (/^\d+$/.test(options) && !local(typeof normalized[1] === 'string' ? normalized[1] : 'localhost')) throw blocked()
  } else throw blocked()
  return originalConnect.apply(this, args)
}
