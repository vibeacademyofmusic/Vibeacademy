-- Ensure the Can Tho branch exists before branch-specific tuition pricing.
-- This migration is intentionally idempotent so it is safe on
-- fresh local resets and on environments where the branch already exists.

do $$
begin
  if exists (
    select 1
    from public.branches
    where code in ('V01', 'CT01')
      and name = 'Vibe Academy Cần Thơ'
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.branches
    where code in ('V01', 'CT01')
  ) then
    raise exception
      'Branch code V01/CT01 already exists but is not Vibe Academy Cần Thơ.';
  end if;

  insert into public.branches (
    code,
    name,
    timezone,
    status
  )
  values (
    'V01',
    'Vibe Academy Cần Thơ',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  );
end;
$$;
