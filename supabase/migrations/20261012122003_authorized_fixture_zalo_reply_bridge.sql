-- Historical migration rewritten for clean replay without embedding a real recipient.
-- Production has already applied the original migration; do not reapply it there.
create function notification_private.bridge_authorized_fixture_notice(p_test uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare t notification_private.authorized_zalo_fixture_tests; created uuid;
begin
 select * into t from notification_private.authorized_zalo_fixture_tests where id=p_test;
 if not found or t.template_id<>'645192' or t.state not in ('ACCEPTED','DELIVERED') or t.provider_message_id is null or t.sent_at is null then return null; end if;
 insert into tuition_zalo_sends(tracking_id,reminder_id,student_id,parent_id,enrollment_tuition_id,template_key,send_status,provider_message_id,oa_id,app_id,provider_template_id,context_captured_at,sent_at,delivered_at)
 select t.tracking_id,r.id,t.student_id,t.parent_id,et.id,'ZALO_TUITION_REMINDER',case when t.state='DELIVERED' then 'DELIVERED' else 'SENT' end,t.provider_message_id,'4520912928458797082','1355275380325944240','645192',clock_timestamp(),t.sent_at,t.delivered_at
 from tuition_reminders r
 join enrollment_tuition et on et.id=r.enrollment_tuition_id
 join enrollments e on e.id=et.enrollment_id
 join students s on s.id=e.student_id
 join student_parents sp on sp.student_id=s.id and sp.parent_id=t.parent_id
 join parents pa on pa.id=sp.parent_id
 join profiles p on p.id=pa.user_id
 where r.id=t.reminder_id
   and s.id=t.student_id
   and s.student_code=t.parameters->>'student_code'
   and p.phone=t.recipient_phone
 on conflict(tracking_id) do nothing;
 select id into created from tuition_zalo_sends
 where tracking_id=t.tracking_id
   and provider_message_id=t.provider_message_id
   and reminder_id=t.reminder_id
   and student_id=t.student_id
   and parent_id=t.parent_id
   and provider_template_id='645192'
   and oa_id='4520912928458797082';
 if created is null then raise exception 'FIXTURE_SEND_COLLISION'; end if;
 if t.state='DELIVERED' and t.delivered_at is not null then update tuition_zalo_sends set send_status='DELIVERED',delivered_at=t.delivered_at where id=created and send_status='SENT'; end if;
 return created;
end $$;
revoke all on function notification_private.bridge_authorized_fixture_notice(uuid) from public,anon,authenticated,service_role;
create or replace function public.finish_authorized_zalo_fixture_test(p_test uuid,p_state text,p_message text default null,p_error text default null,p_delivery_time text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare t notification_private.authorized_zalo_fixture_tests;
begin
 select * into t from notification_private.authorized_zalo_fixture_tests where id=p_test for update;
 if not found then return 'NOT_FOUND'; end if;
 if p_state='DELIVERED' and t.state='ACCEPTED' and p_message=t.provider_message_id and p_delivery_time ~ '^[0-9]{13}$' then
  update notification_private.authorized_zalo_fixture_tests set state='DELIVERED',delivered_at=to_timestamp(p_delivery_time::numeric/1000) where id=t.id; perform notification_private.bridge_authorized_fixture_notice(t.id); return 'DELIVERED';
 end if;
 if t.state<>'CLAIMED' then perform notification_private.bridge_authorized_fixture_notice(t.id); return t.state; end if;
 if p_state not in ('ACCEPTED','REJECTED','UNKNOWN') or (p_state='ACCEPTED' and coalesce(p_message,'') !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'INVALID_RESULT'; end if;
 update notification_private.authorized_zalo_fixture_tests set state=p_state,provider_message_id=p_message,provider_error=left(p_error,100),sent_at=case when p_state='ACCEPTED' then now() end where id=t.id;
 perform notification_private.bridge_authorized_fixture_notice(t.id);
 return p_state;
end $$;
select notification_private.bridge_authorized_fixture_notice(id) from notification_private.authorized_zalo_fixture_tests where template_id='645192' and state in ('ACCEPTED','DELIVERED');
