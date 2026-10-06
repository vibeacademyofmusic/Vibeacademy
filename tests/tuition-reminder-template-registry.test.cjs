const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = { exports: {} }
  const localRequire = (name) => {
    if (!name.startsWith('.')) return require(name)
    const target = path.resolve(path.dirname(file), name)
    return load(fs.existsSync(target + '.ts') ? target + '.ts' : target)
  }
  new Function('exports', 'require', 'module', code)(loaded.exports, localRequire, loaded)
  return loaded.exports
}

const notice = load('lib/integrations/zalo/tuition-notice.ts')
const current = {
  status: 'APPROVED',
  enabled: false,
  provider_template_id: '645192',
  parameter_schema: ['student_name', 'student_code', 'days_left', 'period', 'amount', 'due_date'],
}
const input = {
  customerName: 'Phụ huynh thử',
  periodStart: '2026-08-01',
  periodEnd: '2026-10-31',
  windowEnd: '2026-10-31',
  studentName: 'Học viên thử',
  studentCode: 'VIBE-DEMO',
  today: '2026-10-01',
  packageAmount: 5500000,
  currency: 'VND',
}

test('reminder template id comes from the registry and keeps the current approved id', () => {
  assert.equal(notice.tuitionReminderTemplateId(current), '645192')
  assert.equal(notice.tuitionReminderTemplateId({ ...current, provider_template_id: '640377' }), null)
  assert.equal(notice.tuitionReminderTemplateId({ ...current, status: 'PENDING', provider_template_id: '645028' }), null)
  assert.equal(notice.tuitionReminderTemplateId({ ...current, provider_template_id: null }), null)
})

test('dry-run preview uses verified reminder fields and does not invent an unverified schema', () => {
  const preview = notice.previewConfiguredTuitionReminder(current, input)
  assert.equal(preview.ok, true)
  assert.equal(preview.templateId, '645192')
  assert.equal(preview.parameters.amount, '5500000')
  assert.equal(preview.parameters.due_date, '31102026')
  assert.equal(preview.parameters.student_code, 'VIBE-DEMO')
  const unknown = notice.previewConfiguredTuitionReminder({
    ...current,
    provider_template_id: '645028',
    parameter_schema: ['amount', 'payment_link_id'],
  }, input)
  assert.equal(unknown.ok, false)
  assert.equal(unknown.code, 'SCHEMA_UNVERIFIED')
  assert.deepEqual(unknown.unverified, ['payment_link_id'])
  assert.equal(unknown.parameters, null)
})

test('a second prepared send is still rejected and registration mapping is untouched', () => {
  assert.match(notice.tuitionSendBeginMessage('Tuition Zalo already prepared'), /Không gửi trùng/)
  const migration = fs.readFileSync('supabase/migrations/20261006190000_tuition_reminder_template_registry.sql', 'utf8')
  assert.match(migration, /ZALO_TUITION_REMINDER/)
  assert.equal(migration.includes('645028'), false)
  assert.equal(migration.includes("provider_template_id = '640377'"), false)
  assert.match(migration, /coalesce\(send\.provider_template_id, template_id\)/)
  const registration = fs.readFileSync('supabase/migrations/20260930160000_zalo_tuition_template_643118.sql', 'utf8')
  assert.match(registration, /Tuition Zalo already prepared/)
})
