const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { verifyAuthDesign } = require('../scripts/auth-design-lock.cjs')
const root = path.resolve(__dirname, '..')

test('approved authentication UI passes the release gate', () => {
  assert.equal(verifyAuthDesign(root), 'vibe-auth-approved-20261009')
})

test('old or modified authentication UI cannot build', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-auth-lock-'))
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/design/approved-auth-design.json')))
    for (const file of ['docs/design/approved-auth-design.json', ...Object.keys(manifest.files)]) {
      const dest = path.join(fixture, file)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(path.join(root, file), dest)
    }
    fs.writeFileSync(path.join(fixture, 'app/login/page.tsx'), '<h1>Management System</h1>')
    assert.throws(() => verifyAuthDesign(fixture), /app\/login\/page.tsx/)
    fs.copyFileSync(path.join(root, 'app/login/page.tsx'), path.join(fixture, 'app/login/page.tsx'))
    fs.unlinkSync(path.join(fixture, 'app/_components/auth/auth-shell.module.css'))
    assert.throws(() => verifyAuthDesign(fixture), /auth-shell.module.css/)
  } finally { fs.rmSync(fixture, { recursive: true, force: true }) }
})

test('checkout without the approved baseline cannot build', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-auth-old-'))
  try { assert.throws(() => verifyAuthDesign(fixture), /ENOENT/) }
  finally { fs.rmSync(fixture, { recursive: true, force: true }) }
})
