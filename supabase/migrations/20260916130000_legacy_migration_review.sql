-- Legacy rows are untrusted staging data until mapped, independently reviewed
-- and imported as one student unit. No classless business enrollment is added.
insert into public.permissions(code,name,module,description)
select code,code,'migration',code from unnest(array[
 'migration.upload','migration.validate','migration.review_identity',
 'migration.review_academic','migration.review_finance','migration.import',
 'migration.rollback','migration.sign_off_final'
]) code on conflict(code) do nothing;

create table public.migration_batches (
 id uuid primary key default gen_random_uuid(),
 source_system text not null check(length(btrim(source_system)) between 1 and 100),
 source_file_name text not null check(length(source_file_name) between 1 and 255),
 source_file_hash text not null check(source_file_hash ~ '^[a-f0-9]{64}$'),
 raw_csv text,
 template_version text not null default 'V1',
 cutover_date date not null,
 branch_id uuid not null references public.branches,
 created_by uuid not null references auth.users,
 created_at timestamptz not null default now(),
 signed_off_by uuid references auth.users,
 signed_off_at timestamptz,
 unique(source_system,source_file_hash,template_version)
);
create table public.migration_batch_rows (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.migration_batches,
 row_number integer not null check(row_number>0),
 source_entity_type text not null default 'STUDENT' check(source_entity_type='STUDENT'),
 source_reference text not null check(length(btrim(source_reference)) between 1 and 200),
 raw_payload jsonb not null check(jsonb_typeof(raw_payload)='object'),
 normalized_payload jsonb not null check(jsonb_typeof(normalized_payload)='object'),
 version integer not null default 1,
 validation_result jsonb not null default '[]',
 status text not null default 'NEEDS_REVIEW' check(status in ('NEEDS_REVIEW','VALIDATED','READY','IMPORTED','REJECTED','ROLLED_BACK')),
 business_snapshot jsonb,
 last_import_error text,
 identity_reviewed_by uuid references auth.users,
 academic_reviewed_by uuid references auth.users,
 finance_reviewed_by uuid references auth.users,
 imported_by uuid references auth.users,
 imported_at timestamptz,
 target_student_id uuid references public.students,
 target_enrollment_id uuid references public.enrollments,
 target_tuition_id uuid references public.enrollment_tuition,
 created_at timestamptz not null default now(),
 unique(batch_id,row_number),
 unique(batch_id,source_entity_type,source_reference)
);
create table public.migration_source_mappings (
 source_system text not null,
 source_entity_type text not null,
 source_reference text not null,
 row_id uuid not null references public.migration_batch_rows,
 payload jsonb not null,
 student_id uuid not null references public.students,
 enrollment_id uuid not null references public.enrollments,
 tuition_id uuid not null references public.enrollment_tuition,
 status text not null default 'CURRENT' check(status in ('CURRENT','ROLLED_BACK')),
 created_at timestamptz not null default now(),
 primary key(source_system,source_entity_type,source_reference)
);
create table public.migration_audit_events (
 id bigint generated always as identity primary key,
 row_id uuid references public.migration_batch_rows,
 batch_id uuid not null references public.migration_batches,
 actor_id uuid not null references auth.users,
 action text not null,
 reason text not null,
 row_version integer,
 previous_payload jsonb,
 reviewed_payload jsonb,
 created_at timestamptz not null default now()
);
-- These are business opening balances, never unresolved financial-only rows.
-- Both require a completed academic/class/tuition import, not just a student ID.
create table public.opening_receivables (
 id uuid primary key default gen_random_uuid(),
 migration_row_id uuid not null unique references public.migration_batch_rows,
 tuition_id uuid not null unique references public.enrollment_tuition,
 enrollment_id uuid not null references public.enrollments,
 student_id uuid not null references public.students,
 branch_id uuid not null references public.branches,
 opening_as_of_date date not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 amount numeric(14,2) not null check(amount>=0),
 origin text not null default 'LEGACY_MIGRATION' check(origin='LEGACY_MIGRATION'),
 transaction_type text not null default 'OPENING_RECEIVABLE' check(transaction_type='OPENING_RECEIVABLE'),
 created_at timestamptz not null default now()
);
create table public.opening_settlements (
 id uuid primary key default gen_random_uuid(),
 receivable_id uuid not null unique references public.opening_receivables,
 amount numeric(14,2) not null check(amount>=0),
 cash_flow_effect boolean not null default false check(not cash_flow_effect),
 transaction_type text not null default 'OPENING_SETTLEMENT' check(transaction_type='OPENING_SETTLEMENT'),
 created_at timestamptz not null default now()
);
create index migration_rows_queue on public.migration_batch_rows(batch_id,status,row_number);
create index migration_audit_batch on public.migration_audit_events(batch_id,id);
create index opening_receivables_student on public.opening_receivables(student_id);

create view public.migration_reconciliation with(security_invoker=true) as
select r.id as row_id,r.batch_id,r.status,r.target_student_id,r.target_enrollment_id,r.target_tuition_id,
 o.currency,o.amount as imported_amount,coalesce(s.amount,0)::numeric(14,2) as imported_paid,
 (o.amount-coalesce(s.amount,0))::numeric(14,2) as imported_outstanding,
 case when r.status='IMPORTED' then o.amount-(r.normalized_payload->>'final_amount')::numeric end as amount_difference,
 case when r.status='IMPORTED' then coalesce(s.amount,0)-(r.normalized_payload->>'opening_paid_amount')::numeric end as paid_difference,
 case when r.status='IMPORTED' then o.amount-coalesce(s.amount,0)-(r.normalized_payload->>'opening_outstanding')::numeric end as outstanding_difference
from public.migration_batch_rows r left join public.opening_receivables o on o.tuition_id=r.target_tuition_id
left join public.opening_settlements s on s.receivable_id=o.id;
revoke all on public.migration_reconciliation from public,anon,authenticated,service_role;
grant select on public.migration_reconciliation to authenticated;

create function public.migration_can_read(p_batch uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.migration_batches b where b.id=p_batch
 and public.has_permission('migration.upload',b.branch_id))
$$;
alter table public.migration_batches enable row level security;
alter table public.migration_batch_rows enable row level security;
alter table public.migration_source_mappings enable row level security;
alter table public.migration_audit_events enable row level security;
alter table public.opening_receivables enable row level security;
alter table public.opening_settlements enable row level security;
create policy migration_batch_read on public.migration_batches for select to authenticated using(public.has_permission('migration.upload',branch_id));
create policy migration_row_read on public.migration_batch_rows for select to authenticated using(public.migration_can_read(batch_id));
create policy migration_mapping_read on public.migration_source_mappings for select to authenticated using(exists(select 1 from public.migration_batch_rows r where r.id=row_id));
create policy migration_audit_read on public.migration_audit_events for select to authenticated using(public.migration_can_read(batch_id));
create policy opening_read on public.opening_receivables for select to authenticated using(public.has_permission('migration.review_finance',branch_id) or public.has_role_permission('FINANCE','finance.view',branch_id));
create policy settlement_read on public.opening_settlements for select to authenticated using(exists(select 1 from public.opening_receivables r where r.id=receivable_id));
revoke all on public.migration_batches,public.migration_batch_rows,public.migration_source_mappings,
 public.migration_audit_events,public.opening_receivables,public.opening_settlements from public,anon,authenticated,service_role;
grant select on public.migration_batches,public.migration_batch_rows,public.migration_source_mappings,
 public.migration_audit_events,public.opening_receivables,public.opening_settlements to authenticated;

create view public.opening_receivable_balances with(security_invoker=true) as
select r.*,coalesce(s.amount,0)::numeric(14,2) as opening_paid_amount,
 (r.amount-coalesce(s.amount,0))::numeric(14,2) as outstanding_balance
from public.opening_receivables r left join public.opening_settlements s on s.receivable_id=r.id;
revoke all on public.opening_receivable_balances from public,anon,authenticated,service_role;
grant select on public.opening_receivable_balances to authenticated;

