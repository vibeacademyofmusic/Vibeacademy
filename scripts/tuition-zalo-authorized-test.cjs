// One authorized tuition ZBS send. Refuses every other recipient.
// Does not print tokens, the full phone, or the OA secret.
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), true, { info() {}, error() {} })

const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const loaded = { exports: {} }
  cache.set(file, loaded.exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => id === 'server-only' ? {} : id.startsWith('.') ? load(path.resolve(path.dirname(file), id.endsWith('.ts') ? id : id + '.ts')) : require(id))
  return loaded.exports
}

function psql(sql) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_vibe-academy-system', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' }).trim()
}

function fail(reason) {
  console.log(JSON.stringify({ result: 'NOT_SENT', reason }))
  process.exitCode = 1
}

async function main() {
  if (process.env.ZALO_PILOT_OUTBOUND === 'enabled') return fail('GLOBAL_OUTBOUND_IS_ENABLED')
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  if (host !== '127.0.0.1:54321') return fail('UNEXPECTED_DATABASE')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: student, error: studentError } = await db.from('students').select('id,full_name,student_code').eq('student_code', 'TEST-ZALO-HP').maybeSingle()
  if (studentError || !student) return fail('STUDENT_MISSING')
  const { data: reminder, error: reminderError } = await db.from('tuition_reminders').select('id,status,event_code,window_end,enrollment_tuition_id').eq('id', 'b0c50000-0000-4000-8000-000000000011').maybeSingle()
  if (reminderError || !reminder || reminder.status !== 'PENDING' || reminder.event_code !== 'RENEWAL_V1' || reminder.window_end !== '2026-10-28') return fail('REMINDER_MISMATCH')
  const { data: tuition, error: tuitionError } = await db.from('enrollment_tuition').select('id,amount,currency,starts_on,effective_ends_on').eq('id', reminder.enrollment_tuition_id).maybeSingle()
  if (tuitionError || !tuition || Number(tuition.amount) !== 5500000 || tuition.currency !== 'VND' || tuition.starts_on !== '2026-07-29' || tuition.effective_ends_on !== '2026-10-28') return fail('PACKAGE_MISMATCH')
  const { data: links, error: linkError } = await db.from('student_parents').select('parent_id,can_view_finance,is_primary,is_active').eq('student_id', student.id).eq('is_active', true)
  if (linkError || !links?.length) return fail('RELATIONSHIP_MISSING')
  const primary = links.find(link => link.is_primary && link.can_view_finance)
  if (!primary) return fail('TUITION_VIEW_MISSING')
  if (!/^[0-9a-f-]{36}$/i.test(student.id) || !/^[0-9a-f-]{36}$/i.test(primary.parent_id) || !/^[0-9a-f-]{36}$/i.test(reminder.id)) return fail('ID_MISMATCH')
  const consent = psql(`select case when revoked_at is null then 'active' else 'revoked' end from public.tuition_zalo_consents where student_id = '${student.id}'::uuid and parent_id = '${primary.parent_id}'::uuid;`)
  if (consent !== 'active') return fail('CONSENT_MISSING')
  const { data: parent, error: parentError } = await db.from('parents').select('id,status,user_id').eq('id', primary.parent_id).maybeSingle()
  if (parentError || parent?.status !== 'ACTIVE' || !parent.user_id) return fail('PARENT_INACTIVE')
  const { data: profile, error: profileError } = await db.from('profiles').select('full_name,phone,status').eq('id', parent.user_id).maybeSingle()
  if (profileError || profile?.status !== 'ACTIVE' || profile.full_name !== 'Phụ huynh Zalo thử') return fail('PARENT_NAME_MISMATCH')
  const { normalizeVnPhone } = load('lib/integrations/zalo/phone.ts')
  const phone = normalizeVnPhone(profile.phone ?? '')
  if (!phone || !phone.endsWith('918')) return fail('PHONE_MISMATCH')
  if (student.full_name !== 'TEST Zalo học phí') return fail('STUDENT_NAME_MISMATCH')
  const sendLines = psql(`select send_status || '|' || (provider_message_id is not null)::text from public.tuition_zalo_sends where reminder_id = '${reminder.id}'::uuid order by created_at;`).split('\n').filter(Boolean)
  if (sendLines.some(line => line.endsWith('|true') || line.startsWith('PREPARED|') || line.startsWith('SENT|') || line.startsWith('DELIVERED|'))) return fail('PRIOR_PROVIDER_EVIDENCE')
  const failed = sendLines.filter(line => line.startsWith('FAILED|')).length
  const templateLines = psql(`select template_key || '|' || status || '|' || enabled::text || '|' || coalesce(provider_template_id,'') from public.notification_templates where template_key in ('ZALO_TUITION_REMINDER','ZALO_REGISTRATION_CONFIRMED') order by template_key;`)
  if (!templateLines.includes('ZALO_REGISTRATION_CONFIRMED|APPROVED|true|640377') || !templateLines.includes('ZALO_TUITION_REMINDER|APPROVED|false|643118')) return fail('TEMPLATE_MAPPING')

  const opened = psql(`
    with config as (
      select set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', false) as subject,
             set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', false) as claims
    )
    select public.begin_tuition_zalo_send('${reminder.id}'::uuid, '${primary.parent_id}'::uuid) from config;
  `)
  const created = JSON.parse(opened)
  if (!created.send_id || !created.tracking_id) return fail('BEGIN_FAILED')
  const { sendAuthorizedTuitionTest, TUITION_TEST_PARAMETERS } = load('lib/integrations/zalo/tuition-test-send.ts')
  const armed = { ...process.env, ZALO_TUITION_TEST_SEND: 'TEST-ZALO-HP' }
  const sent = await sendAuthorizedTuitionTest({
    studentCode: student.student_code,
    phone: profile.phone,
    templateId: '643118',
    trackingId: created.tracking_id,
    eventCode: reminder.event_code,
    parameters: { ...TUITION_TEST_PARAMETERS },
  }, armed)
  if (sent.state === 'AMBIGUOUS') {
    console.log(JSON.stringify({ result: 'AMBIGUOUS', delivered: false, retry: false, failedHistoryPreserved: failed }))
    return
  }
  if (sent.state !== 'ACCEPTED') {
    const errorCode = ['PROVIDER_REJECTED', 'ZALO_TOKEN_INVALID', 'ZALO_PROOF_INVALID'].includes(sent.state) ? sent.state : sent.state === 'BLOCKED' ? 'ZALO_PILOT_OUTBOUND_DISABLED' : 'PROVIDER_NOT_CONFIGURED'
    psql(`
      with config as (
        select set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', false),
               set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', false)
      )
      select public.finish_tuition_zalo_send('${created.send_id}'::uuid, 'ERROR', '${errorCode}', null, null) from config;
    `)
    console.log(JSON.stringify({ result: sent.state, providerError: sent.providerError ?? null, delivered: false, failedHistoryPreserved: failed }))
    process.exitCode = 1
    return
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(sent.messageId) || !/^[A-Za-z0-9-]{36}$/.test(created.send_id)) return fail('RESULT_ID_MISMATCH')
  const finishedOutcome = psql(`
    with config as (
      select set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', false) as subject,
             set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', false) as claims
    )
    select public.finish_tuition_zalo_send('${created.send_id}'::uuid, 'SENT', null, 'zbs-phone-accepted', '${sent.messageId}') from config;
  `)
  const finished = finishedOutcome + '|' + psql(`select send_status || '|' || (delivered_at is null)::text || '|' || (provider_message_id = '${sent.messageId}')::text from public.tuition_zalo_sends where id = '${created.send_id}'::uuid;`)
  const oaStamped = psql(`
    with stamped as (
      update public.tuition_zalo_sends send
        set oa_id = credential.oa_id
        from notification_private.zalo_credentials credential
        where send.id = '${created.send_id}'::uuid and send.oa_id is null
        returning (send.oa_id is not null) as ok
    )
    select ok::text from stamped;
  `)
  const continueReply = psql(`
    begin;
    select public.apply_tuition_zalo_response(jsonb_build_object(
      'event_name','user_click_response_button',
      'oa_id', (select oa_id from notification_private.zalo_credentials limit 1),
      'msg_id', '${sent.messageId}',
      'message', jsonb_build_object('button_type','response','data','Tiếp tục học','tracking_id','${created.tracking_id}','submit_time','1759230000000')
    ), (select oa_id from notification_private.zalo_credentials limit 1));
    rollback;
  `)
  const stopReply = psql(`
    begin;
    select public.apply_tuition_zalo_response(jsonb_build_object(
      'event_name','user_click_response_button',
      'oa_id', (select oa_id from notification_private.zalo_credentials limit 1),
      'msg_id', '${sent.messageId}',
      'message', jsonb_build_object('button_type','response','data','Dừng học','tracking_id','${created.tracking_id}','submit_time','1759230001000')
    ), (select oa_id from notification_private.zalo_credentials limit 1));
    rollback;
  `)
  const persistedReplies = psql(`select count(*) from public.tuition_zalo_replies where tracking_id = '${created.tracking_id}';`)
  const priorFailed = psql(`select count(*) from public.tuition_zalo_sends where reminder_id = '${reminder.id}'::uuid and send_status = 'FAILED';`)
  console.log(JSON.stringify({
    result: 'ACCEPTED',
    delivered: false,
    httpStatus: sent.httpStatus,
    providerError: sent.providerError,
    messageId: sent.messageId,
    studentCode: 'TEST-ZALO-HP',
    phoneMask: '•••••••918',
    templateId: '643118',
    finish: finished,
    oaStored: oaStamped === 'true',
    callbackContinue: continueReply.split('\n').find(line => /recorded|duplicate|send_not_accepted|invalid_|oa_mismatch|unknown_tracking|message_mismatch/.test(line)) ?? 'unreadable',
    callbackStop: stopReply.split('\n').find(line => /recorded|duplicate|send_not_accepted|invalid_|oa_mismatch|unknown_tracking|message_mismatch/.test(line)) ?? 'unreadable',
    persistedReplies,
    failedHistory: priorFailed,
    pilotOutbound: process.env.ZALO_PILOT_OUTBOUND ?? 'missing',
  }))
}

main().catch(error => {
  console.log(JSON.stringify({ result: 'NOT_SENT', reason: error.code || 'SCRIPT_FAILED' }))
  process.exitCode = 1
})
