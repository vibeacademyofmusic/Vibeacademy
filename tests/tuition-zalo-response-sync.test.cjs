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
    if (name === 'server-only') return {}
    if (!name.startsWith('.')) return require(name)
    const target = path.resolve(path.dirname(file), name)
    return load(fs.existsSync(target + '.ts') ? target + '.ts' : target)
  }
  new Function('exports', 'require', 'module', code)(loaded.exports, localRequire, loaded)
  return loaded.exports
}

const sync = load('lib/integrations/zalo/tuition-response-sync.ts')
const { acceptZaloWebhook, zaloEventMac } = load('lib/integrations/zalo/webhook.ts')
const proof = load('lib/integrations/zalo/app-secret-proof.ts')

const env = {
  ZALO_APP_ID: '1355275380325944240',
  ZALO_OA_ID: '4520912928458797082',
  ZALO_APP_SECRET: 'synthetic-app-secret',
}

function gate(overrides = {}) {
  return {
    activated: true,
    checkpoint_ms: 1_000,
    overlap_ms: sync.TUITION_RESPONSE_OVERLAP_MS,
    page_limit: 1,
    interval_seconds: 600,
    auth_backoff_until: null,
    earliest_send_ms: 500,
    ...overrides,
  }
}

test('response window overlaps the checkpoint and does not call before the first send', () => {
  assert.deepEqual(sync.responseWindow(10_000, 1_000, 20_000, 300_000), { from: 1_000, to: 20_000 })
  assert.deepEqual(sync.responseWindow(null, 5_000, 9_000, 300_000), { from: 5_000, to: 9_000 })
  assert.equal(sync.responseWindow(null, null, 9_000, 300_000), null)
  assert.equal(sync.responseAuthBackoffMs(1), 15 * 60 * 1000)
  assert.equal(sync.responseAuthBackoffMs(2), 60 * 60 * 1000)
  assert.equal(sync.responseAuthBackoffMs(3), 6 * 60 * 60 * 1000)
})

test('response url keeps the token out of the query', () => {
  const url = sync.tuitionResponseGetUrl({ templateId: '643118', fromMs: 10, toMs: 20, offset: 0, limit: 20 })
  assert.equal(url.includes('access_token'), false)
  assert.equal(url.includes('appsecret_proof'), false)
  assert.match(url, /template_id=643118/)
  assert.equal(new URL(url).pathname, '/response/get')
})

test('inactive, backoff, and unverified limit do not call Zalo', async () => {
  let calls = 0
  const request = async () => { calls += 1; throw new Error('must not call') }
  const admin = (row) => ({ rpc: async (fn) => fn === 'tuition_zalo_response_sync_gate' ? { data: row, error: null } : { data: null, error: { message: fn } } })
  assert.equal((await sync.reconcileTuitionZaloResponses(admin(gate({ activated: false })), env, request)).state, 'INACTIVE')
  assert.equal((await sync.reconcileTuitionZaloResponses(admin(gate({ auth_backoff_until: '2999-01-01T00:00:00.000Z' })), env, request)).state, 'AUTH_BACKOFF')
  assert.equal((await sync.reconcileTuitionZaloResponses(admin(gate({ interval_seconds: null })), env, request)).state, 'LIMIT_UNVERIFIED')
  assert.equal(calls, 0)
})

test('checkpoint advances only after every page is saved', async () => {
  const commits = []
  const saved = []
  const admin = {
    async rpc(fn, args) {
      if (fn === 'tuition_zalo_response_sync_gate') return { data: gate(), error: null }
      if (fn === 'record_tuition_zalo_api_reply') {
        if (args.p_button === 'Tiếp tục học') saved.push(args.p_submit_ms)
        return { data: args.p_submit_ms === '1000' ? 'recorded' : 'duplicate', error: null }
      }
      if (fn === 'commit_tuition_zalo_response_window') {
        commits.push(args)
        return { data: args.p_complete === true ? 'advanced' : 'held', error: null }
      }
      if (fn === 'note_tuition_zalo_response_probe') return { data: null, error: null }
      return { data: null, error: { message: fn } }
    },
  }
  let offset = -1
  const request = async (url, init) => {
    assert.equal(url.includes('access_token'), false)
    assert.equal(init.headers.appsecret_proof, proof.zaloAppSecretProof('stored-token', env.ZALO_APP_SECRET))
    offset = Number(new URL(url).searchParams.get('offset'))
    const row = offset === 0
      ? { data: 'Tiếp tục học', submitDate: '1000', msgId: 'msgA', oaId: env.ZALO_OA_ID, trackingId: 'trackA' }
      : { data: 'Dừng học', submitDate: '2000', msgId: 'msgA', oaId: env.ZALO_OA_ID, trackingId: 'trackA' }
    return { status: 200, json: async () => ({ error: 0, message: 'Success', data: { total: 2, data: [row] } }) }
  }
  const result = await sync.reconcileTuitionZaloResponses(admin, env, request, { readAccess: async () => 'stored-token', now: () => 50_000 })
  assert.equal(result.state, 'SYNCED')
  assert.equal(result.saved, 2)
  assert.deepEqual(saved, ['1000'])
  assert.equal(commits.length, 1)
  assert.equal(commits[0].p_complete, true)
  assert.equal(commits[0].p_to_ms, 50_000)
})