create function public.stage_legacy_batch(p_source text,p_filename text,p_hash text,p_cutover date,p_branch uuid,p_rows jsonb,p_raw_csv text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare bid uuid; item jsonb; normalized jsonb; n integer:=0; existing public.migration_batches%rowtype;
begin
 if not public.has_permission('migration.upload',p_branch) then raise exception 'Unauthorized'; end if;
 if p_cutover is null or p_cutover>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Invalid cutover date'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Expected 1 to 500 source rows'; end if;
 if octet_length(p_rows::text)>1000000 then raise exception 'Source payload too large'; end if;
 if p_raw_csv is not null and (octet_length(p_raw_csv)>500000 or encode(sha256(convert_to(p_raw_csv,'UTF8')),'hex')<>p_hash) then raise exception 'Raw file hash mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source||':'||p_hash,0));
 select * into existing from public.migration_batches where source_system=p_source and source_file_hash=p_hash and template_version='V1';
 if found then
  if existing.branch_id<>p_branch or existing.cutover_date<>p_cutover or
   (select jsonb_agg(raw_payload order by row_number) from public.migration_batch_rows where batch_id=existing.id) is distinct from p_rows then
   raise exception 'File identity conflicts with previous upload';
  end if;
  return existing.id;
 end if;
 insert into public.migration_batches(source_system,source_file_name,source_file_hash,cutover_date,branch_id,created_by,raw_csv)
 values(p_source,p_filename,p_hash,p_cutover,p_branch,auth.uid(),p_raw_csv) returning id into bid;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>20000 then raise exception 'Invalid source row'; end if;
  if exists(select 1 from jsonb_each(item) where jsonb_typeof(value)<>'string') then raise exception 'Source cells must be text'; end if;
  normalized:=public.normalize_legacy_payload(item);
  n:=n+1;
  insert into public.migration_batch_rows(batch_id,row_number,source_reference,raw_payload,normalized_payload)
  values(bid,n,normalized->>'legacy_reference',item,normalized);
 end loop;
 insert into public.migration_audit_events(batch_id,actor_id,action,reason) values(bid,auth.uid(),'UPLOAD','Source accepted for review only');
 return bid;
end $$;

-- Pure business validation. It never creates a student, enrollment or finance row.
create function public.legacy_row_errors(p_row uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.migration_batch_rows%rowtype; b public.migration_batches%rowtype; p jsonb;
 errors jsonb:='[]'; cl record; lev record; plan record; price record;
 start_date date; tuition_start date; baseline_end date; pause_start date; pause_end date; final numeric; paid numeric; debt numeric; calculated numeric;
begin
 select * into r from public.migration_batch_rows where id=p_row;
 select * into b from public.migration_batches where id=r.batch_id;
 p:=r.normalized_payload;
 if nullif(btrim(p->>'full_name'),'') is null or nullif(btrim(p->>'student_code'),'') is null then errors:=errors||'"IDENTITY_REQUIRED"'::jsonb; end if;
 if nullif(btrim(p->>'class_code'),'') is null then errors:=errors||'"CLASS_MAPPING_REQUIRED"'::jsonb; end if;
 select c.id,c.status,co.curriculum_id,co.level_id,co.status as course_status into cl
 from public.classes c join public.courses co on co.id=c.course_id where c.branch_id=b.branch_id and c.code=p->>'class_code';
 if cl.id is null or cl.status not in ('ACTIVE','COMPLETED') or cl.course_status<>'ACTIVE' then errors:=errors||'"CLASS_MAPPING_INVALID"'::jsonb; end if;
 select l.id,l.curriculum_id into lev from public.curriculum_levels l join public.curriculums c on c.id=l.curriculum_id
 where c.code=p->>'curriculum_code' and l.code=p->>'level_code' and l.status='ACTIVE' and c.status='ACTIVE';
 if lev.id is null or cl.curriculum_id is distinct from lev.curriculum_id or (cl.level_id is not null and cl.level_id<>lev.id) then errors:=errors||'"ACADEMIC_MAPPING_INVALID"'::jsonb; end if;
 if not exists(select 1 from public.curriculum_subjects where level_id=lev.id and status='ACTIVE') then errors:=errors||'"ACTIVE_SUBJECTS_REQUIRED"'::jsonb; end if;
 if exists(select 1 from public.curriculum_subjects s where s.level_id=lev.id and s.status='ACTIVE' and s.is_required and s.completion_rule='ALL_REQUIRED_COMPONENTS'
 and not exists(select 1 from public.curriculum_subject_components c where c.subject_id=s.id and c.status='ACTIVE' and c.is_required)) then errors:=errors||'"REQUIRED_COMPONENTS_MISSING"'::jsonb; end if;
 begin
  if coalesce(p->>'started_at','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p->>'tuition_starts_on','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'date'; end if;
  start_date:=(p->>'started_at')::date; tuition_start:=(p->>'tuition_starts_on')::date;
  if start_date>b.cutover_date or tuition_start<start_date or tuition_start>b.cutover_date then errors:=errors||'"TUITION_BASELINE_DATES_REQUIRE_REVIEW"'::jsonb; end if;
 exception when others then errors:=errors||'"START_DATE_INVALID"'::jsonb; end;
 select id,duration_months into plan from public.tuition_plans where code=p->>'tuition_plan_code' and status='ACTIVE';
 select list_price,currency into price from public.tuition_plan_branch_prices
 where tuition_plan_id=plan.id and status='ACTIVE' and (branch_id=b.branch_id or branch_id is null)
 order by (branch_id is not null) desc limit 1;
 if plan.id is null or price.list_price is null then errors:=errors||'"TUITION_PLAN_MAPPING_INVALID"'::jsonb; end if;
 begin
  if coalesce(p->>'final_amount','') !~ '^\d+(\.\d{1,2})?$' or coalesce(p->>'opening_paid_amount','') !~ '^\d+(\.\d{1,2})?$'
   or coalesce(p->>'opening_outstanding','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'money'; end if;
  final:=(p->>'final_amount')::numeric; paid:=(p->>'opening_paid_amount')::numeric; debt:=(p->>'opening_outstanding')::numeric;
  calculated:=price.list_price-public.calculate_tuition_discount_amount(price.list_price,p->>'discount_type',(p->>'discount_value')::numeric);
  if calculated is null or calculated<>final or paid+debt<>final or paid>final then errors:=errors||'"FINANCE_RECONCILIATION_MISMATCH"'::jsonb; end if;
  if p->>'currency' is distinct from price.currency then errors:=errors||'"CURRENCY_MISMATCH"'::jsonb; end if;
  if p->>'currency'='VND' and (trunc(final)<>final or trunc(paid)<>paid or trunc(debt)<>debt) then errors:=errors||'"VND_FRACTION_NOT_ALLOWED"'::jsonb; end if;
  if p->>'discount_type'<>'NONE' and nullif(btrim(p->>'discount_name'),'') is null then errors:=errors||'"DISCOUNT_EVIDENCE_REQUIRED"'::jsonb; end if;
 exception when others then errors:=errors||'"MONEY_INVALID"'::jsonb; end;
 if coalesce(p->>'student_status','') not in ('ACTIVE','PAUSED','INACTIVE') or coalesce(p->>'tuition_status','') not in ('ACTIVE','PAUSED','EXPIRED','CANCELLED') then errors:=errors||'"STATUS_BASELINE_REQUIRES_REVIEW"'::jsonb; end if;
 begin
  if exists(select 1 from jsonb_each_text(p) x where x.key in ('base_ends_on','effective_ends_on','pause_starts_on','pause_ends_on') and x.value<>'' and x.value !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid ISO date'; end if;
  baseline_end:=coalesce(nullif(p->>'effective_ends_on','')::date,public.calculate_tuition_base_end(tuition_start,plan.duration_months));
  if baseline_end<public.calculate_tuition_base_end(tuition_start,plan.duration_months) then errors:=errors||'"EFFECTIVE_END_INVALID"'::jsonb; end if;
  if nullif(p->>'base_ends_on','') is not null and (p->>'base_ends_on')::date<>public.calculate_tuition_base_end(tuition_start,plan.duration_months) then errors:=errors||'"BASE_END_MISMATCH"'::jsonb; end if;
  if p->>'tuition_status'='EXPIRED' and baseline_end>=b.cutover_date then errors:=errors||'"EXPIRED_END_INVALID"'::jsonb; end if;
  if p->>'tuition_status' in ('ACTIVE','PAUSED') and baseline_end<b.cutover_date then errors:=errors||'"ACTIVE_END_INVALID"'::jsonb; end if;
  if p->>'tuition_status'='PAUSED' or p->>'student_status'='PAUSED' then
   pause_start:=nullif(p->>'pause_starts_on','')::date; pause_end:=nullif(p->>'pause_ends_on','')::date;
   if pause_start is null or pause_end is null or pause_start>pause_end or pause_start>b.cutover_date or pause_end<b.cutover_date or pause_start<start_date then errors:=errors||'"PAUSE_BASELINE_REQUIRES_REVIEW"'::jsonb; end if;
   if baseline_end-public.calculate_tuition_base_end(tuition_start,plan.duration_months)<greatest(0,least(pause_end,baseline_end)-greatest(pause_start,tuition_start)+1) then errors:=errors||'"PAUSE_EXTENSION_MISMATCH"'::jsonb; end if;
  elsif nullif(p->>'pause_starts_on','') is not null or nullif(p->>'pause_ends_on','') is not null then errors:=errors||'"PAUSE_STATUS_MISMATCH"'::jsonb;
  end if;
 exception when others then errors:=errors||'"BASELINE_DATE_INVALID"'::jsonb; end;
 if exists(select 1 from public.students s where s.student_code=p->>'student_code' or lower(btrim(s.full_name))=lower(btrim(p->>'full_name')))
 and not exists(select 1 from public.migration_source_mappings m where m.source_system=b.source_system and m.source_entity_type=r.source_entity_type and m.source_reference=r.source_reference and m.payload=p)
 then errors:=errors||'"POSSIBLE_DUPLICATE_REQUIRES_REVIEW"'::jsonb; end if;
 if exists(select 1 from public.migration_source_mappings m where m.source_system=b.source_system and m.source_entity_type=r.source_entity_type and m.source_reference=r.source_reference and m.payload is distinct from p) then errors:=errors||'"SOURCE_ALREADY_IMPORTED_DIFFERENT_PAYLOAD"'::jsonb; end if;
 if exists(select 1 from public.migration_source_mappings m where m.source_system=b.source_system and m.source_entity_type=r.source_entity_type and m.source_reference=r.source_reference and m.status='ROLLED_BACK') then errors:=errors||'"ROLLED_BACK_SOURCE_REQUIRES_CORRECTION"'::jsonb; end if;
 return errors;
end $$;
revoke all on function public.legacy_row_errors(uuid) from public,anon,authenticated,service_role;

create function public.review_legacy_row(p_row uuid,p_version integer,p_action text,p_reason text,p_payload jsonb default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.migration_batch_rows%rowtype; b public.migration_batches%rowtype; errors jsonb; reviewer uuid;
begin
 select * into r from public.migration_batch_rows where id=p_row for update;
 select * into b from public.migration_batches where id=r.batch_id;
 if b.id is null or not public.has_permission(case p_action when 'VALIDATE' then 'migration.validate' when 'IDENTITY' then 'migration.review_identity' when 'ACADEMIC' then 'migration.review_academic' when 'FINANCE' then 'migration.review_finance' else 'migration.upload' end,b.branch_id) then raise exception 'Unauthorized'; end if;
 if r.status in ('IMPORTED','ROLLED_BACK') or p_version is null or r.version<>p_version or b.signed_off_at is not null then raise exception 'Stale or imported row'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Review reason required'; end if;
 if p_action='MAP' then
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>20000 then raise exception 'Invalid reviewed payload'; end if;
  if exists(select 1 from jsonb_each(p_payload) where jsonb_typeof(value)<>'string') then raise exception 'Reviewed cells must be text'; end if;
  p_payload:=public.normalize_legacy_payload(p_payload);
  if p_payload->>'legacy_reference' is distinct from r.source_reference then raise exception 'Source reference is immutable'; end if;
  update public.migration_batch_rows set normalized_payload=p_payload,version=version+1,status='NEEDS_REVIEW',identity_reviewed_by=null,academic_reviewed_by=null,finance_reviewed_by=null,validation_result='[]' where id=p_row;
 elsif p_action='REJECT' then
  update public.migration_batch_rows set status='REJECTED',identity_reviewed_by=null,academic_reviewed_by=null,finance_reviewed_by=null where id=p_row;
 elsif p_action in ('VALIDATE','IDENTITY','ACADEMIC','FINANCE') then
  errors:=public.legacy_row_errors(p_row);
  if errors<>'[]' then
   update public.migration_batch_rows set status='NEEDS_REVIEW',validation_result=errors,identity_reviewed_by=null,academic_reviewed_by=null,finance_reviewed_by=null where id=p_row;
  else
   if p_action='FINANCE' and auth.uid()=b.created_by then raise exception 'Financial reviewer must be independent of uploader'; end if;
   if p_action='FINANCE' and exists(select 1 from public.migration_audit_events where row_id=p_row and action='MAP' and actor_id=auth.uid()) then raise exception 'Financial reviewer must be independent of mapping author'; end if;
   update public.migration_batch_rows set status='VALIDATED',validation_result='[]',
    identity_reviewed_by=case when p_action='IDENTITY' then auth.uid() else identity_reviewed_by end,
    academic_reviewed_by=case when p_action='ACADEMIC' then auth.uid() else academic_reviewed_by end,
    finance_reviewed_by=case when p_action='FINANCE' then auth.uid() else finance_reviewed_by end where id=p_row;
   update public.migration_batch_rows set status='READY' where id=p_row and identity_reviewed_by is not null and academic_reviewed_by is not null and finance_reviewed_by is not null;
  end if;
 else raise exception 'Unknown review action'; end if;
 insert into public.migration_audit_events(row_id,batch_id,actor_id,action,reason,row_version,previous_payload,reviewed_payload)
 values(p_row,b.id,auth.uid(),p_action,p_reason,r.version,case when p_action='MAP' then r.normalized_payload end,case when p_action='MAP' then p_payload end);
 return (select status from public.migration_batch_rows where id=p_row);
end $$;

create function public.import_legacy_row(p_row uuid,p_version integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.migration_batch_rows%rowtype; b public.migration_batches%rowtype; m public.migration_source_mappings%rowtype;
 p jsonb; sid uuid; eid uuid; aid uuid; tid uuid; rid uuid; classid uuid; levelid uuid; curriculumid uuid; planid uuid;
begin
 select * into r from public.migration_batch_rows where id=p_row for update;
 select * into b from public.migration_batches where id=r.batch_id;
 if b.id is null or not public.has_role('SUPER_ADMIN') or not public.has_permission('migration.import',b.branch_id) then raise exception 'Unauthorized'; end if;
 if p_version is null or r.version<>p_version then raise exception 'Stale row version'; end if;
 if r.status='IMPORTED' then return r.target_student_id; end if;
 if r.status<>'READY' then raise exception 'Row requires mapping and independent approval'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.source_system||':'||r.source_entity_type||':'||r.source_reference,0));
 p:=r.normalized_payload;
 if public.legacy_row_errors(p_row)<>'[]' then raise exception 'Row validation changed; review required'; end if;
 select * into m from public.migration_source_mappings where source_system=b.source_system and source_entity_type=r.source_entity_type and source_reference=r.source_reference;
 if found then
  if m.payload is distinct from p then raise exception 'Imported source cannot be overwritten'; end if;
  sid:=m.student_id; eid:=m.enrollment_id; tid:=m.tuition_id;
 else
  -- Lock mapped masters against concurrent changes while normal engines run.
  select c.id into classid from public.classes c join public.courses co on co.id=c.course_id where c.branch_id=b.branch_id and c.code=p->>'class_code' for share of c,co;
  select l.id,l.curriculum_id into levelid,curriculumid from public.curriculum_levels l join public.curriculums c on c.id=l.curriculum_id where l.code=p->>'level_code' and c.code=p->>'curriculum_code' for share of l,c;
  select id into planid from public.tuition_plans where code=p->>'tuition_plan_code' for share;
  if public.legacy_row_errors(p_row)<>'[]' then raise exception 'Mapped master changed; review required'; end if;
  insert into public.students(student_code,full_name,default_branch_id,status)
   values(p->>'student_code',btrim(p->>'full_name'),b.branch_id,p->>'student_status') returning id into sid;
  aid:=public.assign_student_academic_program(sid,curriculumid,levelid,(p->>'started_at')::date,true);
  insert into public.enrollments(student_id,class_id,student_curriculum_enrollment_id,started_at,status)
   values(sid,classid,aid,(p->>'started_at')::date,'ACTIVE') returning id into eid;
  update public.migration_batch_rows set target_student_id=sid,target_enrollment_id=eid where id=p_row;
  if p->>'tuition_status'='PAUSED' or p->>'student_status'='PAUSED' then
   insert into public.enrollment_pauses(enrollment_id,starts_on,ends_on,reason) values(eid,(p->>'pause_starts_on')::date,(p->>'pause_ends_on')::date,'Approved current legacy pause baseline');
   update public.student_curriculum_enrollments set status='PAUSED' where id=aid;
  end if;
  insert into public.enrollment_tuition(enrollment_id,tuition_plan_id,starts_on,status,discount_type,discount_value,discount_name,notes,legacy_migration_row_id)
   values(eid,planid,(p->>'tuition_starts_on')::date,case p->>'tuition_status' when 'EXPIRED' then 'COMPLETED' when 'CANCELLED' then 'CANCELLED' else 'ACTIVE' end,p->>'discount_type',(p->>'discount_value')::numeric,p->>'discount_name','Legacy migration opening baseline',p_row) returning id into tid;
  if p->>'student_status'='INACTIVE' or p->>'tuition_status'='CANCELLED' then
   update public.enrollments set status='WITHDRAWN' where id=eid;
   update public.student_curriculum_enrollments set status='WITHDRAWN' where id=aid;
  end if;
  if not exists(select 1 from public.enrollment_tuition where id=tid and amount=(p->>'final_amount')::numeric and currency=p->>'currency') then raise exception 'Imported pricing reconciliation mismatch'; end if;
  insert into public.opening_receivables(migration_row_id,tuition_id,enrollment_id,student_id,branch_id,opening_as_of_date,currency,amount)
   values(p_row,tid,eid,sid,b.branch_id,b.cutover_date,p->>'currency',(p->>'final_amount')::numeric) returning id into rid;
  insert into public.opening_settlements(receivable_id,amount) values(rid,(p->>'opening_paid_amount')::numeric);
  insert into public.migration_source_mappings(source_system,source_entity_type,source_reference,row_id,payload,student_id,enrollment_id,tuition_id)
   values(b.source_system,r.source_entity_type,r.source_reference,p_row,p,sid,eid,tid);
 end if;
 update public.migration_batch_rows set status='IMPORTED',target_student_id=sid,target_enrollment_id=eid,target_tuition_id=tid,imported_by=auth.uid(),imported_at=now(),last_import_error=null where id=p_row;
 update public.migration_batch_rows set business_snapshot=public.legacy_business_snapshot(p_row) where id=p_row;
 insert into public.migration_audit_events(row_id,batch_id,actor_id,action,reason,row_version) values(p_row,b.id,auth.uid(),'IMPORT','Atomic approved student unit',r.version);
 return sid;
end $$;
revoke all on function public.migration_can_read(uuid),public.stage_legacy_batch(text,text,text,date,uuid,jsonb,text),public.review_legacy_row(uuid,integer,text,text,jsonb),public.import_legacy_row(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.migration_can_read(uuid),public.stage_legacy_batch(text,text,text,date,uuid,jsonb,text),public.review_legacy_row(uuid,integer,text,text,jsonb),public.import_legacy_row(uuid,integer) to authenticated;

create function public.guard_opening_tuition_finance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='invoices' then
  if exists(select 1 from public.opening_receivables where tuition_id=new.enrollment_tuition_id) then raise exception 'Opening tuition already has an opening receivable'; end if;
 elsif exists(select 1 from public.opening_receivables where tuition_id=old.id) and
  (new.amount,new.currency,new.list_price,new.discount_type,new.discount_value,new.discount_amount,new.enrollment_id,new.tuition_plan_id)
  is distinct from (old.amount,old.currency,old.list_price,old.discount_type,old.discount_value,old.discount_amount,old.enrollment_id,old.tuition_plan_id) then
  raise exception 'Opening financial baseline requires audited correction';
 end if;
 return new;
end $$;
create trigger opening_invoice_guard before insert or update on public.invoices for each row execute function public.guard_opening_tuition_finance();
create trigger zz_opening_tuition_guard before update on public.enrollment_tuition for each row execute function public.guard_opening_tuition_finance();
revoke all on function public.guard_opening_tuition_finance() from public,anon,authenticated,service_role;

-- Opening state is never a renewal/revenue forecast input.
create or replace view public.branch_monthly_revenue_forecast
with (
  security_invoker = true
)
as

with months as (
  select month_start
  from public.revenue_forecast_months
),

renewals as (
  select
    tuition.branch_id_snapshot
      as branch_id,

    tuition.branch_code_snapshot
      as branch_code,

    tuition.branch_name_snapshot
      as branch_name,

    tuition.currency,

    date_trunc(
      'month',
      tuition.effective_ends_on
    )::date
      as month_start,

    count(*)
      as expiring_tuition_count,

    count(
      distinct enrollment.student_id
    )
      as expiring_student_count,

    coalesce(
      sum(
        tuition.amount
      ),
      0
    )::numeric(14,2)
      as projected_renewal_amount

  from public.enrollment_tuition
    as tuition

  join public.enrollments
    as enrollment
    on enrollment.id =
      tuition.enrollment_id

  where tuition.status =
    'ACTIVE'
    and not exists (select 1 from public.opening_receivables opening where opening.tuition_id=tuition.id)

  group by
    tuition.branch_id_snapshot,
    tuition.branch_code_snapshot,
    tuition.branch_name_snapshot,
    tuition.currency,
    date_trunc(
      'month',
      tuition.effective_ends_on
    )::date
),

receivables as (
  select
    receivable.branch_id_snapshot
      as branch_id,

    receivable.branch_code_snapshot
      as branch_code,

    receivable.branch_name_snapshot
      as branch_name,

    receivable.currency,

    date_trunc(
      'month',
      receivable.due_on
    )::date
      as month_start,

    count(*) filter (
      where receivable.invoice_status =
        'ISSUED'
    )
      as invoices_due_count,

    coalesce(
      sum(
        receivable.outstanding_balance
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as expected_cash_due

  from public.invoice_receivables
    as receivable

  where receivable.due_on is not null

  group by
    receivable.branch_id_snapshot,
    receivable.branch_code_snapshot,
    receivable.branch_name_snapshot,
    receivable.currency,
    date_trunc(
      'month',
      receivable.due_on
    )::date
),

branch_currency as (
  select
    tuition.branch_id_snapshot
      as branch_id,

    tuition.branch_code_snapshot
      as branch_code,

    tuition.branch_name_snapshot
      as branch_name,

    tuition.currency

  from public.enrollment_tuition
    as tuition

  union

  select
    receivable.branch_id_snapshot,
    receivable.branch_code_snapshot,
    receivable.branch_name_snapshot,
    receivable.currency

  from public.invoice_receivables
    as receivable
)

select
  branch_currency.branch_id,

  branch_currency.branch_code,

  branch_currency.branch_name,

  branch_currency.currency,

  months.month_start,

  case
    when months.month_start =
      date_trunc(
        'month',
        timezone(
          'Asia/Ho_Chi_Minh',
          now()
        )
      )::date
    then 'CURRENT_MONTH'

    else 'NEXT_MONTH'
  end as forecast_period,

  coalesce(
    renewals.expiring_tuition_count,
    0
  ) as expiring_tuition_count,

  coalesce(
    renewals.expiring_student_count,
    0
  ) as expiring_student_count,

  coalesce(
    renewals.projected_renewal_amount,
    0
  )::numeric(14,2)
    as projected_renewal_amount,

  coalesce(
    receivables.invoices_due_count,
    0
  ) as invoices_due_count,

  coalesce(
    receivables.expected_cash_due,
    0
  )::numeric(14,2)
    as expected_cash_due,

  (
    coalesce(
      renewals.projected_renewal_amount,
      0
    )
    +
    coalesce(
      receivables.expected_cash_due,
      0
    )
  )::numeric(14,2)
    as gross_forecast_opportunity

from branch_currency

cross join months

left join renewals
  on renewals.branch_id =
    branch_currency.branch_id

  and renewals.currency =
    branch_currency.currency

  and renewals.month_start =
    months.month_start

left join receivables
  on receivables.branch_id =
    branch_currency.branch_id

  and receivables.currency =
    branch_currency.currency

  and receivables.month_start =
    months.month_start;


-- =========================================================
-- SYSTEM MONTHLY REVENUE FORECAST

-- Only the atomic importer may establish a later current-term baseline.
alter table public.enrollment_tuition add column legacy_migration_row_id uuid references public.migration_batch_rows;
alter table public.enrollment_tuition add column legacy_extension_days integer not null default 0 check(legacy_extension_days>=0);
create function public.authorized_legacy_tuition_payload(p_row uuid,p_enrollment uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare payload jsonb;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized legacy baseline'; end if;
 select r.normalized_payload into payload from public.migration_batch_rows r join public.enrollments e on e.id=r.target_enrollment_id
 where r.id=p_row and r.status='READY' and r.target_enrollment_id=p_enrollment and r.target_student_id=e.student_id
 and r.identity_reviewed_by is not null and r.academic_reviewed_by is not null and r.finance_reviewed_by is not null;
 if payload is null then raise exception 'Legacy baseline must be inside approved atomic import'; end if;
 return payload;
end $$;
revoke all on function public.authorized_legacy_tuition_payload(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.authorized_legacy_tuition_payload(uuid,uuid) to authenticated;

create or replace function
public.prepare_enrollment_tuition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare

  v_enrollment_started_at date;
  v_legacy jsonb;
  v_accepted_end date;
  v_current_pause_days integer;

  v_branch_id uuid;
  v_branch_code text;
  v_branch_name text;

  v_plan_code text;
  v_plan_name text;
  v_duration_months integer;

  v_list_price numeric(14,2);
  v_currency text;

  v_existing_terms bigint;

  v_discount_type text;
  v_discount_value numeric(14,2);

begin
  if new.legacy_migration_row_id is not null then
    v_legacy:=public.authorized_legacy_tuition_payload(new.legacy_migration_row_id,new.enrollment_id);
    if new.starts_on is distinct from (v_legacy->>'tuition_starts_on')::date then raise exception 'Legacy baseline date mismatch'; end if;
  elsif new.legacy_extension_days<>0 then raise exception 'Legacy extension requires approved baseline';
  end if;

  -- -------------------------------------------------------
  -- Load Enrollment + Class + Branch.
  -- -------------------------------------------------------

  select
    e.started_at,
    c.branch_id,
    b.code,
    b.name

  into
    v_enrollment_started_at,
    v_branch_id,
    v_branch_code,
    v_branch_name

  from public.enrollments e

  join public.classes c
    on c.id = e.class_id

  join public.branches b
    on b.id = c.branch_id

  where e.id = new.enrollment_id;


  if not found then
    raise exception
      'Enrollment, class, or branch does not exist';
  end if;


  if v_enrollment_started_at is null then
    raise exception
      'An enrollment must have a study start date before tuition can begin';
  end if;


  -- -------------------------------------------------------
  -- Load active Tuition Plan.
  -- -------------------------------------------------------

  select
    tp.code,
    tp.name,
    tp.duration_months

  into
    v_plan_code,
    v_plan_name,
    v_duration_months

  from public.tuition_plans tp

  where tp.id = new.tuition_plan_id
    and tp.status = 'ACTIVE';


  if not found then
    raise exception
      'Tuition plan does not exist or is inactive';
  end if;


  -- -------------------------------------------------------
  -- Resolve price.
  --
  -- Priority:
  -- 1. Exact branch override
  -- 2. Default price (branch_id NULL)
  -- -------------------------------------------------------

  select
    p.list_price,
    p.currency

  into
    v_list_price,
    v_currency

  from public.tuition_plan_branch_prices p

  where p.tuition_plan_id =
          new.tuition_plan_id

    and p.status = 'ACTIVE'

    and (
      p.branch_id = v_branch_id
      or p.branch_id is null
    )

  order by
    case
      when p.branch_id = v_branch_id
        then 0
      else 1
    end

  limit 1;


  if not found then
    raise exception
      'No active tuition price exists for plan % at branch %',
      v_plan_code,
      v_branch_code;
  end if;


  -- -------------------------------------------------------
  -- First tuition term MUST begin on actual started_at.
  -- -------------------------------------------------------

  select count(*)

  into v_existing_terms

  from public.enrollment_tuition et

  where et.enrollment_id =
          new.enrollment_id

    and et.status <> 'CANCELLED';


  if v_existing_terms = 0 and v_legacy is null
     and new.starts_on <>
         v_enrollment_started_at then

    raise exception
      'The first tuition term must start on the enrollment study start date';

  end if;


  if new.starts_on <
     v_enrollment_started_at then

    raise exception
      'Tuition cannot start before the enrollment study start date';

  end if;


  -- -------------------------------------------------------
  -- Normalize discount input.
  -- -------------------------------------------------------

  v_discount_type :=
    upper(
      coalesce(
        nullif(
          btrim(
            new.discount_type
          ),
          ''
        ),
        'NONE'
      )
    );


  v_discount_value :=
    coalesce(
      new.discount_value,
      0
    );


  if v_discount_type = 'NONE' then

    v_discount_value := 0;
    new.discount_name := null;

  elsif v_discount_type in (
    'PERCENT',
    'FIXED'
  ) then

    if new.discount_name is null
       or btrim(
         new.discount_name
       ) = '' then

      raise exception
        'Discount name is required when a discount is applied';

    end if;


    new.discount_name :=
      btrim(
        new.discount_name
      );

  else

    raise exception
      'Invalid tuition discount type: %',
      v_discount_type;

  end if;


  -- -------------------------------------------------------
  -- Snapshot Plan.
  -- -------------------------------------------------------

  new.plan_code_snapshot :=
    v_plan_code;

  new.plan_name_snapshot :=
    v_plan_name;

  new.duration_months_snapshot :=
    v_duration_months;


  -- -------------------------------------------------------
  -- Snapshot Branch.
  -- -------------------------------------------------------

  new.branch_id_snapshot :=
    v_branch_id;

  new.branch_code_snapshot :=
    v_branch_code;

  new.branch_name_snapshot :=
    v_branch_name;


  -- -------------------------------------------------------
  -- Snapshot Price.
  -- -------------------------------------------------------

  new.list_price :=
    v_list_price;

  new.currency :=
    v_currency;


  -- -------------------------------------------------------
  -- Calculate Discount.
  -- -------------------------------------------------------

  new.discount_type :=
    v_discount_type;

  new.discount_value :=
    v_discount_value;


  new.discount_amount :=
    public.calculate_tuition_discount_amount(
      v_list_price,
      v_discount_type,
      v_discount_value
    );


  -- -------------------------------------------------------
  -- Calculate Final Amount.
  -- -------------------------------------------------------

  new.amount :=
    round(
      v_list_price
      - new.discount_amount,
      2
    );


  -- -------------------------------------------------------
  -- Calculate contractual end.
  -- -------------------------------------------------------

  new.base_ends_on :=
    public.calculate_tuition_base_end(
      new.starts_on,
      v_duration_months
    );


  -- -------------------------------------------------------
  -- At creation:
  --
  -- effective end = original base end.
  --
  -- Enrollment Pause will extend this in a later step.
  -- -------------------------------------------------------

  new.effective_ends_on :=
    new.base_ends_on;


  if v_legacy is not null then
    v_accepted_end:=coalesce(nullif(v_legacy->>'effective_ends_on','')::date,new.base_ends_on);
    select coalesce(sum(greatest(0,least(ends_on,v_accepted_end)-greatest(starts_on,new.starts_on)+1)),0)::integer
    into v_current_pause_days from public.enrollment_pauses where enrollment_id=new.enrollment_id and status='ACTIVE';
    new.legacy_extension_days:=v_accepted_end-new.base_ends_on-v_current_pause_days;
    if new.legacy_extension_days<0 then raise exception 'Legacy pause extension mismatch'; end if;
    new.effective_ends_on:=v_accepted_end;
  end if;
  return new;

end;
$$;

-- Carry only the approved historical extension; real dated pauses stay in the existing calculation.
create or replace function
public.calculate_enrollment_tuition_effective_end(
  p_tuition_id uuid
)
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment_id uuid;
  v_starts_on date;
  v_base_ends_on date;

  v_effective_ends_on date;
  v_next_effective_ends_on date;

  v_pause_days integer;
  v_iteration integer := 0;
begin
  if p_tuition_id is null then
    raise exception
      'Tuition term id is required';
  end if;


  select
    tuition.enrollment_id,
    tuition.starts_on,
    tuition.base_ends_on + tuition.legacy_extension_days
  into
    v_enrollment_id,
    v_starts_on,
    v_base_ends_on
  from public.enrollment_tuition as tuition
  where tuition.id = p_tuition_id;


  if not found then
    raise exception
      'Tuition term not found';
  end if;


  v_effective_ends_on :=
    v_base_ends_on;


  loop
    v_iteration :=
      v_iteration + 1;


    if v_iteration > 1000 then
      raise exception
        'Unable to calculate tuition effective end date';
    end if;


    select
      coalesce(
        sum(
          least(
            pause.ends_on,
            v_effective_ends_on
          )
          -
          greatest(
            pause.starts_on,
            v_starts_on
          )
          + 1
        ),
        0
      )::integer
    into v_pause_days
    from public.enrollment_pauses as pause
    where pause.enrollment_id =
        v_enrollment_id
      and pause.status = 'ACTIVE'
      and pause.starts_on <=
        v_effective_ends_on
      and pause.ends_on >=
        v_starts_on;


    v_next_effective_ends_on :=
      v_base_ends_on
      + v_pause_days;


    if v_next_effective_ends_on =
      v_effective_ends_on
    then
      exit;
    end if;


    v_effective_ends_on :=
      v_next_effective_ends_on;
  end loop;


  return v_effective_ends_on;
end;
$$;

create function public.guard_legacy_tuition_marker() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.legacy_migration_row_id,new.legacy_extension_days) is distinct from (old.legacy_migration_row_id,old.legacy_extension_days) then raise exception 'Legacy baseline marker is immutable'; end if;
 return new;
end $$;
create trigger legacy_tuition_marker_guard before update on public.enrollment_tuition for each row execute function public.guard_legacy_tuition_marker();
revoke all on function public.guard_legacy_tuition_marker() from public,anon,authenticated,service_role;

-- Rollback is an audited reversal/archive, not deletion of financial history.
create table public.migration_rollback_requests (
 row_id uuid primary key references public.migration_batch_rows,
 maker_id uuid not null references auth.users,
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 checker_id uuid references auth.users,
 status text not null default 'REQUESTED' check(status in ('REQUESTED','COMPLETED','BLOCKED')),
 created_at timestamptz not null default now(),
 checked_at timestamptz,
 check(checker_id is null or checker_id<>maker_id)
);
create table public.opening_reversals (
 receivable_id uuid primary key references public.opening_receivables,
 rollback_row_id uuid not null unique references public.migration_rollback_requests(row_id),
 reversed_amount numeric(14,2) not null,
 reversed_settlement numeric(14,2) not null,
 created_at timestamptz not null default now()
);
alter table public.migration_rollback_requests enable row level security;
alter table public.opening_reversals enable row level security;
create policy rollback_read on public.migration_rollback_requests for select to authenticated using(exists(select 1 from public.migration_batch_rows r where r.id=row_id));
create policy opening_reversal_read on public.opening_reversals for select to authenticated using(exists(select 1 from public.opening_receivables r where r.id=receivable_id));
revoke all on public.migration_rollback_requests,public.opening_reversals from public,anon,authenticated,service_role;
grant select on public.migration_rollback_requests,public.opening_reversals to authenticated;

create or replace view public.opening_receivable_balances with(security_invoker=true) as
select r.*,coalesce(s.amount,0)::numeric(14,2) as opening_paid_amount,
 case when v.receivable_id is null then r.amount-coalesce(s.amount,0) else 0 end::numeric(14,2) as outstanding_balance,
 (v.receivable_id is not null) as reversed,
 (r.amount-coalesce(v.reversed_amount,0))::numeric(14,2) as net_opening_amount,
 (coalesce(s.amount,0)-coalesce(v.reversed_settlement,0))::numeric(14,2) as net_opening_paid
from public.opening_receivables r left join public.opening_settlements s on s.receivable_id=r.id
left join public.opening_reversals v on v.receivable_id=r.id;

create function public.legacy_business_snapshot(p_row uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'student',(select to_jsonb(s) from public.students s where s.id=r.target_student_id),
  'enrollments',(select jsonb_agg(to_jsonb(e) order by e.id) from public.enrollments e where e.student_id=r.target_student_id),
  'academic',(select jsonb_agg(to_jsonb(a) order by a.id) from public.student_curriculum_enrollments a where a.student_id=r.target_student_id),
  'levels',(select jsonb_agg(to_jsonb(l) order by l.id) from public.student_level_progress l join public.student_curriculum_enrollments a on a.id=l.enrollment_id where a.student_id=r.target_student_id),
  'subjects',(select jsonb_agg(to_jsonb(s) order by s.id) from public.student_subject_progress s join public.student_level_progress l on l.id=s.level_progress_id join public.student_curriculum_enrollments a on a.id=l.enrollment_id where a.student_id=r.target_student_id),
  'components',(select jsonb_agg(to_jsonb(c) order by c.id) from public.student_component_progress c join public.student_subject_progress s on s.id=c.subject_progress_id join public.student_level_progress l on l.id=s.level_progress_id join public.student_curriculum_enrollments a on a.id=l.enrollment_id where a.student_id=r.target_student_id),
  'tuition',(select jsonb_agg(to_jsonb(t) order by t.id) from public.enrollment_tuition t join public.enrollments e on e.id=t.enrollment_id where e.student_id=r.target_student_id),
  'pauses',(select jsonb_agg(to_jsonb(p) order by p.id) from public.enrollment_pauses p where p.enrollment_id=r.target_enrollment_id),
  'parents',(select jsonb_agg(to_jsonb(p) order by p.parent_id) from public.student_parents p where p.student_id=r.target_student_id)
 ) from public.migration_batch_rows r where r.id=p_row
$$;
revoke all on function public.legacy_business_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.rollback_legacy_row(p_row uuid,p_approve boolean,p_reason text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.migration_batch_rows%rowtype; b public.migration_batches%rowtype; req public.migration_rollback_requests%rowtype; eligible boolean;
begin
 select * into b from public.migration_batches where id=(select batch_id from public.migration_batch_rows where id=p_row) for update;
 select * into r from public.migration_batch_rows where id=p_row for update;
 if b.id is null or not public.has_role('SUPER_ADMIN') or not public.has_permission(case when p_approve then 'migration.review_finance' else 'migration.rollback' end,b.branch_id) then raise exception 'Unauthorized'; end if;
 if r.status='ROLLED_BACK' then return 'COMPLETED'; end if;
 if r.status<>'IMPORTED' or b.signed_off_at is not null
  or exists(select 1 from public.migration_batch_rows x join public.migration_batches y on y.id=x.batch_id where x.target_enrollment_id=r.target_enrollment_id and y.signed_off_at is not null)
  or not exists(select 1 from public.migration_source_mappings where row_id=p_row and status='CURRENT') then raise exception 'Source batch requires correction, not rollback'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Rollback reason required'; end if;
 if p_approve is null then raise exception 'Explicit rollback action required'; end if;
 if not p_approve then
  insert into public.migration_rollback_requests(row_id,maker_id,reason) values(p_row,auth.uid(),p_reason) on conflict(row_id) do nothing;
  insert into public.migration_audit_events(row_id,batch_id,actor_id,action,reason) values(p_row,b.id,auth.uid(),'ROLLBACK_REQUEST',p_reason);
  return (select status from public.migration_rollback_requests where row_id=p_row);
 end if;
 select * into req from public.migration_rollback_requests where row_id=p_row for update;
 if req.row_id is null or req.status<>'REQUESTED' then raise exception 'Pending rollback request required'; end if;
 if req.maker_id=auth.uid() then raise exception 'Rollback maker cannot approve own request'; end if;
 -- Parent locks also prevent new FK-linked activity while eligibility is checked.
 perform 1 from public.students where id=r.target_student_id for update;
 perform 1 from public.enrollments where student_id=r.target_student_id for update;
 perform 1 from public.student_curriculum_enrollments where student_id=r.target_student_id for update;
 perform 1 from public.student_level_progress l join public.student_curriculum_enrollments a on a.id=l.enrollment_id where a.student_id=r.target_student_id for update of l;
 perform 1 from public.student_subject_progress s join public.student_level_progress l on l.id=s.level_progress_id join public.student_curriculum_enrollments a on a.id=l.enrollment_id where a.student_id=r.target_student_id for update of s;
 perform 1 from public.student_component_progress c join public.student_subject_progress s on s.id=c.subject_progress_id join public.student_level_progress l on l.id=s.level_progress_id join public.student_curriculum_enrollments a on a.id=l.enrollment_id where a.student_id=r.target_student_id for update of c;
 perform 1 from public.enrollment_tuition where enrollment_id=r.target_enrollment_id for update;
 perform 1 from public.enrollment_pauses where enrollment_id=r.target_enrollment_id for update;
 eligible:=r.business_snapshot is not null and r.business_snapshot=public.legacy_business_snapshot(p_row)
  and not exists(select 1 from public.attendance_records where enrollment_id=r.target_enrollment_id)
  and not exists(select 1 from public.session_occurrence_participants where enrollment_id=r.target_enrollment_id)
  and not exists(select 1 from public.learning_reports where student_id=r.target_student_id)
  and not exists(select 1 from public.lesson_feedback where student_id=r.target_student_id)
  and not exists(select 1 from public.invoices where student_id_snapshot=r.target_student_id)
  and not exists(select 1 from public.payments where student_id_snapshot=r.target_student_id)
  and not exists(select 1 from public.tuition_reminders where enrollment_tuition_id=r.target_tuition_id);
 if not eligible then
  update public.migration_rollback_requests set status='BLOCKED',checker_id=auth.uid(),checked_at=now() where row_id=p_row;
  insert into public.migration_audit_events(row_id,batch_id,actor_id,action,reason) values(p_row,b.id,auth.uid(),'ROLLBACK_BLOCKED','Business data changed or downstream activity exists; correction required');
  return 'BLOCKED';
 end if;
 insert into public.opening_reversals(receivable_id,rollback_row_id,reversed_amount,reversed_settlement)
 select o.id,p_row,o.amount,coalesce(s.amount,0) from public.opening_receivables o left join public.opening_settlements s on s.receivable_id=o.id where o.migration_row_id=p_row;
 update public.enrollment_tuition set status='CANCELLED' where id=r.target_tuition_id;
 update public.enrollments set status='WITHDRAWN' where id=r.target_enrollment_id;
 update public.student_curriculum_enrollments set status='WITHDRAWN' where student_id=r.target_student_id;
 update public.students set status='ARCHIVED' where id=r.target_student_id;
 update public.migration_batch_rows set status='ROLLED_BACK' where target_enrollment_id=r.target_enrollment_id;
 update public.migration_source_mappings set status='ROLLED_BACK' where row_id=p_row;
 update public.migration_rollback_requests set status='COMPLETED',checker_id=auth.uid(),checked_at=now() where row_id=p_row;
 insert into public.migration_audit_events(row_id,batch_id,actor_id,action,reason) values(p_row,b.id,auth.uid(),'ROLLBACK_APPROVED',p_reason);
 return 'COMPLETED';
end $$;

create function public.sign_off_legacy_batch(p_batch uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.migration_batches%rowtype;
begin
 select * into b from public.migration_batches where id=p_batch for update;
 if b.id is null or not public.has_role('SUPER_ADMIN') or not public.has_permission('migration.sign_off_final',b.branch_id) then raise exception 'Unauthorized'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Sign-off reason required'; end if;
 perform 1 from public.migration_batch_rows where batch_id=p_batch for update;
 if not exists(select 1 from public.migration_batch_rows where batch_id=p_batch and status='IMPORTED')
  or exists(select 1 from public.migration_batch_rows where batch_id=p_batch and status not in ('IMPORTED','REJECTED'))
  or exists(select 1 from public.migration_rollback_requests q join public.migration_batch_rows r on r.id=q.row_id where r.batch_id=p_batch and q.status='REQUESTED')
  or exists(select 1 from public.migration_reconciliation where batch_id=p_batch and status='IMPORTED' and (amount_difference is distinct from 0 or paid_difference is distinct from 0 or outstanding_difference is distinct from 0)) then raise exception 'Exact reconciliation and completed review required'; end if;
 update public.migration_batches set signed_off_by=auth.uid(),signed_off_at=now() where id=p_batch and signed_off_at is null;
 insert into public.migration_audit_events(batch_id,actor_id,action,reason) values(p_batch,auth.uid(),'SIGN_OFF',p_reason);
end $$;
revoke all on function public.rollback_legacy_row(uuid,boolean,text),public.sign_off_legacy_batch(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rollback_legacy_row(uuid,boolean,text),public.sign_off_legacy_batch(uuid,text) to authenticated;

create function public.record_legacy_import_failure(p_row uuid,p_version integer,p_code text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.migration_batch_rows%rowtype; b public.migration_batches%rowtype; safe_code text;
begin
 select * into r from public.migration_batch_rows where id=p_row for update;
 select * into b from public.migration_batches where id=r.batch_id;
 if b.id is null or not public.has_role('SUPER_ADMIN') or not public.has_permission('migration.import',b.branch_id) then raise exception 'Unauthorized'; end if;
 if r.status<>'READY' or p_version is null or r.version<>p_version then return; end if;
 safe_code:=case when p_code ~ '^[A-Z0-9]{5,20}$' then p_code else 'UNCONFIRMED' end;
 update public.migration_batch_rows set last_import_error=safe_code where id=p_row;
 insert into public.migration_audit_events(row_id,batch_id,actor_id,action,reason,row_version) values(p_row,b.id,auth.uid(),'IMPORT_FAILED',safe_code,p_version);
end $$;
revoke all on function public.record_legacy_import_failure(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.record_legacy_import_failure(uuid,integer,text) to authenticated;

create function public.validate_legacy_batch(p_batch uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.migration_batches%rowtype; r public.migration_batch_rows%rowtype; errors jsonb; checked integer:=0;
begin
 select * into b from public.migration_batches where id=p_batch for update;
 if b.id is null or not public.has_permission('migration.validate',b.branch_id) then raise exception 'Unauthorized'; end if;
 if b.signed_off_at is not null then raise exception 'Signed-off batch is immutable'; end if;
 for r in select * from public.migration_batch_rows where batch_id=p_batch and status in ('NEEDS_REVIEW','VALIDATED','READY') order by row_number for update loop
  errors:=public.legacy_row_errors(r.id);
  update public.migration_batch_rows set validation_result=errors,
   status=case when errors<>'[]' then 'NEEDS_REVIEW' when identity_reviewed_by is not null and academic_reviewed_by is not null and finance_reviewed_by is not null then 'READY' else 'VALIDATED' end,
   identity_reviewed_by=case when errors='[]' then identity_reviewed_by end,
   academic_reviewed_by=case when errors='[]' then academic_reviewed_by end,
   finance_reviewed_by=case when errors='[]' then finance_reviewed_by end where id=r.id;
  checked:=checked+1;
 end loop;
 insert into public.migration_audit_events(batch_id,actor_id,action,reason) values(p_batch,auth.uid(),'VALIDATE_BATCH','Dry run; no business writes');
 return checked;
end $$;
revoke all on function public.validate_legacy_batch(uuid) from public,anon,authenticated,service_role;
grant execute on function public.validate_legacy_batch(uuid) to authenticated;
create view public.migration_batch_counts with(security_invoker=true) as
select batch_id,status,count(*) as row_count,count(*) filter(where last_import_error is not null) as failed_attempt_rows
from public.migration_batch_rows group by batch_id,status;
revoke all on public.migration_batch_counts from public,anon,authenticated,service_role;
grant select on public.migration_batch_counts to authenticated;

create function public.normalize_legacy_payload(p_payload jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select jsonb_object_agg(key,case when key='full_name' then regexp_replace(btrim(normalize(value)),'[[:space:]]+',' ','g') else btrim(normalize(value)) end)
 from jsonb_each_text(p_payload)
$$;
revoke all on function public.normalize_legacy_payload(jsonb) from public,anon,authenticated,service_role;

create view public.opening_receivable_directory with(security_invoker=true) as
select b.*,s.full_name,s.student_code from public.opening_receivable_balances b join public.students s on s.id=b.student_id;
revoke all on public.opening_receivable_directory from public,anon,authenticated,service_role;
grant select on public.opening_receivable_directory to authenticated;

-- Opening debt participates in balances, never invoice counts, billed revenue or cash.
create or replace view public.standard_branch_finance_summary
with (
  security_invoker = true
)
as

with receivables as (
  select
    receivable.branch_id_snapshot
      as branch_id,

    receivable.branch_code_snapshot
      as branch_code,

    receivable.branch_name_snapshot
      as branch_name,

    receivable.currency,

    count(*) filter (
      where receivable.invoice_status =
        'ISSUED'
    ) as issued_invoice_count,

    count(*) filter (
      where receivable.receivable_status =
        'OVERDUE'
    ) as overdue_invoice_count,

    coalesce(
      sum(
        receivable.total_amount
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as billed_amount,

    coalesce(
      sum(
        receivable.allocated_amount
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as applied_payment_amount,

    coalesce(
      sum(
        receivable.outstanding_balance
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as outstanding_amount,

    coalesce(
      sum(
        receivable.outstanding_balance
      ) filter (
        where receivable.receivable_status =
          'OVERDUE'
      ),
      0
    )::numeric(14,2)
      as overdue_amount

  from public.invoice_receivables
  as receivable

  group by
    receivable.branch_id_snapshot,
    receivable.branch_code_snapshot,
    receivable.branch_name_snapshot,
    receivable.currency
),

cash as (
  select
    ledger.branch_id,

    ledger.branch_code,

    ledger.branch_name,

    ledger.currency,

    coalesce(
      sum(
        ledger.cash_in
      ),
      0
    )::numeric(14,2)
      as cash_received,

    coalesce(
      sum(
        ledger.cash_out
      ),
      0
    )::numeric(14,2)
      as cash_refunded,

    coalesce(
      sum(
        ledger.net_cash
      ),
      0
    )::numeric(14,2)
      as net_cash

  from public.finance_cash_ledger
  as ledger

  group by
    ledger.branch_id,
    ledger.branch_code,
    ledger.branch_name,
    ledger.currency
)

select
  coalesce(
    receivables.branch_id,
    cash.branch_id
  ) as branch_id,

  coalesce(
    receivables.branch_code,
    cash.branch_code
  ) as branch_code,

  coalesce(
    receivables.branch_name,
    cash.branch_name
  ) as branch_name,

  coalesce(
    receivables.currency,
    cash.currency
  ) as currency,

  coalesce(
    receivables.issued_invoice_count,
    0
  ) as issued_invoice_count,

  coalesce(
    receivables.overdue_invoice_count,
    0
  ) as overdue_invoice_count,

  coalesce(
    receivables.billed_amount,
    0
  )::numeric(14,2)
    as billed_amount,

  coalesce(
    receivables.applied_payment_amount,
    0
  )::numeric(14,2)
    as applied_payment_amount,

  coalesce(
    receivables.outstanding_amount,
    0
  )::numeric(14,2)
    as outstanding_amount,

  coalesce(
    receivables.overdue_amount,
    0
  )::numeric(14,2)
    as overdue_amount,

  coalesce(
    cash.cash_received,
    0
  )::numeric(14,2)
    as cash_received,

  coalesce(
    cash.cash_refunded,
    0
  )::numeric(14,2)
    as cash_refunded,

  coalesce(
    cash.net_cash,
    0
  )::numeric(14,2)
    as net_cash

from receivables

full outer join cash
  on cash.branch_id =
    receivables.branch_id

  and cash.currency =
    receivables.currency;
create or replace view public.branch_finance_summary with(security_invoker=true) as
select branch_id,branch_code,branch_name,currency,sum(issued_invoice_count)::bigint as issued_invoice_count,sum(overdue_invoice_count)::bigint as overdue_invoice_count,sum(billed_amount)::numeric(14,2) as billed_amount,sum(applied_payment_amount)::numeric(14,2) as applied_payment_amount,sum(outstanding_amount)::numeric(14,2) as outstanding_amount,sum(overdue_amount)::numeric(14,2) as overdue_amount,sum(cash_received)::numeric(14,2) as cash_received,sum(cash_refunded)::numeric(14,2) as cash_refunded,sum(net_cash)::numeric(14,2) as net_cash
from (select * from public.standard_branch_finance_summary union all select o.branch_id,b.code,b.name,o.currency,0::bigint,0::bigint,0::numeric(14,2),0::numeric(14,2),o.outstanding_balance,0::numeric(14,2),0::numeric(14,2),0::numeric(14,2),0::numeric(14,2) from public.opening_receivable_balances o join public.branches b on b.id=o.branch_id where not o.reversed) combined
group by branch_id,branch_code,branch_name,currency;
revoke all on public.standard_branch_finance_summary from public,anon,authenticated,service_role; grant select on public.standard_branch_finance_summary to authenticated;
create or replace view public.invoice_only_student_receivable_summary
with (
  security_invoker = true
)
as
select
  receivable.student_id_snapshot
    as student_id,

  receivable.currency,

  count(*) filter (
    where receivable.invoice_status =
      'ISSUED'
  ) as issued_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'UNPAID'
  ) as unpaid_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'PARTIALLY_PAID'
  ) as partially_paid_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'OVERDUE'
  ) as overdue_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'PAID'
  ) as paid_invoice_count,

  coalesce(
    sum(
      receivable.total_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_invoiced,

  coalesce(
    sum(
      receivable.allocated_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_paid,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_outstanding,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.receivable_status =
        'OVERDUE'
    ),
    0
  )::numeric(14,2)
    as total_overdue

from public.invoice_receivables
as receivable

group by
  receivable.student_id_snapshot,
  receivable.currency;
create or replace view public.student_receivable_summary with(security_invoker=true) as
select student_id,currency,sum(issued_invoice_count)::bigint as issued_invoice_count,sum(unpaid_invoice_count)::bigint as unpaid_invoice_count,sum(partially_paid_invoice_count)::bigint as partially_paid_invoice_count,sum(overdue_invoice_count)::bigint as overdue_invoice_count,sum(paid_invoice_count)::bigint as paid_invoice_count,sum(total_invoiced)::numeric(14,2) as total_invoiced,sum(total_paid)::numeric(14,2) as total_paid,sum(total_outstanding)::numeric(14,2) as total_outstanding,sum(total_overdue)::numeric(14,2) as total_overdue
from (select * from public.invoice_only_student_receivable_summary union all select o.student_id,o.currency,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::numeric(14,2),0::numeric(14,2),o.outstanding_balance,0::numeric(14,2) from public.opening_receivable_balances o where not o.reversed) combined
group by student_id,currency;
revoke all on public.invoice_only_student_receivable_summary from public,anon,authenticated,service_role; grant select on public.invoice_only_student_receivable_summary to authenticated;
create or replace view public.invoice_only_branch_receivable_summary
with (
  security_invoker = true
)
as
select
  receivable.branch_id_snapshot
    as branch_id,

  receivable.branch_code_snapshot
    as branch_code,

  receivable.branch_name_snapshot
    as branch_name,

  receivable.currency,

  count(*) filter (
    where receivable.invoice_status =
      'ISSUED'
  ) as issued_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'OVERDUE'
  ) as overdue_invoice_count,

  coalesce(
    sum(
      receivable.total_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_invoiced,

  coalesce(
    sum(
      receivable.allocated_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_paid,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_outstanding,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.receivable_status =
        'OVERDUE'
    ),
    0
  )::numeric(14,2)
    as total_overdue

from public.invoice_receivables
as receivable

group by
  receivable.branch_id_snapshot,
  receivable.branch_code_snapshot,
  receivable.branch_name_snapshot,
  receivable.currency;
create or replace view public.branch_receivable_summary with(security_invoker=true) as
select branch_id,branch_code,branch_name,currency,sum(issued_invoice_count)::bigint as issued_invoice_count,sum(overdue_invoice_count)::bigint as overdue_invoice_count,sum(total_invoiced)::numeric(14,2) as total_invoiced,sum(total_paid)::numeric(14,2) as total_paid,sum(total_outstanding)::numeric(14,2) as total_outstanding,sum(total_overdue)::numeric(14,2) as total_overdue
from (select * from public.invoice_only_branch_receivable_summary union all select o.branch_id,b.code,b.name,o.currency,0::bigint,0::bigint,0::numeric(14,2),0::numeric(14,2),o.outstanding_balance,0::numeric(14,2) from public.opening_receivable_balances o join public.branches b on b.id=o.branch_id where not o.reversed) combined
group by branch_id,branch_code,branch_name,currency;
revoke all on public.invoice_only_branch_receivable_summary from public,anon,authenticated,service_role; grant select on public.invoice_only_branch_receivable_summary to authenticated;

-- Duplicate categories are evidence for review, never an automatic merge decision.
create view public.migration_row_preview with(security_invoker=true) as
select r.id as row_id,r.batch_id,r.status,
 case when exists(select 1 from public.migration_source_mappings m where m.source_system=b.source_system and m.source_entity_type=r.source_entity_type and m.source_reference=r.source_reference) then 'EXACT_MATCH'
 when exists(select 1 from public.students s where s.student_code=r.normalized_payload->>'student_code') then 'STRONG_MATCH'
 when exists(select 1 from public.students s where lower(btrim(s.full_name))=lower(btrim(r.normalized_payload->>'full_name'))) then 'POSSIBLE_DUPLICATE'
 else 'NO_MATCH' end as duplicate_status,
 r.normalized_payload->>'currency' as currency,
 case when r.status in ('VALIDATED','READY') and r.validation_result='[]' and not exists(select 1 from public.migration_source_mappings m where m.source_system=b.source_system and m.source_entity_type=r.source_entity_type and m.source_reference=r.source_reference) then 1 else 0 end as expected_new_units,
 case when r.status in ('VALIDATED','READY') and r.validation_result='[]' then (r.normalized_payload->>'final_amount')::numeric end as expected_amount,
 case when r.status in ('VALIDATED','READY') and r.validation_result='[]' then (r.normalized_payload->>'opening_paid_amount')::numeric end as expected_paid,
 case when r.status in ('VALIDATED','READY') and r.validation_result='[]' then (r.normalized_payload->>'opening_outstanding')::numeric end as expected_outstanding
from public.migration_batch_rows r join public.migration_batches b on b.id=r.batch_id;
create view public.migration_dry_run_summary with(security_invoker=true) as
select batch_id,currency,sum(expected_new_units)::bigint as expected_students,
 sum(expected_new_units)::bigint as expected_enrollments,sum(expected_new_units)::bigint as expected_academic_baselines,
 sum(expected_new_units)::bigint as expected_tuition_terms,
 coalesce(sum(expected_amount) filter(where expected_new_units=1),0)::numeric as expected_new_amount,
 coalesce(sum(expected_paid) filter(where expected_new_units=1),0)::numeric as expected_new_paid,
 coalesce(sum(expected_outstanding) filter(where expected_new_units=1),0)::numeric as expected_new_outstanding,
 count(*) filter(where duplicate_status='EXACT_MATCH') as exact_matches,
 count(*) filter(where duplicate_status='STRONG_MATCH') as strong_matches,
 count(*) filter(where duplicate_status='POSSIBLE_DUPLICATE') as possible_duplicates
from public.migration_row_preview group by batch_id,currency;
revoke all on public.migration_row_preview,public.migration_dry_run_summary from public,anon,authenticated,service_role;
grant select on public.migration_row_preview,public.migration_dry_run_summary to authenticated;
