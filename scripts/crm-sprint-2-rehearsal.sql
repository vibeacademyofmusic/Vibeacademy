-- Transactional Sprint 2 rehearsal. The caller wraps this file in BEGIN/ROLLBACK.
do $rehearsal$
declare
  branch_a uuid := 'c2a00000-0000-4000-8000-000000000001';
  branch_b uuid := 'c2a00000-0000-4000-8000-000000000002';
  super uuid := 'c2b00000-0000-4000-8000-000000000001';
  admin_a uuid := 'c2b00000-0000-4000-8000-000000000002';
  admin_b uuid := 'c2b00000-0000-4000-8000-000000000003';
  teacher uuid := 'c2b00000-0000-4000-8000-000000000004';
  disabled uuid := 'c2b00000-0000-4000-8000-000000000005';
  lead uuid := 'c2c00000-0000-4000-8000-000000000001';
  req_assign uuid := 'c2c00000-0000-4000-8000-000000000002';
  req_transition uuid := 'c2c00000-0000-4000-8000-000000000003';
  req_invalid uuid := 'c2c00000-0000-4000-8000-000000000004';
  req_stale uuid := 'c2c00000-0000-4000-8000-000000000005';
  req_cross uuid := 'c2c00000-0000-4000-8000-000000000006';
  req_note uuid := 'c2c00000-0000-4000-8000-000000000007';
  req_follow uuid := 'c2c00000-0000-4000-8000-000000000008';
  n bigint;
begin
  insert into public.branches(id, code, name) values
    (branch_a, 'CRM-REH-A', 'CRM Rehearsal A'),
    (branch_b, 'CRM-REH-B', 'CRM Rehearsal B');
  insert into auth.users(id) values (super), (admin_a), (admin_b), (teacher), (disabled);
  insert into public.profiles(id, full_name, status) values
    (super, 'CRM Super', 'ACTIVE'),
    (admin_a, 'CRM Admin A', 'ACTIVE'),
    (admin_b, 'CRM Admin B', 'ACTIVE'),
    (teacher, 'CRM Teacher', 'ACTIVE'),
    (disabled, 'CRM Disabled', 'INACTIVE');
  insert into public.user_roles(user_id, role_id, branch_id)
  select super, id, null from public.roles where code = 'SUPER_ADMIN';
  insert into public.user_roles(user_id, role_id, branch_id)
  select admin_a, id, branch_a from public.roles where code = 'BRANCH_ADMIN';
  insert into public.user_roles(user_id, role_id, branch_id)
  select admin_b, id, branch_b from public.roles where code = 'BRANCH_ADMIN';
  insert into public.user_roles(user_id, role_id, branch_id)
  select teacher, id, branch_a from public.roles where code = 'TEACHER';
  insert into public.user_roles(user_id, role_id, branch_id)
  select disabled, id, null from public.roles where code = 'SUPER_ADMIN';

  perform set_config('request.jwt.claim.sub', super::text, true);
  perform public.create_crm_lead(
    lead, branch_a, 'Nguyen An', '090 123 4567', 'A@B.COM', 'Phu huynh An', 'Be An',
    '2016-04-02', 'Piano', 'Piano', 'WALK_IN', null
  );
  perform public.create_crm_lead(
    lead, branch_a, 'Nguyen An', '090 123 4567', 'A@B.COM', 'Phu huynh An', 'Be An',
    '2016-04-02', 'Piano', 'Piano', 'WALK_IN', null
  );
  select count(*) into n from public.crm_leads;
  if n <> 1 then raise exception 'REHEARSAL_CREATE_DUPLICATED'; end if;
  select count(*) into n from public.crm_lead_events;
  if n <> 1 then raise exception 'REHEARSAL_CREATE_EVENT_DUPLICATED'; end if;
  if (select phone from public.crm_leads where id = lead) <> '090 123 4567'
     or (select phone_key from public.crm_leads where id = lead) <> '0901234567'
     or (select email from public.crm_leads where id = lead) <> 'A@B.COM'
     or (select email_key from public.crm_leads where id = lead) <> 'a@b.com'
     or (select status from public.crm_leads where id = lead) <> 'NEW'
     or (select owner_user_id from public.crm_leads where id = lead) <> super
     or (select version from public.crm_leads where id = lead) <> 1
  then
    raise exception 'REHEARSAL_CREATE_SHAPE';
  end if;

  perform public.assign_crm_lead(req_assign, lead, 1, admin_a, 'Phu trach chi nhanh');
  perform public.assign_crm_lead(req_assign, lead, 1, admin_a, 'Phu trach chi nhanh');
  if (select owner_user_id from public.crm_leads where id = lead) <> admin_a
     or (select version from public.crm_leads where id = lead) <> 2
     or (select count(*) from public.crm_lead_events where event_type = 'ASSIGNED') <> 1
  then
    raise exception 'REHEARSAL_ASSIGN';
  end if;

  perform public.transition_crm_lead(req_transition, lead, 2, 'CONTACTED', 'Da goi', 'PHONE');
  if (select status from public.crm_leads where id = lead) <> 'CONTACTED'
     or (select version from public.crm_leads where id = lead) <> 3
  then
    raise exception 'REHEARSAL_TRANSITION';
  end if;

  begin
    perform public.transition_crm_lead(req_invalid, lead, 3, 'WON', null, null);
    raise exception 'REHEARSAL_INVALID_TRANSITION_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_TRANSITION_DENIED' then raise; end if;
  end;

  begin
    perform public.transition_crm_lead(req_stale, lead, 1, 'QUALIFIED', null, null);
    raise exception 'REHEARSAL_STALE_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_STALE' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_b::text, true);
  begin
    perform public.add_crm_lead_note(req_cross, lead, 3, 'Khong duoc', null);
    raise exception 'REHEARSAL_CROSS_BRANCH_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_UNAUTHORIZED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  begin
    perform public.create_crm_lead(gen_random_uuid(), branch_a, 'No permission', null, null, null, null, null, null, null, 'MANUAL', null);
    raise exception 'REHEARSAL_TEACHER_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_UNAUTHORIZED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', disabled::text, true);
  begin
    perform public.create_crm_lead(gen_random_uuid(), branch_a, 'Disabled', null, null, null, null, null, null, null, 'MANUAL', null);
    raise exception 'REHEARSAL_DISABLED_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_UNAUTHORIZED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', super::text, true);
  perform public.add_crm_lead_note(req_note, lead, 3, 'Phu huynh hoi hoc phi', 'ZALO');
  perform public.set_crm_lead_follow_up(req_follow, lead, 4, '2026-10-01', 'Goi lai', 'PHONE');
  if (select version from public.crm_leads where id = lead) <> 5
     or (select next_follow_up_on from public.crm_leads where id = lead) <> date '2026-10-01'
     or (select converted_at from public.crm_leads where id = lead) is not null
  then
    raise exception 'REHEARSAL_FOLLOW_UP';
  end if;
  if (select count(*) from public.crm_lead_events where lead_id = lead) <> 5 then
    raise exception 'REHEARSAL_EVENT_COUNT';
  end if;
  if (select string_agg(event_type, ',' order by created_at, id) from public.crm_lead_events where lead_id = lead)
     <> 'CREATED,ASSIGNED,CONTACTED,NOTE_ADDED,FOLLOW_UP_SET'
  then
    raise exception 'REHEARSAL_EVENT_HISTORY';
  end if;

  begin
    update public.crm_leads set status = 'WON' where id = lead;
    raise exception 'REHEARSAL_DIRECT_UPDATE_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_DIRECT_WRITE_DENIED' then raise; end if;
  end;
  begin
    delete from public.crm_leads where id = lead;
    raise exception 'REHEARSAL_DIRECT_DELETE_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_DIRECT_WRITE_DENIED' then raise; end if;
  end;
  begin
    update public.crm_lead_events set note = 'changed' where lead_id = lead;
    raise exception 'REHEARSAL_EVENT_UPDATE_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_EVENT_IMMUTABLE' then raise; end if;
  end;
  begin
    delete from public.crm_lead_events where lead_id = lead;
    raise exception 'REHEARSAL_EVENT_DELETE_ALLOWED';
  exception when others then
    if sqlerrm <> 'CRM_LEAD_EVENT_IMMUTABLE' then raise; end if;
  end;
  if (select status from public.crm_leads where id = lead) <> 'CONTACTED' then
    raise exception 'REHEARSAL_STATUS_MUTATED';
  end if;