test('an auth error alerts once and does not advance the checkpoint', async () => {
  const commits = []
  const notes = []
  const admin = {
    async rpc(fn, args) {
      if (fn === 'tuition_zalo_response_sync_gate') return { data: gate(), error: null }
      if (fn === 'note_tuition_zalo_response_probe') { notes.push(args); return { data: null, error: null } }
      if (fn === 'commit_tuition_zalo_response_window') { commits.push(args); return { data: 'advanced', error: null } }
      return { data: null, error: { message: fn } }
    },
  }
  const lines = []
  const original = console.error
  console.error = (line) => lines.push(line)
  try {
    const result = await sync.reconcileTuitionZaloResponses(admin, env, async () => ({
      status: 200,
      json: async () => ({ error: -1241, message: 'Invalid appsecret_proof provided in the API argument' }),
    }), { readAccess: async () => 'stored-token', now: () => 50_000 })
    assert.equal(result.state, 'AUTH_ERROR')
  } finally {
    console.error = original
  }
  assert.equal(commits.length, 0)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].p_error, -1241)
  assert.match(lines.join('\n'), /ZALO_RESPONSE_SYNC_AUTH/)
  assert.equal(lines.join('\n').includes('stored-token'), false)
})

test('a save failure holds the checkpoint', async () => {
  const commits = []
  const admin = {
    async rpc(fn, args) {
      if (fn === 'tuition_zalo_response_sync_gate') return { data: gate(), error: null }
      if (fn === 'record_tuition_zalo_api_reply') return { data: null, error: { message: 'db' } }
      if (fn === 'commit_tuition_zalo_response_window') { commits.push(args); return { data: 'advanced', error: null } }
      return { data: null, error: null }
    },
  }
  const result = await sync.reconcileTuitionZaloResponses(admin, env, async () => ({
    status: 200,
    json: async () => ({ error: 0, data: { total: 1, data: [{ data: 'Tiếp tục học', submitDate: '1000', msgId: 'msgA', oaId: env.ZALO_OA_ID, trackingId: 'trackA' }] } }),
  }), { readAccess: async () => 'stored-token', now: () => 50_000 })
  assert.equal(result.state, 'SAVE_FAILED')
  assert.equal(commits.length, 0)
})

test('webhook acknowledgement waits for a durable record', async () => {
  const body = JSON.stringify({
    event_name: 'user_click_response_button',
    message: { submit_time: '1759215799072', button_type: 'response', data: 'Tiếp tục học', tracking_id: 'trackA0001' },
    msg_id: 'msgA0001',
    app_id: env.ZALO_APP_ID,
    oa_id: env.ZALO_OA_ID,
    timestamp: '1759215799075',
  })
  await assert.rejects(acceptZaloWebhook({
    rawBody: body,
    signature: `mac=${zaloEventMac(env.ZALO_APP_ID, body, '1759215799075', 'fixture-oa-secret')}`,
    env: { appId: env.ZALO_APP_ID, oaId: env.ZALO_OA_ID, oaSecret: 'fixture-oa-secret' },
    record: async () => { throw new Error('RECORD_FAILED') },
  }))
})

