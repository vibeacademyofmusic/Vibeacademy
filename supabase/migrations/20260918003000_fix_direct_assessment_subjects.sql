-- The supplied IDs are NOT seeded/stable IDs. Do not fall back to name-only matching.
-- Before deployment, verify curriculum code + level code + subject code + subject name
-- in the target environment. Replace this guarded mapping with those verified business
-- keys if IDs differ. This migration never inserts subjects or components.
-- A clean reset has no curriculum seed data, so missing targets are an explicit no-op.
do $$
declare
  target record;
  actual public.curriculum_subjects%rowtype;
begin
  for target in select * from (values
    ('aa9eb2eb-e204-44f5-8b50-b50c9926f185'::uuid, 'Adventure Level 2B'::text),
    ('68f31cf3-f042-4bb8-8c33-c6066d2b94e3'::uuid, 'Music Theory Kid1'::text)
  ) as targets(id, name)
  loop
    if exists (
      select 1 from public.curriculum_subjects s
      where s.name = target.name and s.id <> target.id
    ) then
      raise exception 'Direct assessment migration: ambiguous or different ID for %. Verify curriculum/level/subject codes before deployment.', target.name;
    end if;

    select * into actual from public.curriculum_subjects where id = target.id for update;
    if not found then
      raise notice 'Direct assessment target absent: % (%). No data corrected for this target.', target.name, target.id;
      continue;
    end if;
    if actual.name is distinct from target.name or not actual.is_required
       or actual.completion_rule not in ('ALL_REQUIRED_COMPONENTS', 'DIRECT_ASSESSMENT') then
      raise exception 'Direct assessment migration: unexpected configuration for % (%). Verify target scope.', target.name, target.id;
    end if;

    update public.curriculum_subjects
    set completion_rule = 'DIRECT_ASSESSMENT', updated_at = now()
    where id = target.id and completion_rule = 'ALL_REQUIRED_COMPONENTS';
  end loop;
end;
$$;
