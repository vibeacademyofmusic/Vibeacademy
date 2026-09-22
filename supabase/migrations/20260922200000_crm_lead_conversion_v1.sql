-- Sprint 3 conversion review. Links an existing student. Does not create identity or enrollment.

insert into public.permissions(code, name, module)
values ('crm.lead.convert', 'Link a won CRM lead to an existing student after review', 'crm')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'crm.lead.convert'
where r.code = 'BRANCH_ADMIN'
on conflict do nothing;

alter table public.crm_lead_events drop constraint crm_lead_events_event_type_check;
alter table public.crm_lead_events add constraint crm_lead_events_event_type_check check (event_type in (
  'CREATED', 'UPDATED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED',
  'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATION_UPDATED', 'WON', 'LOST',
  'NOTE_ADDED', 'FOLLOW_UP_SET', 'CONVERSION_REVIEWED', 'CONVERTED'
));

create table public.crm_lead_conversion_reviews (
  id uuid primary key,
  lead_id uuid not null references public.crm_leads(id),
  decision text not null check (decision in ('PENDING', 'LINKED', 'BLOCKED')),
  student_id uuid references public.students(id),
  parent_id uuid references public.parents(id),
  note text check (note is null or char_length(note) between 1 and 4000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  check (decision <> 'LINKED' or student_id is not null),
  check (decision = 'LINKED' or (student_id is null and parent_id is null))
);

create index crm_lead_conversion_reviews_lead_idx on public.crm_lead_conversion_reviews(lead_id, created_at desc);

create function public.guard_crm_conversion_review() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' and coalesce(current_setting('crm.lead_write', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'CRM_LEAD_DIRECT_WRITE_DENIED';
  end if;
  raise exception 'CRM_LEAD_REVIEW_IMMUTABLE';
end $$;

create trigger crm_lead_conversion_reviews_guard
before insert or update or delete on public.crm_lead_conversion_reviews
for each row execute function public.guard_crm_conversion_review();

alter table public.crm_lead_conversion_reviews enable row level security;

create policy crm_lead_conversion_reviews_select on public.crm_lead_conversion_reviews
for select to authenticated
using (
  exists (
    select 1 from public.crm_leads lead
    where lead.id = crm_lead_conversion_reviews.lead_id
      and public.crm_can('crm.view', lead.branch_id)
  )
);

revoke all on public.crm_lead_conversion_reviews from public, anon, authenticated, service_role;
grant select on public.crm_lead_conversion_reviews to authenticated;

create function public.crm_lead_match_candidates(p_lead uuid)
returns table (student_id uuid, full_name text, date_of_birth date, student_code text, default_branch_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  lead public.crm_leads%rowtype;
  wanted text;
begin
  select * into lead from public.crm_leads where id = p_lead;
  if not found then
    return;
  end if;
  perform public.crm_actor('crm.view', lead.branch_id);
  wanted := nullif(lower(btrim(coalesce(lead.student_name, lead.full_name, ''))), '');
  if wanted is null or lead.student_date_of_birth is null then
    return;
  end if;
  return query
  select student.id, student.full_name, student.date_of_birth, student.student_code, student.default_branch_id
  from public.students student
  where student.date_of_birth = lead.student_date_of_birth
    and lower(btrim(coalesce(student.full_name, ''))) = wanted
  order by student.student_code
  limit 20;
end $$;

create function public.review_crm_lead_conversion(
  p_request uuid,
  p_lead uuid,
  p_version integer,
  p_decision text,
  p_student uuid,
  p_parent uuid,
  p_note text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  actor uuid := auth.uid();
  decision text := nullif(upper(btrim(coalesce(p_decision, ''))), '');
  note text := public.crm_text(p_note, 4000);
  row public.crm_leads%rowtype;
  student public.students%rowtype;
  wanted text;
  event_type text;
  meta jsonb;
begin
  if actor is null or not coalesce(public.account_is_active(), false) then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if p_request is null or decision is null or decision not in ('PENDING', 'LINKED', 'BLOCKED') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if decision = 'LINKED' and p_student is null then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if decision <> 'LINKED' and (p_student is not null or p_parent is not null or note is null) then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if p_parent is not null and not exists(select 1 from public.parents where id = p_parent and status = 'ACTIVE') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  event_type := case when decision = 'LINKED' then 'CONVERTED' else 'CONVERSION_REVIEWED' end;
  meta := jsonb_build_object('decision', decision, 'student_id', p_student, 'parent_id', p_parent);
  if public.crm_lead_replay(p_request, p_lead, event_type, actor, note, null, meta, 'crm.lead.convert') then
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.convert');
  if row.status <> 'WON' then
    raise exception 'CRM_LEAD_TRANSITION_DENIED';
  end if;
  if row.converted_at is not null then
    if decision = 'LINKED' and row.converted_student_id = p_student and row.converted_parent_id is not distinct from p_parent then
      return row.id;
    end if;
    raise exception 'CRM_LEAD_ALREADY_CONVERTED';
  end if;
  if decision = 'LINKED' then
    select * into student from public.students where id = p_student;
    if not found then
      raise exception 'CRM_LEAD_INVALID';
    end if;
    wanted := nullif(lower(btrim(coalesce(row.student_name, row.full_name, ''))), '');
    if wanted is not null and row.student_date_of_birth is not null
       and (student.date_of_birth is distinct from row.student_date_of_birth
            or lower(btrim(coalesce(student.full_name, ''))) is distinct from wanted)
    then
      raise exception 'CRM_LEAD_MATCH_REJECTED';
    end if;
    if (wanted is null or row.student_date_of_birth is null) and note is null then
      raise exception 'CRM_LEAD_REVIEW_REQUIRED';
    end if;
  end if;
  perform set_config('crm.lead_write', 'on', true);
  if decision = 'LINKED' then
    update public.crm_leads set
      converted_student_id = p_student,
      converted_parent_id = p_parent,
      converted_at = clock_timestamp(),
      version = version + 1,
      updated_at = clock_timestamp()
    where id = row.id;
    if p_parent is not null then
      insert into public.student_parents(student_id, parent_id, relationship, is_primary)
      values (p_student, p_parent, 'GUARDIAN', true)
      on conflict (student_id, parent_id) do nothing;
    end if;
  else
    update public.crm_leads set
      version = version + 1,
      updated_at = clock_timestamp()
    where id = row.id;
  end if;
  insert into public.crm_lead_conversion_reviews(id, lead_id, decision, student_id, parent_id, note, actor_id)
  values (p_request, row.id, decision, case when decision = 'LINKED' then p_student end, case when decision = 'LINKED' then p_parent end, note, actor);
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, note, metadata)
  values (p_request, row.id, event_type, row.status, row.status, actor, note, meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
exception
  when unique_violation then
    raise exception 'CRM_LEAD_REQUEST_MISMATCH';
end $$;

revoke all on function
  public.crm_lead_match_candidates(uuid),
  public.review_crm_lead_conversion(uuid, uuid, integer, text, uuid, uuid, text),
  public.guard_crm_conversion_review()
from public, anon, authenticated, service_role;

grant execute on function public.crm_lead_match_candidates(uuid) to authenticated;
grant execute on function public.review_crm_lead_conversion(uuid, uuid, integer, text, uuid, uuid, text) to authenticated;
