const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

function load(file, localRequire) {
  const transpiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('module', 'exports', 'require', transpiled)(loaded, loaded.exports, localRequire)
  return loaded.exports
}

const proof = load('lib/integrations/zalo/app-secret-proof.ts', require)
const readiness = load('lib/integrations/zalo/readiness.ts', (id) => id === './app-secret-proof' ? proof : require(id))
const errors = load('lib/integrations/zalo/errors.ts', require)
const phone = load('lib/integrations/zalo/phone.ts', (id) => id === './errors' ? errors : id === './readiness' ? readiness : id === './app-secret-proof' ? proof : require(id))
const { sendZaloPhoneTemplate, ZALO_PHONE_TEMPLATE_URL } = phone

const sql = `
begin;

insert into auth.users(id) values ('aa920000-0000-4000-8000-000000000002');
insert into profiles(id,full_name,status) values ('aa920000-0000-4000-8000-000000000002','Synthetic Recovery Admin','ACTIVE');
insert into user_roles(user_id,role_id) select 'aa920000-0000-4000-8000-000000000002',id from roles where code='SUPER_ADMIN';
insert into tuition_plans(id,code,name,duration_months) values ('aa920000-0000-4000-8000-000000000021','RECOVERY-TEST','Recovery Synthetic',3);
insert into tuition_plan_branch_prices(id,tuition_plan_id,list_price) values ('aa920000-0000-4000-8000-000000000022','aa920000-0000-4000-8000-000000000021',5500000);
update notification_templates set enabled=true,status='APPROVED' where template_key='ZALO_REGISTRATION_CONFIRMED';
select set_config('registration.write', 'on', true);
select set_config('request.jwt.claim.role', 'service_role', true);
insert into branches(id, code, name) values ('aa920000-0000-4000-8000-000000000011', 'PH-PAY', 'Phone pay branch');
insert into registration_applications(
  id, application_code, branch_id, student_name, student_date_of_birth, parent_name, parent_phone,
  status, created_by
) values (
  'aa920000-0000-4000-8000-000000000051', 'DK-PHONE-PAY', 'aa920000-0000-4000-8000-000000000011',
  'Phone Path Synthetic 880925', date '2014-08-08', 'Phu huynh phone path', '0900000000',
  'PAYMENT_PENDING', 'aa920000-0000-4000-8000-000000000002'
);
insert into registration_deposit_terms(
  application_id, branch_id, tuition_plan_id, price_id, tuition_amount, list_amount, discount_amount,
  payment_option, amount_due, quoted_by
)
select 'aa920000-0000-4000-8000-000000000051', 'aa920000-0000-4000-8000-000000000011', 'aa920000-0000-4000-8000-000000000021'::uuid, 'aa920000-0000-4000-8000-000000000022'::uuid,
  4000000, 4000000, 0, 'DEPOSIT_50', 2000000, 'aa920000-0000-4000-8000-000000000002'::uuid;
insert into registration_zalo_phone_consents(application_id, normalized_phone, notice_version, source)
values ('aa920000-0000-4000-8000-000000000051', '84987654321', 'zbs-phone-v1', 'REGISTRATION_FORM');
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000071', 'aa920000-0000-4000-8000-000000000051', 880925001, 1000000, 'coc duoi nguong', 'PENDING', 'link-880925001', 'https://pay.example.test/880925001');
select public.record_verified_payos_webhook(880925001, 'link-880925001', 'ref-partial', 1000000, 'VND') as below;
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000072', 'aa920000-0000-4000-8000-000000000051', 880925002, 1000000, 'coc du nguong', 'PENDING', 'link-880925002', 'https://pay.example.test/880925002');
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'ref-final', 1000000, 'VND') as reached;
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'ref-final', 1000000, 'VND') as replay;
select json_build_object(
  'students', (select count(*) from students where full_name = 'Phone Path Synthetic 880925'),
  'placements', (select count(*) from student_placement_cases where registration_application_id = 'aa920000-0000-4000-8000-000000000051' and status = 'UNASSIGNED'),
  'phone_jobs', (select count(*) from notification_jobs where entity_id = 'aa920000-0000-4000-8000-000000000051' and payload->'delivery'->>'channel' = 'PHONE'),
  'receipts', (select count(*) from payments where reference in ('PAYOS:ref-partial', 'PAYOS:ref-final')),
  'payment_status', (select payload->'parameters'->>'payment_status' from notification_jobs where entity_id = 'aa920000-0000-4000-8000-000000000051' and payload->'delivery'->>'channel' = 'PHONE')
) as summary;
rollback;
`

test('verified deposit threshold creates one phone confirmation and one mocked send', () => {
  const output = execFileSync('docker', ['exec', '-i', 'supabase_db_vibe-academy-system', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], {
    input: sql,
    encoding: 'utf8',
  })
  const lines = output.trim().split('\n')
  const below = lines.find(line => line === 'PARTIAL_DEPOSIT')
  const reached = lines.find(line => line === 'COMPLETED')
  const replay = lines.filter(line => line === 'ALREADY_PAID')
  const summary = JSON.parse(lines.find(line => line.startsWith('{')))
  assert.equal(below, 'PARTIAL_DEPOSIT')
  assert.equal(reached, 'COMPLETED')
  assert.equal(replay.length, 1)
  assert.equal(Number(summary.students), 1)
  assert.equal(Number(summary.placements), 1)
  assert.equal(Number(summary.phone_jobs), 1)
  assert.equal(Number(summary.receipts), 2)
  assert.equal(summary.payment_status, 'Đã nhận cọc 50%')
  let calls = 0
  const sent = sendZaloPhoneTemplate({
    jobId: 'aa920000-0000-4000-8000-000000000081',
    phone: '84987654321',
    templateId: '640377',
    parameters: {
      customer_name: 'Phu huynh phone path',
      registration_code: 'DK-PHONE-PAY',
      student_name: 'Phone Path Synthetic 880925',
      program_name: 'Guitar Preview',
      branch_name: 'Phone pay branch',
      order_code: 'DK-PHONE-PAY',
      payment_status: summary.payment_status,
    },
    trackingId: 'aa920000000040008000000000000081',
    registrationCompleted: true,
    allowlisted: true,
  }, { ZALO_OA_ACCESS_TOKEN: 'mock-token', ZALO_APP_SECRET: 'mock-app-secret' }, async (url, init) => {
    calls += 1
    assert.equal(url, ZALO_PHONE_TEMPLATE_URL)
    assert.equal(init.headers.access_token, 'mock-token')
    assert.equal(init.headers.appsecret_proof, require('node:crypto').createHmac('sha256', 'mock-app-secret').update('mock-token').digest('hex'))
    assert.equal(JSON.parse(init.body).phone, '84987654321')
    return { json: async () => ({ error: 0, data: { msg_id: 'mock-phone-msg' } }) }
  })
  return sent.then(result => {
    assert.equal(result.state, 'ACCEPTED')
    assert.equal(result.delivered, false)
    assert.equal(calls, 1)
  })
})
