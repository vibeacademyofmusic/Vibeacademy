const test = require('node:test'), assert = require('node:assert/strict'), { createHash } = require('node:crypto')
const { load, snapshot } = require('./helpers/report-runtime.cjs')
const { serveLearningReportPdf, prepareLearningReportPdf } = load('lib/reports/public-pdf.ts')
const { reportPublicOrigin, reportParametersValid } = load('lib/reports/public-link.ts')
const token = 'a'.repeat(64), id = '10000000-0000-4000-8000-000000000001'
function fixture() {
  const state = { revoked: false, ready: false, bytes: null, reads: 0, uploads: 0, lookups: 0, busy: false, corrupt: false }
  const admin = { rpc: async (name, args) => {
    if (name === 'resolve_learning_report_pdf') { state.lookups++; return { data: args.p_token !== token || state.revoked ? null : { report_id: id, version: 2, state: state.ready ? 'READY' : 'PENDING', path: `${id}/v2.pdf`, sha256: state.sha, bytes: state.bytes?.length } } }
    if (name === 'claim_learning_report_pdf') return { data: state.ready ? { state: 'READY' } : state.busy ? { state: 'BUSY' } : { state: 'CLAIMED', lease: 'lease', path: `${id}/v2.pdf`, document: { id, version: 2, type: 'MONTHLY', snapshot: { ...snapshot, admin_note: undefined } } } }
    if (name === 'finish_learning_report_pdf') { state.ready = Boolean(args.p_sha256); state.sha = args.p_sha256; return { data: true } }
    if (name === 'note_learning_report_pdf_request') { state.reads++; return { data: null } }
    throw Error(name)
  }, storage: { from: () => ({
    download: async () => state.bytes ? { data: new Blob([state.corrupt ? Buffer.from('%PDF-corrupt') : state.bytes]) } : { data: null, error: { statusCode: '404', message: 'Object not found' } },
    upload: async (_path, bytes, options) => { assert.equal(options.upsert, false); state.uploads++; state.bytes = bytes; return { error: null } },
  }) } }
  return { admin, state }
}
const request = (method = 'GET', suffix = '') => new Request('https://reports.example.test/r/learning/' + token + '/pdf' + suffix, { method })
test('published snapshot renders one immutable PDF, opens without cookies and reloads the same bytes', async () => {
  const { admin, state } = fixture()
  const first = await serveLearningReportPdf(request(), token, admin)
  assert.equal(first.status, 200); assert.equal(first.headers.get('content-type'), 'application/pdf')
  assert.match(first.headers.get('content-disposition'), /^inline/); assert.match(first.headers.get('cache-control'), /no-store/)
  assert.equal(first.headers.get('set-cookie'), null); assert.equal(first.headers.get('location'), null)
  const bytes = Buffer.from(await first.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  const second = await serveLearningReportPdf(request(), token, admin)
  assert.deepEqual(Buffer.from(await second.arrayBuffer()), bytes); assert.equal(state.uploads, 1); assert.equal(state.reads, 2)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), state.sha)
})
test('HEAD does not count a read; attachment download and link revocation work', async () => {
  const { admin, state } = fixture(); await prepareLearningReportPdf(admin, id)
  assert.equal((await serveLearningReportPdf(request('HEAD'), token, admin)).status, 200); assert.equal(state.reads, 0)
  assert.match((await serveLearningReportPdf(request('GET', '?download=1'), token, admin)).headers.get('content-disposition'), /^attachment/)
  state.revoked = true
  assert.equal((await serveLearningReportPdf(request(), token, admin)).status, 404)
  assert.equal(state.reads, 1)
})
test('malformed and unknown links fail closed, busy PDF returns retryable failure, corrupted storage never leaks bytes', async () => {
  const { admin, state } = fixture()
  assert.equal((await serveLearningReportPdf(request(), 'bad', admin)).status, 404); assert.equal(state.lookups, 0)
  assert.equal((await serveLearningReportPdf(request(), 'b'.repeat(64), admin)).status, 404)
  state.busy = true; assert.equal((await serveLearningReportPdf(request(), token, admin)).status, 503)
  state.busy = false; await prepareLearningReportPdf(admin, id); state.corrupt = true
  assert.equal((await serveLearningReportPdf(request(), token, admin)).status, 503); assert.equal(state.reads, 0)
})
test('pre-existing immutable upload recovers after database interruption without another upload', async () => {
  const { admin, state } = fixture(); await prepareLearningReportPdf(admin, id); const bytes = state.bytes
  state.ready = false; await prepareLearningReportPdf(admin, id)
  assert.equal(state.uploads, 1); assert.equal(state.bytes, bytes); assert.equal(state.ready, true)
})
test('template data and configured origin reject malformed or overlong values', () => {
  const params = { customer_name: 'Phụ huynh', student_name: 'Học viên', student_code: 'TEST', program_name: 'Piano', report_type: 'Báo cáo tháng', report_period: '01/09/2026-30/09/2026', report_link_id: token }
  assert.equal(reportParametersValid(params), true)
  assert.equal(reportParametersValid({ ...params, customer_name: 'a'.repeat(31) }), false)
  assert.equal(reportParametersValid({ ...params, unexpected: 'x' }), false)
  assert.equal(reportParametersValid({ ...params, report_link_id: '../anything' }), false)
  for (const origin of ['http://example.test', 'https://example.test/path', 'https://user:pass@example.test', 'https://localhost', 'bad']) assert.equal(reportPublicOrigin(origin), null)
  assert.equal(reportPublicOrigin('https://reports.example.test/'), 'https://reports.example.test')
})
