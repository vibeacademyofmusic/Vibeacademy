begin;
select set_config('request.jwt.claim.sub','0bf6bd80-12ac-4454-8e5a-4d10c0c4a905',true);
do $$ declare n bigint; r jsonb; begin
 select count(*) into n from invoices;
 r:=begin_tuition_renewal('4b01d999-439c-434b-96f7-3f7e4110c600','VIBE_3_MONTHS','DEPOSIT_50','2026-10-29','2026-10-28','duplicate verification',5500000);
 if (select count(*) from invoices)<>n or (select count(*) from tuition_renewal_cases where reminder_id='4b01d999-439c-434b-96f7-3f7e4110c600')<>1 then raise exception 'DUPLICATE_INVOICE';end if;
 if (select paid_amount from tuition_renewal_cases where id='0bf215f3-db19-46c8-a25b-7157fe2b907a')<>0 then raise exception 'UNVERIFIED_PAYMENT';end if;
end $$;
rollback;
select 'PASS: duplicate renewal creates no invoice; no unverified payment' as verification;
