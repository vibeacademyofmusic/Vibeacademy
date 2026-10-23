-- Profile-only fallback for historical opening data that cannot satisfy the
-- existing class + academic-start + monetary import contract. No ledger rows.
create table public.legacy_student_opening_batches (
 import_batch_id uuid primary key,
 source_system text not null,
 source_file text not null,
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 authorization_sha256 text not null check (authorization_sha256 ~ '^[a-f0-9]{64}$'),
 rules_version text not null,
 branch_id uuid not null references public.branches(id),
 cutover_date date not null,
 source_shape text not null,
 source_payload jsonb not null,
 status text not null check(status in ('IMPORTED','ROLLED_BACK')),
 result jsonb not null default '{}',
 executed_by text not null default session_user,
 created_at timestamptz not null default now(),
 rolled_back_at timestamptz,
 unique(source_system,source_sha256,rules_version)
);
create table public.legacy_student_opening_rows (
 id uuid primary key default gen_random_uuid(),
 import_batch_id uuid not null references public.legacy_student_opening_batches(import_batch_id),
 source_reference text not null,
 source_excel_row integer not null,
 identity_key text not null,
 raw_payload jsonb not null,
 normalized_payload jsonb not null,
 disposition text not null check(disposition in ('IMPORT','HELD','EXCLUDED')),
 reason text not null,
 profile_action text not null check(profile_action in ('CREATED','LINKED_SOURCE','LINKED_EXISTING','HELD','EXCLUDED','IDENTITY_CONFLICT','ROLLED_BACK')),
 target_student_id uuid references public.students(id),
 profile_after jsonb,
 curriculum_id uuid references public.curriculums(id),
 level_id uuid references public.curriculum_levels(id),
 program_state text not null check(program_state in ('MAPPED_AWAITING_ACADEMIC_START','UNMAPPED','OUTSIDE_SCOPE')),
 academic_started_on date check(academic_started_on is null),
 tuition_plan_id uuid references public.tuition_plans(id),
 duration_months integer check(duration_months in (3,6,12)),
 is_unlimited boolean not null,
 fee_starts_on date,
 source_base_ends_on date,
 source_effective_ends_on date,
 calculated_ends_on date,
 date_state text not null check(date_state in ('MATCHED','CONFLICT','UNLIMITED','MISSING')),
 term_state text not null check(term_state in ('ACTIVE_AT_CUTOVER','EXPIRED_AT_CUTOVER','UNLIMITED','PENDING_REVIEW')),
 legacy_paid_attested boolean not null,
 fee_reconciliation_state text not null default 'PENDING_RECONCILIATION' check(fee_reconciliation_state='PENDING_RECONCILIATION'),
 final_amount numeric(14,2) check(final_amount is null),
 opening_paid_amount numeric(14,2) check(opening_paid_amount is null),
 opening_outstanding_attested numeric(14,2) check(opening_outstanding_attested=0),
 currency text not null check(currency='VND'),
 notifications_eligible boolean not null default false check(not notifications_eligible),
 review_reasons text[] not null,
 created_at timestamptz not null default now(),
 unique(import_batch_id,source_reference),
 check(not is_unlimited or (duration_months is null and source_base_ends_on is null and source_effective_ends_on is null and calculated_ends_on is null))
);
create index legacy_opening_rows_student on public.legacy_student_opening_rows(target_student_id);
create index legacy_opening_rows_queue on public.legacy_student_opening_rows(import_batch_id,disposition);
alter table public.legacy_student_opening_batches enable row level security;
alter table public.legacy_student_opening_rows enable row level security;
create policy legacy_opening_batch_read on public.legacy_student_opening_batches
 for select to authenticated using(public.has_permission('migration.upload',branch_id));
create policy legacy_opening_row_read on public.legacy_student_opening_rows
 for select to authenticated using(exists(select 1 from public.legacy_student_opening_batches b where b.import_batch_id=legacy_student_opening_rows.import_batch_id));
revoke all on public.legacy_student_opening_batches,public.legacy_student_opening_rows from public,anon,authenticated,service_role;
grant select on public.legacy_student_opening_batches,public.legacy_student_opening_rows to authenticated;

create table maintenance_private.legacy_student_opening_backups (
 import_batch_id uuid primary key references public.legacy_student_opening_batches(import_batch_id),
 student_preimages jsonb not null,
 preserved_tables jsonb not null,
 created_at timestamptz not null default now()
);
alter table maintenance_private.legacy_student_opening_backups enable row level security;
revoke all on maintenance_private.legacy_student_opening_backups from public,anon,authenticated,service_role;

