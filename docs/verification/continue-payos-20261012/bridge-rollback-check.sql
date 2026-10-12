begin;
do $$ declare t public.tuition_zalo_sends; a text; b text; begin
 select * into t from tuition_zalo_sends where tracking_id='6cdab25dcd9c416a914f5887ce394eac';
 if t.id is null or t.provider_message_id<>'d34f500a59f42bad72e2' or t.reminder_id<>'4b01d999-439c-434b-96f7-3f7e4110c600'::uuid then raise exception 'REAL_RECEIPT_NOT_BRIDGED'; end if;
 a:=record_tuition_zalo_reply('Zalo response API',t.tracking_id,'wrongmessage','Tiếp tục học','1791802800000',t.oa_id);
 if a<>'message_mismatch' then raise exception 'MESSAGE_CHECK_FAILED'; end if;
 a:=record_tuition_zalo_reply('Zalo response API',t.tracking_id,t.provider_message_id,'Tiếp tục học','1791802800000',t.oa_id);
 b:=record_tuition_zalo_reply('Zalo response API',t.tracking_id,t.provider_message_id,'Tiếp tục học','1791802800000',t.oa_id);
 if a<>'recorded' or b<>'duplicate' then raise exception 'REPLY_OR_DUPLICATE_CHECK_FAILED: %, %',a,b; end if;
end $$;
rollback;
select 'Verified real-send bridge, strict message match and duplicate reply protection; synthetic click rolled back' as result;
