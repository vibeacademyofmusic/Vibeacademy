const test = require('node:test')
const assert = require('node:assert/strict')
const {execFileSync} = require('node:child_process')
const load = require('./helpers/zalo-module-loader.cjs')()
const reply = load('lib/integrations/zalo/tuition-reply.ts')
test('API failure never replaces a missing or existing individual reply',()=>{
  for(const mode of ['healthy','failing']){
    assert.equal(reply.tuitionNoticeReplyLabel('DELIVERED',null,mode),'Chưa phản hồi')
    assert.equal(reply.tuitionNoticeReplyLabel('SENT','CONTINUE',mode),'Tiếp tục học')
  }
})
test('isolated transaction keeps unmatched clicks pending, audits verification separately, then rolls back',()=>{
  const sql=`begin;
  do $test$
  declare fixture_event_id uuid; outcome text;
  begin
    insert into integration_webhook_events(provider,event_type,payload,payload_digest,status,verification_result)
      values ('ZALO','user_click_response_button',jsonb_build_object('event_name','user_click_response_button','app_id','1355275380325944240','timestamp','1790798000000','oa_id','4520912928458797082','msg_id','fixtureUnknownMessage','message',jsonb_build_object('button_type','response','data','Tiếp tục học','tracking_id','fixtureUnknownTracking','submit_time','1790798000000')),repeat('a',64),'ACCEPTED','VALID') returning integration_webhook_events.id into fixture_event_id;
    outcome:=process_tuition_zalo_webhook(fixture_event_id,'4520912928458797082');
    if outcome<>'unknown_tracking' then raise exception 'wrong outcome %',outcome; end if;
    if not exists(select 1 from integration_webhook_events e where e.id=fixture_event_id and e.processed_at is null and e.processing_error='UNKNOWN_TRACKING' and attempt_count=2) then raise exception 'failure swallowed'; end if;
    update integration_webhook_events set received_at=clock_timestamp()-interval '1 minute' where integration_webhook_events.id=fixture_event_id;
    if replay_pending_tuition_zalo_clicks('4520912928458797082',20)<>0 then raise exception 'unmatched counted as replayed'; end if;
    if exists(select 1 from integration_webhook_events e where e.id=fixture_event_id and e.processed_at is not null) then raise exception 'unmatched marked complete'; end if;
    if has_function_privilege('authenticated','process_tuition_zalo_webhook(uuid,text)','execute') then raise exception 'browser can apply'; end if;
    perform record_zalo_webhook_receipt('{"payloadDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","eventName":"user_send_text","verified":true,"httpStatus":200,"outcome":"VERIFICATION","consoleTest":true}'::jsonb);
    if not exists(select 1 from zalo_webhook_receipts where payload_digest=repeat('b',64) and console_test) then raise exception 'verification audit missing'; end if;
    if exists(select 1 from tuition_zalo_replies where tracking_id='fixtureUnknownTracking') then raise exception 'test wrote tuition reply'; end if;
  end $test$;
  rollback;`;
  const out=execFileSync('docker',['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:sql,encoding:'utf8'});
  assert.ok(!out.includes('ERROR'))
})