-- Manual administrator operation only; never callable through an exposed API.
-- SECURITY INVOKER: no application-role privilege escalation.
create function maintenance_private.import_legacy_student_openings(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $import$
declare
 bid uuid:=(p_payload->>'import_batch_id')::uuid;
 branch uuid; existing public.legacy_student_opening_batches%rowtype;
 r jsonb; n jsonb; raw jsonb; ref text; v_identity_key text; disp text;
 sid uuid; cid uuid; lid uuid; pid uuid; action text; program_state text;
 prior jsonb; preserved jsonb:='{}'; table_name text; digest text; digest_after text;
 expected_end date; v_result jsonb; candidates integer;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'Manual database administrator operation only'; end if;
 if p_payload->>'source_system'<>'VIBE_CT_LEGACY_20261023' or p_payload->>'rules_version'<>'PROFILE_OPENING_V2'
   or p_payload->>'cutover_date'<>'2026-10-23' or p_payload->>'branch_code'<>'CT01'
   or jsonb_array_length(p_payload->'rows')<>111 then raise exception 'Unexpected authorized source contract'; end if;
 perform pg_advisory_xact_lock(hashtextextended('legacy-profile-opening:'||(p_payload->>'source_sha256'),0));
 select * into existing from legacy_student_opening_batches where import_batch_id=bid for update;
 if found then
  if existing.source_payload<>p_payload or existing.status<>'IMPORTED' then raise exception 'Source identity changed or batch rolled back'; end if;
  return existing.result||jsonb_build_object('idempotent_replay',true);
 end if;
 select id into branch from branches where code='CT01' and name='Vibe Academy Cần Thơ' and status='ACTIVE';
 if branch is null then raise exception 'Verified Can Tho branch missing'; end if;
 -- Do not race with manual profile creation, financial writes or message dispatch.
 lock table public.students in share row exclusive mode;
 foreach table_name in array array[
 'public.classes','public.class_teachers','public.schedules','public.session_occurrences',
 'public.enrollments','public.enrollment_tuition','public.invoices','public.payments',
 'public.opening_receivables','public.opening_settlements','public.tuition_reminders',
 'public.registration_payos_orders','public.registration_momo_orders','public.tuition_payos_orders',
 'public.notification_jobs','public.notification_events','public.zalo_notification_attempts',
 'public.parents','public.student_parents','public.student_curriculum_enrollments',
 'public.student_level_progress','public.student_subject_progress','public.student_component_progress',
 'public.student_component_item_progress','public.curriculums','public.curriculum_levels',
 'public.teachers','public.employees','public.courses','public.rooms','public.branches'
 ] loop
  if to_regclass(table_name) is null then continue; end if;
  execute format('lock table %s in share mode',table_name::regclass);
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from %s t',table_name::regclass) into digest;
  preserved:=preserved||jsonb_build_object(table_name,digest);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into prior from students s where default_branch_id=branch;
 insert into legacy_student_opening_batches(import_batch_id,source_system,source_file,source_sha256,authorization_sha256,rules_version,branch_id,cutover_date,source_shape,source_payload,status)
 values(bid,p_payload->>'source_system',p_payload->>'source_file',p_payload->>'source_sha256',p_payload->>'authorization_sha256',p_payload->>'rules_version',branch,(p_payload->>'cutover_date')::date,p_payload->>'source_shape',p_payload,'IMPORTED');
 insert into maintenance_private.legacy_student_opening_backups(import_batch_id,student_preimages,preserved_tables) values(bid,prior,preserved);
 for r in select value from jsonb_array_elements(p_payload->'rows') loop
  n:=r->'normalized_payload'; raw:=r->'raw_payload'; ref:=r->>'source_reference'; v_identity_key:=r->>'identity_key'; disp:=r->>'disposition';
  sid:=null; cid:=null; lid:=null; pid:=null;
  if ref is distinct from raw->>'legacy_reference' or nullif(n->>'full_name','') is null
    or n->>'academic_started_at' is not null or n->>'admission_date' is not null
    or n->>'final_amount' is not null or n->>'opening_paid_amount' is not null then raise exception 'Invalid source or unknown-field mapping: %',ref; end if;
  if ref in ('EXCEL-OLD-125','VIBE-CT-LEGACY-20261023-R60') and disp<>'EXCLUDED' then raise exception 'Excluded source row selected'; end if;
  if ref in ('VIBE-CT-LEGACY-20261023-R26','VIBE-CT-LEGACY-20261023-R94') and disp<>'HELD' then raise exception 'Held source row selected'; end if;
  if v_identity_key<>ref and not (ref='VIBE-CT-LEGACY-20261023-R97' and v_identity_key='VIBE-CT-LEGACY-20261023-R96') then raise exception 'Unapproved identity grouping'; end if;
  if n->>'curriculum_code' is not null then
   select c.id,l.id into cid,lid from curriculums c join curriculum_levels l on l.curriculum_id=c.id
    where c.code=n->>'curriculum_code' and l.code=n->>'level_code' and c.status='ACTIVE' and l.status='ACTIVE';
   if cid is null or lid is null then raise exception 'Mapped program changed: %',ref; end if;
  end if;
  if n->>'tuition_plan_code' is not null then
   select id into pid from tuition_plans where code=n->>'tuition_plan_code' and duration_months=(n->>'duration_months')::integer and status='ACTIVE';
   if pid is null then raise exception 'Mapped plan changed: %',ref; end if;
  end if;
  if n->>'duration_months' is not null and n->>'fee_starts_on' is not null then
   expected_end:=calculate_tuition_base_end((n->>'fee_starts_on')::date,(n->>'duration_months')::integer);
   if expected_end is distinct from (n->>'calculated_ends_on')::date then raise exception 'Period convention changed: %',ref; end if;
   if n->>'date_state'='MATCHED' and (expected_end is distinct from (n->>'source_base_ends_on')::date or expected_end is distinct from (n->>'source_effective_ends_on')::date) then raise exception 'Unisolated date conflict: %',ref; end if;
  end if;
  if disp='IMPORT' then
   select target_student_id into sid from legacy_student_opening_rows where import_batch_id=bid and legacy_student_opening_rows.identity_key=v_identity_key and target_student_id is not null limit 1;
   action:='LINKED_SOURCE';
   if sid is not null and not exists(select 1 from students where id=sid and full_name=n->>'full_name') then raise exception 'Shared identity mismatch'; end if;
   if sid is null then
    select o.target_student_id into sid from legacy_student_opening_rows o join legacy_student_opening_batches b on b.import_batch_id=o.import_batch_id
     where b.source_system=p_payload->>'source_system' and b.status='IMPORTED' and o.source_reference=ref and o.target_student_id is not null limit 1;
    action:='LINKED_EXISTING';
   end if;
   if sid is null and nullif(n->>'student_code','') is not null then
    select id into sid from students where student_code=n->>'student_code' and default_branch_id=branch and full_name=n->>'full_name';
   end if;
   if sid is null then
    select count(*) into candidates from students where
     (nullif(n->>'student_code','') is not null and student_code=n->>'student_code')
     or (lower(regexp_replace(btrim(full_name),'[[:space:]]+',' ','g'))=lower(n->>'full_name') and default_branch_id=branch)
     ;
    if candidates>0 then
     action:='IDENTITY_CONFLICT';
    else
     if n->>'student_status'<>'ACTIVE' then raise exception 'Unapproved profile status: %',ref; end if;
     insert into students(full_name,student_code,default_branch_id,status,gender,phone,email)
     values(n->>'full_name',n->>'student_code',branch,'ACTIVE',nullif(n->>'gender',''),nullif(n->>'phone',''),nullif(n->>'email','')) returning id into sid;
     action:='CREATED';
    end if;
   end if;
  else action:=disp;
  end if;
  program_state:=case when disp<>'IMPORT' then 'OUTSIDE_SCOPE' when cid is null then 'UNMAPPED' else 'MAPPED_AWAITING_ACADEMIC_START' end;
  insert into legacy_student_opening_rows(import_batch_id,source_reference,source_excel_row,identity_key,raw_payload,normalized_payload,disposition,reason,profile_action,target_student_id,profile_after,curriculum_id,level_id,program_state,tuition_plan_id,duration_months,is_unlimited,fee_starts_on,source_base_ends_on,source_effective_ends_on,calculated_ends_on,date_state,term_state,legacy_paid_attested,opening_outstanding_attested,currency,review_reasons)
  values(bid,ref,(r->>'excel_row')::integer,v_identity_key,raw,n,disp,r->>'reason',action,sid,(select to_jsonb(s) from students s where s.id=sid),cid,lid,program_state,pid,(n->>'duration_months')::integer,(n->>'is_unlimited')::boolean,(n->>'fee_starts_on')::date,(n->>'source_base_ends_on')::date,(n->>'source_effective_ends_on')::date,(n->>'calculated_ends_on')::date,n->>'date_state',n->>'term_state',(n->>'legacy_paid_attested')::boolean,(n->>'opening_outstanding_attested')::numeric,n->>'currency',array(select jsonb_array_elements_text(n->'review_reasons')));
 end loop;
 for table_name,digest in select key,value from jsonb_each_text(preserved) loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from %s t',table_name::regclass) into digest_after;
  if digest_after<>digest then raise exception 'Outside-scope table changed: %',table_name; end if;
 end loop;
 select jsonb_build_object('import_batch_id',bid,'created_profiles',count(*) filter(where profile_action='CREATED'),
 'linked_existing',count(*) filter(where profile_action='LINKED_EXISTING'),'linked_within_batch',count(*) filter(where profile_action='LINKED_SOURCE'),
 'unique_profiles',count(distinct target_student_id),'source_rows',count(*),
 'imported_source_rows',count(*) filter(where disposition='IMPORT' and target_student_id is not null),
 'held_rows',count(*) filter(where disposition='HELD'),'excluded_rows',count(*) filter(where disposition='EXCLUDED'),
 'identity_conflicts',count(*) filter(where profile_action='IDENTITY_CONFLICT'),
 'mapped_programs_pending_start',count(*) filter(where disposition='IMPORT' and curriculum_id is not null),
 'unmapped_programs',count(*) filter(where disposition='IMPORT' and curriculum_id is null),
 'staged_fee_terms',count(*) filter(where disposition='IMPORT' and target_student_id is not null),
 'expired_source_terms',count(*) filter(where disposition='IMPORT' and term_state='EXPIRED_AT_CUTOVER'),
 'date_conflicts',count(*) filter(where disposition='IMPORT' and date_state='CONFLICT'),
 'active_academic_enrollments_created',0,'operational_tuition_created',0,'preserved_tables_verified',true,'idempotent_replay',false)
 into v_result from legacy_student_opening_rows where import_batch_id=bid;
 update legacy_student_opening_batches set result=v_result where import_batch_id=bid;
 return v_result;
end $import$;
revoke all on function maintenance_private.import_legacy_student_openings(jsonb) from public,anon,authenticated,service_role;

-- Roll back only unmodified profiles created by this batch. Source evidence stays.
create function maintenance_private.rollback_legacy_student_openings(p_batch uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $rollback$
declare b public.legacy_student_opening_batches%rowtype; ids uuid[]; fk record; dependent boolean; removed integer;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'Manual database administrator operation only'; end if;
 select * into b from legacy_student_opening_batches where import_batch_id=p_batch for update;
 if b.import_batch_id is null then raise exception 'Batch not found'; end if;
 if b.status='ROLLED_BACK' then return jsonb_build_object('import_batch_id',p_batch,'already_rolled_back',true); end if;
 lock table public.students in share row exclusive mode;
 select coalesce(array_agg(target_student_id),'{}'::uuid[]) into ids from legacy_student_opening_rows where import_batch_id=p_batch and profile_action='CREATED';
 if exists(select 1 from legacy_student_opening_rows r join students s on s.id=r.target_student_id where r.import_batch_id=p_batch and r.profile_action='CREATED' and r.profile_after<>to_jsonb(s)) then raise exception 'Imported profile was edited; manual reconciliation required'; end if;
 if exists(select 1 from legacy_student_opening_rows where import_batch_id<>p_batch and target_student_id=any(ids)) then raise exception 'Another batch uses these profiles'; end if;
 for fk in
  select c.conrelid, a.attname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid='public.students'::regclass and c.conrelid<>'public.legacy_student_opening_rows'::regclass
 loop
  execute format('select exists(select 1 from %s where %I=any($1))',fk.conrelid::regclass,fk.attname) into dependent using ids;
  if dependent then raise exception 'New business data in %; manual reconciliation required',fk.conrelid::regclass; end if;
 end loop;
 update legacy_student_opening_rows set target_student_id=null,profile_action='ROLLED_BACK'
  where import_batch_id=p_batch and target_student_id is not null;
 delete from students where id=any(ids);
 get diagnostics removed=ROW_COUNT;
 if removed<>cardinality(ids) then raise exception 'Rollback count mismatch'; end if;
 update legacy_student_opening_batches set status='ROLLED_BACK',rolled_back_at=now() where import_batch_id=p_batch;
 return jsonb_build_object('import_batch_id',p_batch,'removed_created_profiles',removed,'source_evidence_preserved',true);
end $rollback$;
revoke all on function maintenance_private.rollback_legacy_student_openings(uuid) from public,anon,authenticated,service_role;
