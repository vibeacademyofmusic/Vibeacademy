const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { resolveModule } = require('./helpers/resolve-module.cjs')

function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const mod = { exports: {} }
  const req = name => {
    if (name in mocks) return mocks[name]
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) }
    if (name.startsWith('.') || name.startsWith('@/')) return load(resolveModule(file, name), mocks)
    return require(name)
  }
  new Function('require', 'module', 'exports', source)(req, mod, mod.exports)
  return mod.exports
}
const { normalizeYouTubeLink } = load(path.resolve('lib/academic-video-links.ts'))
const url = 'https://www.youtube.com/watch?v=abcdefghijk'
const student = '10000000-0000-4000-8000-000000000001'
const enrollment = '20000000-0000-4000-8000-000000000001'
const linkId = '30000000-0000-4000-8000-000000000001'
const link = { id: linkId, title: '<script>test</script>', url, note: '<img src=x onerror=alert(1)>', version: 1, level_id: null, item_id: null, shared_with_family: true }

test('YouTube watch, mobile, Shorts, live and share links resolve to one canonical video', () => {
  for (const value of [url, 'https://youtu.be/abcdefghijk?si=tracking', 'https://m.youtube.com/watch?v=abcdefghijk&t=20', 'https://youtube.com/shorts/abcdefghijk', 'https://youtube.com/live/abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk']) assert.equal(normalizeYouTubeLink(value), url)
})
test('rejects scripts, HTML, spoofed hosts, credentials, playlist redirects and malformed IDs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//youtu.be/abcdefghijk', 'http://youtu.be/abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'https://evil@youtube.com/watch?v=abcdefghijk', 'https://youtu.be:8443/abcdefghijk', 'https://youtu.be/abc', 'https://youtube.com/redirect?q=x', 'https://youtube.com/playlist?list=x', 'https://youtube.com/watch?v=abcdefghijk&v=other', '<iframe src="x">', 'https://youtu.be/abcdefghijk\n/evil', 'https://youtube.com\\@evil.test/watch?v=abcdefghijk']) assert.equal(normalizeYouTubeLink(value), null, value)
})

function harness({ signedIn = true, error = null, data = linkId } = {}) {
  const calls = [], refreshed = []
  const db = { auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: 'actor' } } : null }) }, rpc: async (name, args) => { calls.push({ name, args }); return { error, data } } }
  const mocks = { '@/lib/supabase/server': { createClient: async () => db }, 'next/cache': { revalidatePath: path => refreshed.push(path) } }
  return { calls, refreshed, actions: load(path.resolve('app/_components/academic-video-links/actions.ts'), mocks), data: load(path.resolve('app/_components/academic-video-links/data.ts'), mocks) }
}
function form(extra = {}) {
  const value = new FormData()
  for (const [key, item] of Object.entries({ student_id: student, enrollment_id: enrollment, title: 'Video', url, version: '0', level_id: enrollment, item_id: linkId, ...extra })) value.set(key, item)
  return value
}
test('signed-out save and remove never invoke database mutations', async () => {
  const h = harness({ signedIn: false })
  assert.equal((await h.actions.saveVideoLink({}, form())).ok, false)
  assert.equal((await h.actions.removeVideoLink({}, form({ id: linkId, version: '1' }))).ok, false)
  assert.equal(h.calls.length, 0)
})
test('invalid fields fail before mutation; empty lesson selection is rejected', async () => {
  const h = harness()
  for (const extra of [{ url: 'https://evil.test' }, { title: '' }, { note: 'x'.repeat(1001) }, { item_id: '' }, { level_id: '' }, { id: linkId, version: '0' }, { version: '1' }]) assert.equal((await h.actions.saveVideoLink({}, form(extra))).ok, false)
  assert.equal(h.calls.length, 0)
})
test('save defaults to internal, canonicalizes link and refreshes all affected views', async () => {
  const h = harness()
  const result = await h.actions.saveVideoLink({}, form({ url: 'https://youtu.be/abcdefghijk?si=tracking', created_by: 'forged', status: 'PASS' }))
  assert.equal(result.ok, true)
  assert.deepEqual(h.calls, [{ name: 'save_academic_video_link', args: { p_student: student, p_enrollment: enrollment, p_id: null, p_version: 0, p_title: 'Video', p_url: url, p_note: null, p_level: enrollment, p_item: linkId, p_shared: false } }])
  assert.deepEqual(h.refreshed, [`/admin/students/${student}`, `/operations/teacher/students/${student}`, '/my-learning'])
})
test('edit uses explicit sharing and expected version; remove includes student and enrollment scope', async () => {
  const h = harness()
  assert.equal((await h.actions.saveVideoLink({}, form({ id: linkId, version: '2', shared_with_family: 'on' }))).ok, true)
  assert.equal(h.calls[0].args.p_shared, true)
  assert.equal(h.calls[0].args.p_version, 2)
  assert.equal((await h.actions.removeVideoLink({}, form({ id: linkId, version: '2' }))).ok, true)
  assert.deepEqual(h.calls[1], { name: 'remove_academic_video_link', args: { p_student: student, p_enrollment: enrollment, p_id: linkId, p_version: 2 } })
})
test('database denial, duplicates and concurrent edits do not report success or expose errors', async () => {
  for (const error of [{ code: '42501' }, { code: '23505' }, { message: 'VIDEO_LINK_STALE' }, { message: 'secret database failure' }]) {
    const h = harness({ error })
    const result = await h.actions.saveVideoLink({}, form())
    assert.equal(result.ok, false)
    assert.doesNotMatch(result.message, /secret/)
    assert.equal(h.refreshed.length, 0)
  }
})
test('read failures are not rendered as a successful empty video list', async () => {
  await assert.rejects(harness({ error: { message: 'missing migration' } }).data.loadVideoLinks(student, enrollment), /Không thể tải link video/)
  await assert.rejects(harness({ data: null }).data.loadVideoLinks(student, enrollment), /Không thể tải link video/)
})

function render(canManage, links = [link]) {
  const { default: VideoLinks } = load(path.resolve('app/_components/academic-video-links/VideoLinks.tsx'), {
    './actions': { saveVideoLink: async () => {}, removeVideoLink: async () => {} },
    'next/link': { default: ({ children }) => children },
  })
  return renderToStaticMarkup(React.createElement(VideoLinks, { studentId: student, enrollmentId: enrollment, context: { can_manage: canManage, links, levels: [], lessons: [] } }))
}
test('reader sees safe external links and escaped text without edit controls', () => {
  const html = render(false)
  assert.match(html, /Xem video/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|<img|Sửa link|Gỡ link|Thêm link|<iframe/)
})
test('manager sees existing controls and empty state; malformed stored links never become anchors', () => {
  assert.match(render(true), /Thêm link video/)
  assert.match(render(true), /Sửa link/)
  assert.match(render(true, []), /Chưa có link video/)
  const html = render(false, [{ ...link, url: 'javascript:alert(1)' }])
  assert.match(html, /Link video không hợp lệ/)
  assert.doesNotMatch(html, /href="javascript:/)
})
