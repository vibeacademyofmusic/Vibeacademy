-- Historical migration rewritten for clean replay without embedding a real recipient.
-- Production has already applied the original migration; do not reapply it there.
create table notification_private.authorized_zalo_fixture_tests (
 id uuid primary key default gen_random_uuid(),
 reminder_id uuid not null references public.tuition_reminders(id),
 student_id uuid not null references public.students(id),
 parent_id uuid not null references public.parents(id),
 recipient_phone text not null check (recipient_phone ~ '^[0-9]{10,15}$'),
 template_id text not null check(template_id in ('645192','645028')),
 parameters jsonb not null,
 payment_link_cancelled boolean not null default false,
 check(template_id<>'645028' or payment_link_cancelled),
 tracking_id text not null unique default replace(gen_random_uuid()::text,'-',''),
 state text not null default 'AUTHORIZED' check(state in ('AUTHORIZED','CLAIMED','ACCEPTED','DELIVERED','REJECTED','UNKNOWN')),
 provider_message_id text,
 provider_error text,
 approved_by uuid not null references auth.users(id),
 expires_at timestamptz not null default now()+interval '24 hours',
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 delivered_at timestamptz,
 unique(reminder_id,template_id),
 check(coalesce(length(btrim(parameters->>'student_code')),0)>0),
 check(coalesce(length(btrim(parameters->>'student_name')),0)>0)
);
alter table notification_private.authorized_zalo_fixture_tests enable row level security;
revoke all on notification_private.authorized_zalo_fixture_tests from public,anon,authenticated,service_role;

create function public.authorized_zalo_fixture_test_view(p_reminder uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not coalesce(public.has_role('SUPER_ADMIN'),false) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'template_id',template_id,'state',state,'expires_at',expires_at,'message_id',provider_message_id,'sent_at',sent_at,'delivered_at',delivered_at) order by template_id desc) from notification_private.authorized_zalo_fixture_tests where reminder_id=p_reminder),'[]'::jsonb);
end $$;
create function public.claim_authorized_zalo_fixture_test(p_test uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t notification_private.authorized_zalo_fixture_tests; phone text;
begin
 if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN required'; end if;
 select * into t from notification_private.authorized_zalo_fixture_tests where id=p_test for update;
 if not found or t.expires_at<=now() then return jsonb_build_object('result','EXPIRED'); end if;
 if t.state<>'AUTHORIZED' then return jsonb_build_object('result','ALREADY_CLAIMED','state',t.state); end if;
 select p.phone into phone
 from tuition_reminders r
 join enrollment_tuition et on et.id=r.enrollment_tuition_id
 join enrollments e on e.id=et.enrollment_id
 join students s on s.id=e.student_id
 join student_parents sp on sp.student_id=s.id and sp.parent_id=t.parent_id
 join parents pa on pa.id=sp.parent_id
 join profiles p on p.id=pa.user_id
 where r.id=t.reminder_id
   and s.id=t.student_id
   and s.student_code=t.parameters->>'student_code';
 if phone is distinct from t.recipient_phone then raise exception 'TEST_RECIPIENT_MISMATCH'; end if;
 update notification_private.authorized_zalo_fixture_tests set state='CLAIMED' where id=t.id;
 return jsonb_build_object('result','CLAIMED','id',t.id,'template_id',t.template_id,'parameters',t.parameters,'payment_link_cancelled',t.payment_link_cancelled,'phone',phone,'tracking_id',t.tracking_id);
end $$;
create function public.finish_authorized_zalo_fixture_test(p_test uuid,p_state text,p_message text default null,p_error text default null,p_delivery_time text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare t notification_private.authorized_zalo_fixture_tests;
begin
 select * into t from notification_private.authorized_zalo_fixture_tests where id=p_test for update;
 if not found then return 'NOT_FOUND'; end if;
 if p_state='DELIVERED' and t.state='ACCEPTED' and p_message=t.provider_message_id and p_delivery_time ~ '^[0-9]{13}$' then
  update notification_private.authorized_zalo_fixture_tests set state='DELIVERED',delivered_at=to_timestamp(p_delivery_time::numeric/1000) where id=t.id; return 'DELIVERED';
 end if;
 if t.state<>'CLAIMED' then return t.state; end if;
 if p_state not in ('ACCEPTED','REJECTED','UNKNOWN') or (p_state='ACCEPTED' and coalesce(p_message,'') !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'INVALID_RESULT'; end if;
 update notification_private.authorized_zalo_fixture_tests set state=p_state,provider_message_id=p_message,provider_error=left(p_error,100),sent_at=case when p_state='ACCEPTED' then now() end where id=t.id;
 return p_state;
end $$;
revoke all on function public.authorized_zalo_fixture_test_view(uuid),public.claim_authorized_zalo_fixture_test(uuid),public.finish_authorized_zalo_fixture_test(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.authorized_zalo_fixture_test_view(uuid),public.claim_authorized_zalo_fixture_test(uuid) to authenticated;
grant execute on function public.finish_authorized_zalo_fixture_test(uuid,text,text,text,text) to service_role;