end $rehearsal$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2b00000-0000-4000-8000-000000000003', true);
do $auth_write$
begin
  update public.crm_leads set full_name = 'forged';
  raise exception 'REHEARSAL_AUTH_UPDATE_ALLOWED';
exception when insufficient_privilege then
  null;
end $auth_write$;
do $auth_delete$
begin
  delete from public.crm_leads;
  raise exception 'REHEARSAL_AUTH_DELETE_ALLOWED';
exception when insufficient_privilege then
  null;
end $auth_delete$;
do $auth_read$
declare
  n bigint;
begin
  select count(*) into n from public.crm_leads;
  if n <> 0 then raise exception 'REHEARSAL_BRANCH_READ'; end if;
  perform set_config('request.jwt.claim.sub', 'c2b00000-0000-4000-8000-000000000002', true);
  select count(*) into n from public.crm_leads;
  if n <> 1 then raise exception 'REHEARSAL_BRANCH_A_READ'; end if;
  perform set_config('request.jwt.claim.sub', 'c2b00000-0000-4000-8000-000000000001', true);
  select count(*) into n from public.crm_leads;
  if n <> 1 then raise exception 'REHEARSAL_SUPER_READ'; end if;
end $auth_read$;
reset role;

set local role anon;
do $anon$
begin
  perform public.create_crm_lead(
    'c2c00000-0000-4000-8000-000000000099', 'c2a00000-0000-4000-8000-000000000001',
    'Anon', null, null, null, null, null, null, null, 'MANUAL', null
  );
  raise exception 'REHEARSAL_ANON_ALLOWED';
exception when insufficient_privilege then
  null;
end $anon$;
reset role;

select 'SPRINT_2_CRM_FOUNDATION_REHEARSAL' as result;
select 'PASS' as result;
