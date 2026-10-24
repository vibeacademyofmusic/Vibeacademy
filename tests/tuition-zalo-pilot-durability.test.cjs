const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')

test('rollback-only: immutable context, early click/delivery, retry beyond eight attempts, duplicates, both choices and role isolation', () => {
  const sql = `begin;
  do $test$
  declare send uuid; click uuid; delivery uuid; payload jsonb; outcome text; early_submit text;
  begin
    insert into tuition_zalo_sends(tracking_id,reminder_id,student_id,parent_id,enrollment_tuition_id,send_status)
      select 'pilotDurabilityFixture',reminder_id,student_id,parent_id,enrollment_tuition_id,'PREPARED'
      from tuition_zalo_sends where tracking_id='ea46b91019ee49ad8687d457fdc082ab' returning id into send;
    if send is null then raise exception 'verified fixture missing'; end if;
    if snapshot_tuition_zalo_send_context('pilotDurabilityFixture','1355275380325944240','4520912928458797082','643118')<>'captured' then raise exception 'snapshot failed'; end if;
    if snapshot_tuition_zalo_send_context('pilotDurabilityFixture','999999999999999999','4520912928458797082','643118')<>'context_mismatch' then raise exception 'snapshot overwritten'; end if;
    payload:=jsonb_build_object('event_name','user_click_response_button','app_id','1355275380325944240','oa_id','4520912928458797082','timestamp','1790800000000','msg_id','pilotFixtureMessage',
      'message',jsonb_build_object('tracking_id','pilotDurabilityFixture','button_type','response','data','Tiếp tục học','submit_time','1790800000000'));
    select event_id into click from record_integration_webhook_event('ZALO','pilotFixtureMessage','user_click_response_button',payload,repeat('1',64),true);
    if process_tuition_zalo_webhook(click,'4520912928458797082')<>'send_not_accepted' then raise exception 'early click was lost'; end if;
    if exists(select 1 from integration_webhook_events where id=click and processed_at is not null) then raise exception 'early click completed'; end if;
    select event_id into delivery from record_integration_webhook_event('ZALO','pilotFixtureMessage','user_received_message',jsonb_build_object('app_id','1355275380325944240','sender',jsonb_build_object('id','4520912928458797082'),
      'message',jsonb_build_object('tracking_id','pilotDurabilityFixture','msg_id','pilotFixtureMessage','delivery_time','1790800000000')),repeat('2',64),true);
    if delivery=click then raise exception 'delivery swallowed click'; end if;
    if process_tuition_zalo_webhook(delivery,'4520912928458797082')<>'IGNORED' then raise exception 'early delivery prematurely applied'; end if;
    update integration_webhook_events set attempt_count=12,received_at=clock_timestamp()-interval '1 minute' where id in (click,delivery);
    update tuition_zalo_sends set send_status='SENT',provider_message_id='pilotFixtureMessage',sent_at=clock_timestamp() where id=send;
    if replay_pending_tuition_zalo_clicks('4520912928458797082',20)<>2 then raise exception 'early callbacks failed recovery after eight attempts'; end if;
    if not exists(select 1 from tuition_zalo_sends where id=send and send_status='DELIVERED') then raise exception 'delivery failed'; end if;
    if process_tuition_zalo_webhook(click,'4520912928458797082')<>'duplicate' then raise exception 'retry duplicated click'; end if;
    if apply_tuition_zalo_response(jsonb_set(payload,'{app_id}','"999999999999999999"'),'4520912928458797082')<>'app_mismatch' then raise exception 'wrong app accepted'; end if;
    if apply_tuition_zalo_response(jsonb_set(payload,'{msg_id}','"otherMessage"'),'4520912928458797082')<>'message_mismatch' then raise exception 'wrong message accepted'; end if;
    payload:=jsonb_set(jsonb_set(payload,'{message,data}','"Dừng học"'),'{message,submit_time}','"1790800001000"');
    if apply_tuition_zalo_response(payload,'4520912928458797082')<>'recorded' then raise exception 'stop failed'; end if;
    if (select count(*) from tuition_zalo_replies where send_id=send)<>2 then raise exception 'history not exactly two'; end if;
    if not exists(select 1 from tuition_zalo_reply_states state join tuition_zalo_sends sent on sent.reminder_id=state.reminder_id where sent.id=send and state.reply_choice='STOP' and state.needs_review) then raise exception 'latest response missing'; end if;
    -- Provider click precedes local send-result persistence but follows request context capture.
    update tuition_zalo_sends set sent_at=context_captured_at+interval '10 seconds' where id=send;
    select (floor(extract(epoch from(context_captured_at+interval '1 second'))*1000))::bigint::text into early_submit from tuition_zalo_sends where id=send;
    outcome:=record_tuition_zalo_api_reply('643118','1355275380325944240','4520912928458797082','4520912928458797082','pilotDurabilityFixture','pilotFixtureMessage','Tiếp tục học',early_submit);
    if outcome not in ('recorded','conflict') then raise exception 'early API recovery rejected: %',outcome; end if;
    if has_function_privilege('authenticated','snapshot_tuition_zalo_send_context(text,text,text,text)','execute') then raise exception 'browser can forge identity'; end if;
    if has_function_privilege('authenticated','process_tuition_zalo_webhook(uuid,text)','execute') then raise exception 'browser can forge response'; end if;
    if (select oa_id from tuition_zalo_sends where tracking_id='ea46b91019ee49ad8687d457fdc082ab') is not null then raise exception 'invented historical snapshot'; end if;
  end $test$;
  set local role authenticated;
  select set_config('request.jwt.claim.sub','a6adf0df-a9f5-43bd-a8f0-39f20ae8e3a6',true);
  do $test$ begin
    if not public.has_role('BRANCH_ADMIN') then raise exception 'expected existing branch fixture'; end if;
    if exists(select 1 from tuition_zalo_sends) or exists(select 1 from tuition_zalo_replies) or exists(select 1 from tuition_reminder_operations) then raise exception 'unprivileged account can read branch data'; end if;
  end $test$;
  rollback;`;
  const output = execFileSync('docker', ['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'], {input:sql,encoding:'utf8'})
  assert.ok(!output.includes('ERROR'))
})
