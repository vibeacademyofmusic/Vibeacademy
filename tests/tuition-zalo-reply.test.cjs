const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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

const reply = load('lib/integrations/zalo/tuition-reply.ts')
const { acceptZaloWebhook, zaloEventMac } = load('lib/integrations/zalo/webhook.ts')

test('response buttons map only the two approved labels', () => {
  assert.equal(reply.tuitionReplyChoice('Tiếp tục học'), 'CONTINUE')
  assert.equal(reply.tuitionReplyChoice('Dừng học'), 'STOP')
  assert.equal(reply.tuitionReplyChoice('Có'), null)
  assert.equal(reply.tuitionReplyChoice('Không'), null)
  assert.equal(reply.tuitionReplyLabel(null), 'Chưa phản hồi')
  assert.equal(reply.tuitionReplyLabel('CONTINUE'), 'Có')
  assert.equal(reply.tuitionReplyLabel('STOP'), 'Không')
  assert.equal(reply.tuitionReplyLabel('DELIVERED'), 'Chưa phản hồi')
  assert.equal(reply.tuitionSendLabel('DELIVERED'), 'Đã phát đến máy')
  assert.equal(reply.tuitionSendLabel('FAILED'), 'Gửi lỗi')
  for (const label of reply.tuitionReplyButtons()) assert.equal(reply.tuitionReplyButtonFits(label), true)
  assert.equal(reply.tuitionReplyEventKey('trackA', '1759215791000', 'Tiếp tục học', 'msgA'), 'trackA:1759215791000:Tiếp tục học:msgA')
})

test('current reply stays unanswered until a click and ignores another batch', () => {
  const shared = { submitTime: '2026-09-29T10:00:00.000Z', receivedAt: '2026-09-29T10:00:01.000Z' }
  const none = reply.currentTuitionReply([], 'batch-a')
  assert.equal(none.label, 'Chưa phản hồi')
  assert.equal(none.needsReview, false)
  const events = [
    { id: '1', seq: 1, reminderId: 'batch-a', studentId: 'student-a', choice: 'CONTINUE', ...shared },
    { id: '2', seq: 2, reminderId: 'batch-b', studentId: 'student-b', choice: 'STOP', submitTime: '2026-09-29T12:00:00.000Z', receivedAt: '2026-09-29T12:00:01.000Z' },
  ]
  assert.equal(reply.currentTuitionReply(events, 'batch-a').label, 'Có')
  assert.equal(reply.currentTuitionReply(events, 'batch-b').label, 'Không')
  assert.equal(reply.currentTuitionReply(events, 'batch-a').studentId, 'student-a')
})

test('conflicting replies keep the latest event and flag review; equal times use sequence', () => {
  const events = [
    { id: '1', seq: 1, reminderId: 'batch-a', studentId: 'student-a', choice: 'CONTINUE', submitTime: '2026-09-29T10:00:00.000Z', receivedAt: '2026-09-29T10:00:01.000Z' },
    { id: '2', seq: 2, reminderId: 'batch-a', studentId: 'student-a', choice: 'STOP', submitTime: '2026-09-29T09:00:00.000Z', receivedAt: '2026-09-29T11:00:00.000Z' },
    { id: '3', seq: 3, reminderId: 'batch-a', studentId: 'student-a', choice: 'STOP', submitTime: '2026-09-29T10:00:00.000Z', receivedAt: '2026-09-29T10:00:01.000Z' },
    { id: '4', seq: 4, reminderId: 'batch-a', studentId: 'student-a', choice: 'CONTINUE', submitTime: '2026-09-29T10:00:00.000Z', receivedAt: '2026-09-29T10:00:01.000Z' },
  ]
  const current = reply.currentTuitionReply(events, 'batch-a')
  assert.equal(current.label, 'Có')
  assert.equal(current.needsReview, true)
  assert.equal(current.choice, 'CONTINUE')
})