test('database shares one reply key across api, import, and webhook and replays a stored click', () => {
  const script = `
begin;
do $proof$
declare
  result text;
  reminder uuid;
  student uuid;
  tuition uuid;
  parent uuid;
  code text;
  actor uuid := '25073c07-90f9-415a-8862-8dbdadd9c8b0';
  payments_before bigint;
  reminder_status text;
  event_id uuid;
  replayed integer;
  reminder_b uuid;
  student_b uuid;
  tuition_b uuid;
  parent_b uuid;
  code_b text;
  student_status text;
  enrollment_status text;
begin
  select count(*) into payments_before from public.payments;
  select r.id, e.student_id, et.id, s.student_code into reminder, student, tuition, code
  from tuition_reminders r
  join enrollment_tuition et on et.id = r.enrollment_tuition_id
  join enrollments e on e.id = et.enrollment_id
  join students s on s.id = e.student_id
  where r.status = 'PENDING'
  order by r.window_start, r.id
  limit 1;
  select sp.parent_id into parent
  from student_parents sp
  join parents p on p.id = sp.parent_id
  where sp.student_id = student and p.status = 'ACTIVE'
  limit 1;
  select status into reminder_status from tuition_reminders where id = reminder;
  insert into tuition_zalo_sends(tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, provider_message_id, oa_id, template_key, send_status, sent_at, delivered_at)
  values ('trackSync01', reminder, student, parent, tuition, 'msgSync01', '4520912928458797082', 'ZALO_TUITION_REMINDER', 'DELIVERED', '2026-09-30 09:20:26+00', '2026-09-30 09:20:26+00');

  result := public.record_tuition_zalo_api_reply('643118', '1355275380325944240', '4520912928458797082', '4520912928458797082', 'trackSync01', 'msgSync01', 'Tiếp tục học', '1790760096000');
  if result <> 'recorded' then raise exception 'api reply failed: %', result; end if;
  if (select source from tuition_zalo_replies where tracking_id = 'trackSync01') <> 'Zalo response API' then raise exception 'source missing'; end if;
  result := public.record_tuition_zalo_api_reply('643118', '1355275380325944240', '4520912928458797082', '4520912928458797082', 'trackSync01', 'msgSync01', 'Tiếp tục học', '1790760096000');
  if result <> 'duplicate' then raise exception 'api duplicate wrote again: %', result; end if;
  if (select count(*) from tuition_zalo_replies where tracking_id = 'trackSync01') <> 1 then raise exception 'duplicate reply'; end if;
  if (select count(*) from tuition_zalo_reply_api_events event where event.tracking_id = 'trackSync01' and event.result = 'duplicate') <> 1 then raise exception 'duplicate audit missing or repeated'; end if;

  result := public.import_tuition_zalo_response_report(
    'fixture.xlsx', repeat('d', 64), 'Sheet 1', 3, '643118', '1355275380325944240', '4520912928458797082', code,
    'trackSync01', 'msgSync01', '16:21:36 30/09/2026', 'phone', 'Tiếp tục học', actor);
  if result <> 'duplicate' then raise exception 'import did not share the api key: %', result; end if;

  result := public.record_tuition_zalo_api_reply('643118', '1355275380325944240', '4520912928458797082', '4520912928458797082', 'trackSync01', 'msgSync01', 'Dừng học', '1790760156000');
  if result <> 'conflict' then raise exception 'different response was collapsed: %', result; end if;
  if (select count(distinct button_data) from tuition_zalo_replies where tracking_id = 'trackSync01') <> 2 then raise exception 'both responses were not kept'; end if;
  if (select needs_review from tuition_zalo_reply_states where reminder_id = reminder) is distinct from true then raise exception 'review flag missing'; end if;

  insert into integration_webhook_events(provider, external_event_id, event_type, status, payload, payload_digest, verification_result, attempt_count, received_at)
  values (
    'ZALO', 'msgSync02', 'user_click_response_button', 'ACCEPTED',
    jsonb_build_object(
      'event_name', 'user_click_response_button', 'app_id', '1355275380325944240', 'timestamp', '1790798000000', 'oa_id', '4520912928458797082', 'msg_id', 'msgSync01',
      'message', jsonb_build_object('submit_time', '1790760216000', 'button_type', 'response', 'data', 'Tiếp tục học', 'tracking_id', 'trackSync01')
    ),
    repeat('e', 64), 'VALID', 1, clock_timestamp() - interval '1 minute'
  ) returning id into event_id;
  replayed := public.replay_pending_tuition_zalo_clicks('4520912928458797082', 20);
  if replayed <> 1 then raise exception 'stored click was not replayed: %', replayed; end if;
  if (select processed_at from integration_webhook_events where id = event_id) is null then raise exception 'replay did not finish'; end if;
  if (select count(*) from tuition_zalo_replies where tracking_id = 'trackSync01' and button_data = 'Tiếp tục học') <> 2 then raise exception 'replay did not keep the later click'; end if;
  replayed := public.replay_pending_tuition_zalo_clicks('4520912928458797082', 20);
  if replayed <> 0 then raise exception 'finished click was replayed again'; end if;

  perform public.note_tuition_zalo_response_probe(200, -1241, 'Invalid appsecret_proof provided in the API argument');
  if (select activated_at from tuition_zalo_response_sync) is not null then raise exception 'auth failure activated the poll'; end if;
  if (select auth_backoff_until from tuition_zalo_response_sync) is null then raise exception 'auth failure has no backoff'; end if;
  if public.commit_tuition_zalo_response_window(1790760216000, true) <> 'inactive' then raise exception 'inactive checkpoint moved'; end if;
  perform public.note_tuition_zalo_response_probe(200, 0, 'Success');
  if (select activated_at from tuition_zalo_response_sync) is null then raise exception 'successful probe did not activate'; end if;
  if (select interval_seconds from tuition_zalo_response_sync) is not null then raise exception 'unverified limit became a cycle'; end if;
  if public.commit_tuition_zalo_response_window(1790760216000, false) <> 'held' then raise exception 'partial window advanced'; end if;
  if (select checkpoint_ms from tuition_zalo_response_sync) is not null then raise exception 'held window wrote a checkpoint'; end if;
  if public.commit_tuition_zalo_response_window(1790760216000, true) <> 'advanced' then raise exception 'complete window did not advance'; end if;

  select r.id, e.student_id, et.id, s.student_code, s.status, e.status
    into reminder_b, student_b, tuition_b, code_b, student_status, enrollment_status
  from tuition_reminders r
  join enrollment_tuition et on et.id = r.enrollment_tuition_id
  join enrollments e on e.id = et.enrollment_id
  join students s on s.id = e.student_id
  where r.status = 'PENDING' and r.id <> reminder
    and not exists (select 1 from tuition_zalo_replies prior where prior.reminder_id = r.id)
  order by r.window_start, r.id
  limit 1;
  if reminder_b is null then raise exception 'need a second pending reminder'; end if;
  select sp.parent_id into parent_b
  from student_parents sp
  join parents p on p.id = sp.parent_id
  where sp.student_id = student_b and p.status = 'ACTIVE'
  limit 1;
  insert into tuition_zalo_sends(tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, provider_message_id, oa_id, template_key, send_status, sent_at, delivered_at)
  values ('trackSync03', reminder_b, student_b, parent_b, tuition_b, 'msgSync03', '4520912928458797082', 'ZALO_TUITION_REMINDER', 'DELIVERED', '2026-09-30 09:20:26+00', '2026-09-30 09:20:26+00');

  result := public.record_tuition_zalo_api_reply('643118', '1355275380325944240', '4520912928458797082', '4520912928458797082', 'trackSync03', 'msgSync03', 'Yêu cầu khác', '1790760276000');
  if result <> 'recorded' then raise exception 'other request failed: %', result; end if;
  if (select reply_choice from tuition_zalo_replies where tracking_id = 'trackSync03') <> 'CONTACT' then raise exception 'other request choice'; end if;
  if (select button_data from tuition_zalo_replies where tracking_id = 'trackSync03') <> 'Yêu cầu khác' then raise exception 'other request label'; end if;
  result := public.record_tuition_zalo_api_reply('643118', '1355275380325944240', '4520912928458797082', '4520912928458797082', 'trackSync03', 'msgSync03', 'Yêu cầu khác', '1790760276000');
  if result <> 'duplicate' then raise exception 'other request duplicate wrote again: %', result; end if;
  result := public.import_tuition_zalo_response_report(
    'fixture.xlsx', repeat('c', 64), 'Sheet 1', 4, '643118', '1355275380325944240', '4520912928458797082', code_b,
    'trackSync03', 'msgSync03', '16:24:36 30/09/2026', 'phone', 'Yêu cầu khác', actor);
  if result <> 'duplicate' then raise exception 'other request import did not share the api key: %', result; end if;
  if (select reply_choice from tuition_zalo_reply_states where reminder_id = reminder_b) <> 'CONTACT' then raise exception 'contact state missing'; end if;
  if (select needs_review from tuition_zalo_reply_states where reminder_id = reminder_b) then raise exception 'contact request was marked as a conflict'; end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
  if public.record_tuition_zalo_contact_note(reminder_b, 'Đã gọi, phụ huynh hỏi lịch khác') <> 'noted' then raise exception 'contact note was not saved'; end if;
  if (select contact_note from tuition_zalo_reply_states where reminder_id = reminder_b) <> 'Đã gọi, phụ huynh hỏi lịch khác' then raise exception 'contact note text missing'; end if;

  insert into integration_webhook_events(provider, external_event_id, event_type, status, payload, payload_digest, verification_result, attempt_count, received_at)
  values (
    'ZALO', 'msgSyncContact', 'user_click_response_button', 'ACCEPTED',
    jsonb_build_object(
      'event_name', 'user_click_response_button', 'app_id', '1355275380325944240', 'timestamp', '1790798000000', 'oa_id', '4520912928458797082', 'msg_id', 'msgSync03',
      'message', jsonb_build_object('submit_time', '1790760336000', 'button_type', 'response', 'data', 'Dừng học', 'tracking_id', 'trackSync03')
    ),
    repeat('f', 64), 'VALID', 1, clock_timestamp() - interval '1 minute'
  );
  replayed := public.replay_pending_tuition_zalo_clicks('4520912928458797082', 20);
  if replayed <> 1 then raise exception 'old stop click was not replayed: %', replayed; end if;
  if (select button_data from tuition_zalo_replies where tracking_id = 'trackSync03' and reply_choice = 'CONTACT') <> 'Yêu cầu khác' then raise exception 'old contact text was rewritten'; end if;
  if (select button_data from tuition_zalo_replies where tracking_id = 'trackSync03' and reply_choice = 'STOP') <> 'Dừng học' then raise exception 'old stop text was rewritten'; end if;
  if (select needs_review from tuition_zalo_reply_states where reminder_id = reminder_b) is distinct from true then raise exception 'conflicting old button was not flagged'; end if;
  if (select contact_note from tuition_zalo_reply_states where reminder_id = reminder_b) <> 'Đã gọi, phụ huynh hỏi lịch khác' then raise exception 'contact note was cleared'; end if;
  if (select status from students where id = student_b) is distinct from student_status then raise exception 'student status changed'; end if;
  if (select status from enrollments where student_id = student_b and id = (select enrollment_id from enrollment_tuition where id = tuition_b)) is distinct from enrollment_status then raise exception 'enrollment status changed'; end if;

  if (select status from tuition_reminders where id = reminder) is distinct from reminder_status then raise exception 'reminder status changed'; end if;
  if (select status from tuition_reminders where id = reminder_b) is distinct from 'PENDING' then raise exception 'contact reminder status changed'; end if;
  if (select count(*) from public.payments) <> payments_before then raise exception 'a reply created a payment'; end if;
end $proof$;
rollback;
`
  const output = execFileSync('docker', [
    'exec', '-i', 'supabase_db_vibe-academy-system',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q',
  ], { input: script, encoding: 'utf8' })
  assert.equal(output.includes('ERROR'), false)
})

test('unmatched API rows retain the checkpoint for a later safe retry', async () => {
  for (const outcome of ['unknown_tracking', 'message_mismatch', 'send_not_accepted', 'app_mismatch', 'template_mismatch']) {
    const commits = []
    const admin = { async rpc(fn, args) {
      if (fn === 'tuition_zalo_response_sync_gate') return { data: gate(), error: null }
      if (fn === 'record_tuition_zalo_api_reply') return { data: outcome, error: null }
      if (fn === 'commit_tuition_zalo_response_window') commits.push(args)
      return { data: null, error: null }
    } }
    const result = await sync.reconcileTuitionZaloResponses(admin, env, async () => ({ status: 200,
      json: async () => ({ error: 0, data: { total: 1, data: [{ data: 'Tiếp tục học', submitDate: '1000', msgId: 'msgA', oaId: env.ZALO_OA_ID, trackingId: 'trackA' }] } }),
    }), { readAccess: async () => 'stored-token', now: () => 50_000 })
    assert.equal(result.state, 'SAVE_FAILED', outcome)
    assert.equal(result.saved, 0, outcome)
    assert.equal(commits.length, 0, outcome)
  }
})
