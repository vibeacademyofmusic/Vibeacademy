-- Tuition Zalo consent stays one row per student and parent.
-- A grant for one student does not cover another student of the same parent or phone.
-- Registration phone consent is not read or written here.
-- Recording requires an explicit confirmation in the same call. Existing grants are not copied.

alter table public.tuition_zalo_consents
  add column consent_scope text not null default 'ONE_STUDENT',
  add column source text,
  add column recorded_by uuid references auth.users(id);

alter table public.tuition_zalo_consents
  drop constraint if exists tuition_zalo_consents_scope_check,
  add constraint tuition_zalo_consents_scope_check
    check (consent_scope = 'ONE_STUDENT'),
  drop constraint if exists tuition_zalo_consents_source_check,
  add constraint tuition_zalo_consents_source_check
    check (source is null or source in (
      'TUITION_NOTICE_IN_PERSON',
      'TUITION_NOTICE_PHONE',
      'TUITION_NOTICE_WRITTEN'
    ));

create or replace function public.record_tuition_zalo_notice_consent(
  p_student uuid,
  p_parent uuid,
  p_confirmed boolean,
  p_source text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  if p_confirmed is distinct from true then
    raise exception 'Tuition notice consent must be confirmed';
  end if;
  if p_source is null or p_source not in (
    'TUITION_NOTICE_IN_PERSON',
    'TUITION_NOTICE_PHONE',
    'TUITION_NOTICE_WRITTEN'
  ) then
    raise exception 'Invalid tuition notice consent source';
  end if;
  if not exists (
    select 1
    from public.student_parents link
    join public.parents parent on parent.id = link.parent_id and parent.status = 'ACTIVE'
    join public.students student on student.id = link.student_id and student.status = 'ACTIVE'
    where link.student_id = p_student
      and link.parent_id = p_parent
      and link.can_view_finance
      and link.is_active
      and (link.valid_from is null or link.valid_from <= clock_timestamp())
      and (link.valid_until is null or link.valid_until > clock_timestamp())
  ) then
    raise exception 'Tuition recipient not found';
  end if;
  if exists (
    select 1 from public.tuition_zalo_consents consent
    where consent.student_id = p_student
      and consent.parent_id = p_parent
      and consent.revoked_at is null
  ) then
    return 'already_recorded';
  end if;
  insert into public.tuition_zalo_consents (
    student_id, parent_id, granted_at, revoked_at, consent_scope, source, recorded_by
  ) values (
    p_student, p_parent, clock_timestamp(), null, 'ONE_STUDENT', p_source, auth.uid()
  )
  on conflict (student_id, parent_id) do update
    set granted_at = excluded.granted_at,
        revoked_at = null,
        consent_scope = 'ONE_STUDENT',
        source = excluded.source,
        recorded_by = excluded.recorded_by
    where public.tuition_zalo_consents.revoked_at is not null;
  return 'recorded';
end $$;

revoke all on function public.record_tuition_zalo_notice_consent(uuid, uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.record_tuition_zalo_notice_consent(uuid, uuid, boolean, text) to authenticated;
