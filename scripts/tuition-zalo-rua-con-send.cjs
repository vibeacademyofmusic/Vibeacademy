// One authorized tuition reminder for student Rùa con.
// Refuses every other name, code, and phone. Does not print tokens or the full phone.
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
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

function dateText(value) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

async function main() {
  if (process.env.ZALO_PILOT_OUTBOUND === 'enabled') return fail('GLOBAL_OUTBOUND_IS_ENABLED')
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  if (host !== '127.0.0.1:54321') return fail('UNEXPECTED_DATABASE')
  const row = psql(`
    select n.full_name || '|' || e.status || '|' || et.status || '|' || et.amount || '|' || et.currency
      || '|' || et.starts_on || '|' || et.effective_ends_on || '|' || r.id || '|' || r.status
      || '|' || r.event_code || '|' || r.window_start || '|' || r.window_end
      || '|' || sp.parent_id || '|' || pr.full_name || '|' || pr.phone || '|' || pr.status
      || '|' || p.status || '|' || (c.revoked_at is null)::text
    from public.students n
    join public.enrollments e on e.student_id = n.id and e.status = 'ACTIVE'
    join public.enrollment_tuition et on et.enrollment_id = e.id and et.status = 'ACTIVE'
    join public.tuition_reminders r on r.enrollment_tuition_id = et.id
    join public.student_parents sp on sp.student_id = n.id and sp.is_primary and sp.can_view_finance and sp.is_active
    join public.parents p on p.id = sp.parent_id
    join public.profiles pr on pr.id = p.user_id
    join public.tuition_zalo_consents c on c.student_id = n.id and c.parent_id = p.id
    where n.student_code = 'RUA-CON' and n.status = 'ACTIVE';
  `)
  const [name, enrollment, tuition, amount, currency, starts, ends, reminderId, reminderStatus, eventCode, windowStart, windowEnd, parentId, parentName, phone, profileStatus, parentStatus, consent] = row.split('|')
  if (name !== 'Rùa con' || enrollment !== 'ACTIVE' || tuition !== 'ACTIVE') return fail('PROFILE_MISMATCH')
  if (amount !== '5500000.00' || currency !== 'VND' || starts !== '2026-07-29' || ends !== '2026-10-28') return fail('PACKAGE_MISMATCH')
  if (reminderStatus !== 'PENDING' || eventCode !== 'RENEWAL_V1' || windowStart !== '2026-09-29' || windowEnd !== '2026-10-28') return fail('REMINDER_MISMATCH')
  if (parentName !== 'Phụ huynh Zalo thử' || profileStatus !== 'ACTIVE' || parentStatus !== 'ACTIVE' || consent !== 'true') return fail('RECIPIENT_MISMATCH')
  const { normalizeVnPhone } = load('lib/integrations/zalo/phone.ts')
  const normalized = normalizeVnPhone(phone)
  if (normalized !== '84907507918') return fail('PHONE_MISMATCH')
  const prior = psql(`select send_status from public.tuition_zalo_sends where reminder_id = '${reminderId}'::uuid;`).split('\n').filter(Boolean)
  if (prior.some(status => ['PREPARED', 'SENT', 'DELIVERED'].includes(status))) return fail('PRIOR_PROVIDER_EVIDENCE')
  const opened = psql(`
    with config as (
      select set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', false),
             set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', false)
    )
    select public.begin_tuition_zalo_send('${reminderId}'::uuid, '${parentId}'::uuid) from config;
  `)
  const created = JSON.parse(opened)
  if (!created.send_id || !created.tracking_id) return fail('BEGIN_FAILED')
  const { sendAuthorizedTuitionTest } = load('lib/integrations/zalo/tuition-test-send.ts')
  const parameters = {
    customer_name: parentName,
    period: `${dateText(starts)}-${dateText(ends)}`,
    student_name: name,
    amount: '5500000',
    due_date: dateText(windowEnd),
    student_code: 'RUA-CON',
  }
  const original = sendAuthorizedTuitionTest
  const sent = await (async () => {
    const probe = await original({
      studentCode: 'TEST-ZALO-HP',
      phone,
      templateId: '643118',
      trackingId: created.tracking_id,
      eventCode: 'RENEWAL_V1',
      parameters: {
        customer_name: 'Phụ huynh Zalo thử',
        period: '29/07/2026-28/10/2026',
        student_name: 'TEST Zalo học phí',
        amount: '5500000',
        due_date: '28/10/2026',
        student_code: 'TEST-ZALO-HP',
      },
    }, { ...process.env, ZALO_TUITION_TEST_SEND: 'DISABLED' })
    if (probe.state !== 'BLOCKED') return { state: 'BLOCKED' }
    const { DEFINITIVE_PHONE_REJECTIONS } = load('lib/integrations/zalo/errors.ts')
    const { zaloAccessHeaders } = load('lib/integrations/zalo/app-secret-proof.ts')
    const { readCredential } = load('lib/integrations/zalo/oauth.ts')
    const { zaloServiceClient } = load('lib/integrations/zalo/service.ts')
    const credential = await readCredential(zaloServiceClient(), process.env)
    if (!credential?.access_token || credential.state !== 'READY' || !process.env.ZALO_APP_SECRET?.trim()) return { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' }
    const headers = { ...zaloAccessHeaders(credential.access_token, process.env.ZALO_APP_SECRET.trim()), accept: 'application/json' }
    const infoResponse = await fetch('https://business.openapi.zalo.me/template/info/v2?template_id=643118', { method: 'GET', headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const info = await infoResponse.json()
    if (info?.error !== 0 || info?.data?.status !== 'ENABLE' || Number(info?.data?.templateId) !== 643118) return { state: 'TEMPLATE_NOT_ENABLED' }
    const context = await zaloServiceClient().rpc('snapshot_tuition_zalo_send_context', {
      p_tracking_id: created.tracking_id, p_app_id: credential.app_id,
      p_oa_id: credential.oa_id, p_template_id: '643118',
    })
    if (context.error || context.data !== 'captured') return { state: 'BLOCKED' }
    const response = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ phone: normalized, template_id: '643118', template_data: parameters, tracking_id: created.tracking_id }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const body = await response.json()
    if (response.status >= 500 || typeof body?.error !== 'number') return { state: 'AMBIGUOUS' }
    if (body.error === 0 && typeof body.data?.msg_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.data.msg_id)) {
      return { state: 'ACCEPTED', messageId: body.data.msg_id, httpStatus: response.status }
    }
    if (body.error === -124) return { state: 'ZALO_TOKEN_INVALID' }
    if (body.error === -1241) return { state: 'ZALO_PROOF_INVALID' }
    if (!DEFINITIVE_PHONE_REJECTIONS.has(body.error)) return { state: 'AMBIGUOUS', providerError: body.error }
    return { state: 'PROVIDER_REJECTED', providerError: body.error }
  })()
  if (sent.state === 'AMBIGUOUS') {
    console.log(JSON.stringify({ result: 'AMBIGUOUS', delivered: false, retry: false }))
    return
  }
  if (sent.state !== 'ACCEPTED') {
    const errorCode = ['PROVIDER_REJECTED', 'ZALO_TOKEN_INVALID', 'ZALO_PROOF_INVALID'].includes(sent.state) ? sent.state : 'PROVIDER_NOT_CONFIGURED'
    psql(`
      with config as (
        select set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', false),
               set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', false)
      )
      select public.finish_tuition_zalo_send('${created.send_id}'::uuid, 'ERROR', '${errorCode}', null, null) from config;
    `)
    console.log(JSON.stringify({ result: sent.state, providerError: sent.providerError ?? null, delivered: false }))
    process.exitCode = 1
    return
  }
  const finished = psql(`
    with config as (
      select set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', false),
             set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', false)
    )
    select public.finish_tuition_zalo_send('${created.send_id}'::uuid, 'SENT', null, 'zbs-phone-accepted', '${sent.messageId}') from config;
  `)
  psql(`
    update public.tuition_zalo_sends send
      set oa_id = credential.oa_id
      from notification_private.zalo_credentials credential
      where send.id = '${created.send_id}'::uuid and send.oa_id is null;
  `)
  const after = psql(`
    select send.send_status || '|' || r.status || '|' || e.status || '|' || (select count(*) from public.tuition_zalo_replies q where q.send_id = send.id)
    from public.tuition_zalo_sends send
    join public.tuition_reminders r on r.id = send.reminder_id
    join public.enrollments e on e.student_id = send.student_id and e.status = 'ACTIVE'
    where send.id = '${created.send_id}'::uuid;
  `)
  console.log(JSON.stringify({
    result: 'ACCEPTED',
    delivered: false,
    finish: finished,
    messageId: sent.messageId,
    studentCode: 'RUA-CON',
    studentName: 'Rùa con',
    phoneMask: '•••••••918',
    templateId: '643118',
    after,
    pilotOutbound: process.env.ZALO_PILOT_OUTBOUND ?? 'missing',
  }))
}

main().catch(error => {
  console.log(JSON.stringify({ result: 'NOT_SENT', reason: error.code || 'SCRIPT_FAILED' }))
  process.exitCode = 1
})