test('signed response webhook is accepted and a bad signature is not stored', async () => {
  const appId = '1355275380325944240'
  const oaId = '4520912928458797082'
  const secret = 'fixture-oa-secret-not-real'
  const body = {
    event_name: 'user_click_response_button',
    message: { submit_time: '1759215799072', button_type: 'response', data: 'Tiếp tục học', tracking_id: 'trackA0001' },
    msg_id: 'msgA0001',
    app_id: appId,
    oa_id: oaId,
    timestamp: '1759215799075',
  }
  const raw = JSON.stringify(body)
  const rows = []
  const record = async (event) => {
    rows.push(event)
    return { id: 'event-1', status: event.supported ? 'ACCEPTED' : 'UNSUPPORTED', duplicate: false }
  }
  const ok = await acceptZaloWebhook({
    rawBody: raw,
    signature: `mac=${zaloEventMac(appId, raw, body.timestamp, secret)}`,
    env: { appId, oaId, oaSecret: secret },
    record,
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.status, 'ACCEPTED')
  assert.equal(rows[0].eventType, 'user_click_response_button')
  assert.equal(rows[0].externalEventId, 'msgA0001')
  const rejected = await acceptZaloWebhook({
    rawBody: raw,
    signature: `mac=${'ab'.repeat(32)}`,
    env: { appId, oaId, oaSecret: secret },
    record,
  })
  assert.equal(rejected.status, 401)
  assert.equal(rows.length, 1)
})

test('reminder tab reads reply state and the webhook applies only the response event', () => {
  const page = fs.readFileSync('app/admin/tuition/reminders/page.tsx', 'utf8')
  const data = fs.readFileSync('app/admin/tuition/reminders/data.ts', 'utf8')
  const route = fs.readFileSync('app/api/integrations/zalo/webhook/route.ts', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20260929201000_tuition_zalo_response_v1.sql', 'utf8')
  assert.match(page, /Phản hồi/)
  assert.match(page, /tuitionReplyLabel/)
  assert.match(page, /Cần xác minh/)
  assert.match(data, /reply === 'pending'/)
  assert.match(data, /reply_choice', 'CONTINUE'/)
  assert.match(data, /reply_choice', 'STOP'/)
  assert.match(route, /event\.eventType === 'user_click_response_button'/)
  assert.match(route, /apply_tuition_zalo_response/)
  assert.match(route, /note_tuition_zalo_delivery/)
  assert.match(migration, /user_click_response_button/)
  assert.match(migration, /Tiếp tục học/)
  assert.match(migration, /Dừng học/)
  assert.equal(/update\s+(public\.)?tuition_reminders/i.test(migration), false)
  const apply = migration.slice(migration.indexOf('create function public.apply_tuition_zalo_response'), migration.indexOf('revoke all on function public.begin_tuition_zalo_send'))
  assert.equal(/phone/i.test(apply), false)
  assert.equal(/update\s+(public\.)?(enrollments|class_enrollments|student_curriculum_enrollments)/i.test(apply), false)
})

test('database records both choices, rejects bad webhooks, and keeps batches apart', () => {
  const script = `
begin;
create temp table fx(key text primary key, reminder_id uuid, student_id uuid, tuition_id uuid, parent_id uuid, reminder_status text, enrollment_status text);
insert into fx
select 'a', r.id, e.student_id, et.id,
  coalesce((select sp.parent_id from student_parents sp join parents p on p.id = sp.parent_id where sp.student_id = e.student_id and p.status = 'ACTIVE' limit 1), (select id from parents limit 1)),
  r.status, e.status
from tuition_reminders r
join enrollment_tuition et on et.id = r.enrollment_tuition_id
join enrollments e on e.id = et.enrollment_id
order by r.window_start, r.id
limit 1;
insert into fx
select 'b', r.id, e.student_id, et.id,
  coalesce((select sp.parent_id from student_parents sp join parents p on p.id = sp.parent_id where sp.student_id = e.student_id and p.status = 'ACTIVE' limit 1), (select id from parents limit 1)),
  r.status, e.status
from tuition_reminders r
join enrollment_tuition et on et.id = r.enrollment_tuition_id
join enrollments e on e.id = et.enrollment_id
where e.student_id <> (select student_id from fx where key = 'a')
order by r.window_start desc, r.id
limit 1;

create function pg_temp.reply(tracking text, button text, submit text, msg text, oa text default '1111111111111111111')
returns text language plpgsql as $fn$
begin
  return public.apply_tuition_zalo_response(jsonb_build_object(
    'event_name', 'user_click_response_button',
    'oa_id', oa,
    'msg_id', msg,
    'phone', '0907507918',
    'message', jsonb_build_object('submit_time', submit, 'button_type', 'response', 'data', button, 'tracking_id', tracking)
  ), '1111111111111111111');
end $fn$;

do $proof$
declare
  result text;
  choice text;
  review boolean;
  history integer;
  before_a text;
  before_b text;
  opened jsonb;
  second jsonb;
  eligible uuid;
  parent uuid;
  send_id uuid;
  reply_before text;
begin
  if (select count(*) from fx) <> 2 then raise exception 'need two students'; end if;
  if exists (select 1 from tuition_zalo_reply_states where reminder_id in (select reminder_id from fx)) then
    raise exception 'fixture reminder already has a reply';
  end if;
  select status into before_a from tuition_reminders where id = (select reminder_id from fx where key = 'a');
  select status into before_b from tuition_reminders where id = (select reminder_id from fx where key = 'b');

  insert into tuition_zalo_sends(tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, provider_message_id, send_status, sent_at)
  select 'trackA0001', reminder_id, student_id, parent_id, tuition_id, 'msgA0001', 'SENT', clock_timestamp() from fx where key = 'a';
  insert into tuition_zalo_sends(tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, provider_message_id, send_status, sent_at)
  select 'trackA0002', reminder_id, student_id, parent_id, tuition_id, 'msgA0002', 'SENT', clock_timestamp() from fx where key = 'a';
  insert into tuition_zalo_sends(tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, provider_message_id, send_status, sent_at)
  select 'trackB0001', reminder_id, student_id, parent_id, tuition_id, 'msgB0001', 'SENT', clock_timestamp() from fx where key = 'b';
  insert into tuition_zalo_sends(tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, send_status, error_code)
  select 'trackFAIL1', reminder_id, student_id, parent_id, tuition_id, 'FAILED', 'PROVIDER_NOT_CONFIGURED' from fx where key = 'a';

  if pg_temp.reply('trackA0001', 'Tiếp tục học', '1759215791000', 'msgA0001') <> 'recorded' then raise exception 'continue failed'; end if;
  select reply_choice, needs_review into choice, review from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'a');
  if choice <> 'CONTINUE' or review then raise exception 'expected Co without review'; end if;
  if exists (select 1 from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'b')) then raise exception 'other student changed'; end if;

  if pg_temp.reply('trackA0001', 'Tiếp tục học', '1759215791000', 'msgA0001') <> 'duplicate' then raise exception 'duplicate not ignored'; end if;
  if (select count(*) from tuition_zalo_replies where tracking_id = 'trackA0001') <> 1 then raise exception 'duplicate wrote history'; end if;
  if pg_temp.reply('missingtrack', 'Tiếp tục học', '1759215791000', 'msgA0001') <> 'unknown_tracking' then raise exception 'unknown tracking wrote a row'; end if;
  if pg_temp.reply('trackFAIL1', 'Tiếp tục học', '1759215791000', 'msgFAIL1') <> 'send_not_accepted' then raise exception 'failed send became a reply'; end if;
  if pg_temp.reply('trackA0001', 'Có', '1759215791500', 'msgA0001') <> 'invalid_button' then raise exception 'unapproved label accepted'; end if;
  if pg_temp.reply('trackA0001', 'Tiếp tục học', '1759215791600', 'msgOTHER') <> 'message_mismatch' then raise exception 'wrong message accepted'; end if;
  result := public.apply_tuition_zalo_response(jsonb_build_object(
    'event_name', 'user_click_response_button', 'oa_id', '2222222222222222222', 'msg_id', 'msgA0001',
    'message', jsonb_build_object('submit_time', '1759215791700', 'button_type', 'response', 'data', 'Dừng học', 'tracking_id', 'trackA0001')
  ), '1111111111111111111');
  if result <> 'oa_mismatch' then raise exception 'bad oa accepted: %', result; end if;
  result := public.apply_tuition_zalo_response(jsonb_build_object('event_name', 'user_received_message', 'oa_id', '1111111111111111111'), '1111111111111111111');
  if result <> 'ignored' then raise exception 'delivery event became a reply: %', result; end if;

  if pg_temp.reply('trackA0001', 'Dừng học', '1759215793000', 'msgA0001') <> 'recorded' then raise exception 'stop failed'; end if;
  select reply_choice, needs_review into choice, review from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'a');
  if choice <> 'STOP' or not review then raise exception 'latest stop was not current'; end if;
  if pg_temp.reply('trackA0001', 'Tiếp tục học', '1759215790500', 'msgA0001') <> 'recorded' then raise exception 'late event rejected'; end if;
  select reply_choice, needs_review into choice, review from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'a');
  if choice <> 'STOP' or not review then raise exception 'late old click overwrote current'; end if;
  select count(*) into history from tuition_zalo_replies where reminder_id = (select reminder_id from fx where key = 'a');
  if history <> 3 then raise exception 'history was not kept: %', history; end if;

  if pg_temp.reply('trackA0002', 'Tiếp tục học', '1759215793000', 'msgA0002') <> 'recorded' then raise exception 'resend reply failed'; end if;
  update tuition_zalo_replies set received_at = '2026-09-29 03:00:00+00'
  where tracking_id in ('trackA0001', 'trackA0002') and submit_time = to_timestamp(1759215793000 / 1000.0);
  if pg_temp.reply('trackA0001', 'Dừng học', '1759215790100', 'msgA0001') <> 'recorded' then raise exception 'tie recompute failed'; end if;
  select reply_choice into choice from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'a');
  if choice <> 'CONTINUE' then raise exception 'equal time did not use later sequence'; end if;

  if pg_temp.reply('trackB0001', 'Dừng học', '1759215799000', 'msgB0001') <> 'recorded' then raise exception 'second student failed'; end if;
  select reply_choice into choice from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'a');
  if choice <> 'CONTINUE' then raise exception 'second student overwrote the first batch'; end if;
  select reply_choice, needs_review into choice, review from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'b');
  if choice <> 'STOP' or review then raise exception 'second student reply was mixed'; end if;
  if (select count(distinct student_id) from tuition_zalo_replies where tracking_id in ('trackA0001', 'trackB0001')) <> 2 then
    raise exception 'shared phone collapsed two students';
  end if;

  reply_before := choice;
  if public.note_tuition_zalo_delivery('trackA0001', 'msgA0001', '1759215800000') <> 'DELIVERED' then raise exception 'delivery not recorded'; end if;
  if public.note_tuition_zalo_delivery('trackA0001', 'msgA0001', '1759215800000') <> 'IDEMPOTENT' then raise exception 'delivery not idempotent'; end if;
  if public.note_tuition_zalo_delivery('trackFAIL1', 'msgFAIL1', '1759215800000') <> 'IGNORED' then raise exception 'failed send was delivered'; end if;
  select reply_choice into choice from tuition_zalo_reply_states where reminder_id = (select reminder_id from fx where key = 'a');
  if choice <> 'CONTINUE' then raise exception 'delivery changed the reply'; end if;
  if (select status from tuition_reminders where id = (select reminder_id from fx where key = 'a')) is distinct from before_a then raise exception 'reminder status changed'; end if;
  if (select status from tuition_reminders where id = (select reminder_id from fx where key = 'b')) is distinct from before_b then raise exception 'other reminder status changed'; end if;
  if (select status from enrollments e join fx on fx.student_id = e.student_id and fx.key = 'a' and fx.enrollment_status = e.status limit 1) is null then
    raise exception 'enrollment status changed';
  end if;

  select r.id, sp.parent_id into eligible, parent
  from tuition_reminders r
  join enrollment_tuition et on et.id = r.enrollment_tuition_id
  join enrollments e on e.id = et.enrollment_id
  join student_parents sp on sp.student_id = e.student_id and sp.can_view_finance and sp.is_active
  join parents p on p.id = sp.parent_id and p.status = 'ACTIVE'
  join tuition_zalo_consents c on c.student_id = e.student_id and c.parent_id = p.id and c.revoked_at is null
  where r.status = 'PENDING' and r.window_start <= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
  order by r.window_start, r.id
  limit 1;
  if eligible is null then raise exception 'no eligible reminder for a local send'; end if;
  perform set_config('request.jwt.claim.sub', '25073c07-90f9-415a-8862-8dbdadd9c8b0', true);
  perform set_config('request.jwt.claims', '{"sub":"25073c07-90f9-415a-8862-8dbdadd9c8b0","role":"authenticated"}', true);
  opened := public.begin_tuition_zalo_send(eligible, parent);
  second := public.begin_tuition_zalo_send(eligible, parent);
  if opened->>'tracking_id' is null or opened->>'tracking_id' = second->>'tracking_id' then raise exception 'resend did not create a new tracking id'; end if;
  if length(opened->>'tracking_id') > 48 or opened->>'tracking_id' !~ '^[A-Za-z0-9]+$' then raise exception 'tracking id is not Zalo safe'; end if;
  send_id := (opened->>'send_id')::uuid;
  if public.finish_tuition_zalo_send(send_id, 'ERROR', 'PROVIDER_NOT_CONFIGURED', null, null) <> 'ERROR' then raise exception 'failed finish'; end if;
  if (select send_status from tuition_zalo_sends where id = send_id) <> 'FAILED' then raise exception 'send was not failed'; end if;
  if exists (select 1 from tuition_zalo_replies where tracking_id = opened->>'tracking_id') then raise exception 'failed send stored a reply'; end if;
  if (select status from tuition_reminders where id = eligible) <> 'PENDING' then raise exception 'failed send marked the reminder sent'; end if;
  if not has_function_privilege('service_role', 'public.apply_tuition_zalo_response(jsonb,text)', 'execute') then raise exception 'webhook role cannot apply'; end if;
  if has_function_privilege('authenticated', 'public.apply_tuition_zalo_response(jsonb,text)', 'execute') then raise exception 'browser can forge a reply'; end if;
end $proof$;
rollback;
`
  const output = execFileSync('docker', [
    'exec', '-i', 'supabase_db_vibe-academy-system',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q',
  ], { input: script, encoding: 'utf8' })
  assert.equal(output.includes('ERROR'), false)
})
