-- Phase 1: admin-authored learning notes attached to validated attendance.
-- These observations do not award grades or change academic progress.
create table public.learning_journals (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null unique
    references public.attendance_records(id) on delete restrict,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  repertoire text not null default '' check (char_length(repertoire) <= 2000),
  skills text not null default '' check (char_length(skills) <= 2000),
  homework text not null default '' check (char_length(homework) <= 4000),
  notes text not null default '' check (char_length(notes) <= 4000),
  observation text not null default 'NOT_RECORDED'
    check (observation in ('NOT_RECORDED', 'PRACTICING', 'NEEDS_REVIEW', 'ACHIEVED')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.stamp_learning_journal()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.attendance_record_id is distinct from old.attendance_record_id then
      raise exception 'Journal attendance cannot be changed';
    end if;
    new.created_at := old.created_at;
    -- Keep attribution on edits; allow FK cleanup when a user is deleted.
    if new.created_by is not null then new.created_by := old.created_by; end if;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_stamp_learning_journal
before insert or update on public.learning_journals
for each row execute function public.stamp_learning_journal();

alter table public.learning_journals enable row level security;
revoke all on public.learning_journals from anon, authenticated;
grant select on public.learning_journals to authenticated;
grant insert (attendance_record_id, content, repertoire, skills, homework, notes, observation)
  on public.learning_journals to authenticated;
grant update (content, repertoire, skills, homework, notes, observation)
  on public.learning_journals to authenticated;
create policy super_admin_read_journals on public.learning_journals
for select to authenticated using (public.has_role('SUPER_ADMIN'));
create policy super_admin_insert_journals on public.learning_journals
for insert to authenticated with check (public.has_role('SUPER_ADMIN'));
create policy super_admin_update_journals on public.learning_journals
for update to authenticated using (public.has_role('SUPER_ADMIN'))
with check (public.has_role('SUPER_ADMIN'));
