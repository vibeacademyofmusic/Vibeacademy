-- Operational program selection is a database rule, not a page filter.
-- Historical catalogs remain in curriculums and stay addressable by id.

create or replace function public.curriculum_is_operational(p_code text, p_status text)
returns boolean
language sql
immutable
as $$
  select p_status = 'ACTIVE'
    and p_code in ('PIANO', 'GUITAR', 'VIOLIN', 'DRUMS');
$$;

comment on function public.curriculum_is_operational(text, text) is
  'Exactly four operational programs: Piano, Guitar, Violin, and Trống.';

create or replace view public.operational_curriculums
with (security_invoker = true) as
select *
from public.curriculums
where public.curriculum_is_operational(code, status);

grant select on public.operational_curriculums to authenticated, service_role;
