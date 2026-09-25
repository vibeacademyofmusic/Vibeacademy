const fs = require('node:fs')
const path = require('node:path')

const filePath = path.join(__dirname, '..', 'zalo_verifierKlcQC8Z773rCw98af_mUELp-p0smY1TJD3Ks.html')

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end('{"ok":false,"error":"PREVIEW_CALLBACK_ONLY"}')
    return
  }
  const body = fs.readFileSync(filePath)
  res.statusCode = 200
  res.setHeader('content-type', 'text/html')
  res.setHeader('content-length', String(body.length))
  res.end(req.method === 'HEAD' ? undefined : body)
}
module.exports.config = { api: { bodyParser: false } }
