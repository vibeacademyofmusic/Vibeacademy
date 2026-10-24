const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

function verifyAuthDesign(root = path.resolve(__dirname, '..')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/design/approved-auth-design.json'), 'utf8'))
  const failures = []
  for (const [file, expected] of Object.entries(manifest.files)) {
    const target = path.join(root, file)
    if (!fs.existsSync(target) || createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== expected) failures.push(file)
  }
  if (failures.length) throw new Error(`Approved VIBE authentication design changed or missing: ${failures.join(', ')}. Restore the approved files; a new design requires user approval and rendered desktop/mobile verification before updating the manifest.`)
  return manifest.version
}

if (require.main === module) {
  try { console.log(`Approved VIBE authentication design verified: ${verifyAuthDesign()}`) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { verifyAuthDesign }
