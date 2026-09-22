begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name)
values ('c3100000-0000-4000-8000-000000000001', 'CRM-FOUNDATION', 'CRM Foundation');
insert into auth.users(id) values
  ('c3200000-0000-4000-8000-000000000001'),
  ('c3200000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c3200000-0000-4000-8000-000000000001', 'CRM Foundation Admin', 'ACTIVE'),
  ('c3200000-0000-4000-8000-000000000002', 'CRM Foundation Teacher', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c3200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c3200000-0000-4000-8000-000000000002', id, 'c3100000-0000-4000-8000-000000000001'
from public.roles where code = 'TEACHER';

select set_config('request.jwt.claim.sub', 'c3200000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.create_crm_lead('c3300000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', 'Unauthorized', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'create unauthorized'
);

select set_config('request.jwt.claim.sub', 'c3200000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_crm_lead('c3300000-0000-4000-8000-000000000009', 'c3100000-0000-4000-8000-000000000001', ' ', ' ', ' ', ' ', ' ', null, null, null, 'MANUAL', null)$$,
  'P0001', 'CRM_LEAD_INVALID', 'lead requires a contact or name'
);
select lives_ok(
  $$select public.create_crm_lead('c3300000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', 'Nguyen An', '090 123 4567', 'A@B.COM', null, 'Be An', '2016-04-02', 'Piano', null, 'WALK_IN', null)$$,
  'create success'
);
select lives_ok(
  $$select public.create_crm_lead('c3300000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', 'Nguyen An', '090 123 4567', 'A@B.COM', null, 'Be An', '2016-04-02', 'Piano', null, 'WALK_IN', null)$$,
  'create replay'
);
select is((select count(*) from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'replay keeps one lead');
select is((select phone from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), '090 123 4567', 'phone display is preserved');
select is((select phone_key from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), '0901234567', 'phone search key is digits');
select is((select email from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 'A@B.COM', 'email display is preserved');
select is((select email_key from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 'a@b.com', 'email search key is normalized');
select is((select count(*) from public.crm_lead_events where lead_id = 'c3300000-0000-4000-8000-000000000001' and event_type = 'CREATED'), 1::bigint, 'create writes one event');

select lives_ok(
  $$select public.update_crm_lead('c3300000-0000-4000-8000-000000000002', 'c3300000-0000-4000-8000-000000000001', 1, 'Nguyen An', '0901234567', 'a@b.com', 'Me An', 'Be An', '2016-04-02', 'Piano', 'Piano', 'REFERRAL')$$,
  'update contact'
);
select is((select parent_name from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 'Me An', 'update stores parent name');
select is((select version from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 2, 'update increments version');
select is((select event_type from public.crm_lead_events where id = 'c3300000-0000-4000-8000-000000000002'), 'UPDATED', 'update writes UPDATED');

select lives_ok(
  $$select public.add_crm_lead_note('c3300000-0000-4000-8000-000000000003', 'c3300000-0000-4000-8000-000000000001', 2, 'Phu huynh hoi lich', 'ZALO')$$,
  'add note'
);
select is((select event_type from public.crm_lead_events where id = 'c3300000-0000-4000-8000-000000000003'), 'NOTE_ADDED', 'note event');
select is((select note from public.crm_lead_events where id = 'c3300000-0000-4000-8000-000000000003'), 'Phu huynh hoi lich', 'note text stored');

select lives_ok(
  $$select public.set_crm_lead_follow_up('c3300000-0000-4000-8000-000000000004', 'c3300000-0000-4000-8000-000000000001', 3, '2026-10-01', 'Goi lai', 'PHONE')$$,
  'set follow-up'
);
select lives_ok(
  $$select public.set_crm_lead_follow_up('c3300000-0000-4000-8000-000000000004', 'c3300000-0000-4000-8000-000000000001', 3, '2026-10-01', 'Goi lai', 'PHONE')$$,
  'follow-up replay'
);
select is((select next_follow_up_on from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), '2026-10-01'::date, 'follow-up date stored');
select is((select count(*) from public.crm_lead_events where lead_id = 'c3300000-0000-4000-8000-000000000001' and event_type = 'FOLLOW_UP_SET'), 1::bigint, 'follow-up event');
select is((select version from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 4, 'replay does not increment version again');

select throws_ok(
  $$update public.crm_leads set status = 'WON' where id = 'c3300000-0000-4000-8000-000000000001'$$,
  'P0001', 'CRM_LEAD_DIRECT_WRITE_DENIED', 'direct update denied'
);
select throws_ok(
  $$delete from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'$$,
  'P0001', 'CRM_LEAD_DIRECT_WRITE_DENIED', 'direct delete denied'
);
select throws_ok(
  $$update public.crm_lead_events set note = 'changed' where id = 'c3300000-0000-4000-8000-000000000003'$$,
  'P0001', 'CRM_LEAD_EVENT_IMMUTABLE', 'event update denied'
);
select throws_ok(
  $$delete from public.crm_lead_events where id = 'c3300000-0000-4000-8000-000000000003'$$,
  'P0001', 'CRM_LEAD_EVENT_IMMUTABLE', 'event delete denied'
);
select is((select status from public.crm_leads where id = 'c3300000-0000-4000-8000-000000000001'), 'NEW', 'failed direct write leaves status unchanged');

set local role authenticated;
select throws_ok(
  $$update public.crm_leads set full_name = 'forged' where id = 'c3300000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_leads', 'authenticated direct update denied'
);
select throws_ok(
  $$delete from public.crm_lead_events where id = 'c3300000-0000-4000-8000-000000000003'$$,
  '42501', 'permission denied for table crm_lead_events', 'authenticated event delete denied'
);
reset role;

select * from finish();
rollback;
