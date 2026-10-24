begin;

create extension if not exists pgtap
with schema extensions;

select no_plan();

select ok(
  to_regclass(
    'public.attendance_qr_sessions'
  ) is not null,
  'QR sessions table exists'
);

select ok(
  to_regclass(
    'public.attendance_qr_tokens'
  ) is not null,
  'QR tokens table exists'
);

select ok(
  to_regclass(
    'public.employee_attendance_scan_events'
  ) is not null,
  'QR scan events table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.attendance_qr_sessions'::regclass
  ),
  'QR sessions RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.attendance_qr_tokens'::regclass
  ),
  'QR tokens RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.employee_attendance_scan_events'::regclass
  ),
  'QR scan events RLS enabled'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.attendance_qr_sessions',
    'SELECT'
  ),
  'Authenticated cannot directly inspect QR sessions'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.attendance_qr_tokens',
    'SELECT'
  ),
  'Authenticated cannot directly inspect QR bearer hashes'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.employee_attendance_scan_events',
    'INSERT,UPDATE,DELETE'
  ),
  'Authenticated cannot forge QR scan evidence'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.employee_attendance_scan_events',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'Anonymous has no QR scan table access'
);

select ok(
  to_regprocedure(
    'public.scan_employee_attendance_qr(text)'
  ) is not null,
  'QR scan RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.scan_employee_attendance_qr(text)',
    'EXECUTE'
  ),
  'Authenticated may invoke QR scan RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.scan_employee_attendance_qr(text)',
    'EXECUTE'
  ),
  'Anonymous cannot invoke QR scan RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.start_attendance_qr_session(uuid)',
    'EXECUTE'
  ),
  'Authenticated may call QR start RPC; DB authorization decides scope'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.start_attendance_qr_session(uuid)',
    'EXECUTE'
  ),
  'Anonymous cannot start QR sessions'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_attendance_qr_manageable_branches',
        'start_attendance_qr_session',
        'mint_attendance_qr_token',
        'stop_attendance_qr_session',
        'scan_employee_attendance_qr',
        'get_attendance_qr_status',
        'get_attendance_qr_recent_scans',
        'get_my_attendance_today',
        'guard_attendance_qr_scan_immutable'
      )
      and p.prosecdef
      and not coalesce(
        p.proconfig
          @> array[
            'search_path=public, pg_temp'
          ],
        false
      )
  ),
  0::bigint,
  'Every QR SECURITY DEFINER uses trusted search_path'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname =
        'scan_employee_attendance_qr'
  ),
  'p_token text',
  'QR scan accepts token only; employee id cannot be forged'
);

select ok(
  pg_get_functiondef(
    'public.mint_attendance_qr_token(uuid)'::regprocedure
  )
  like '%interval ''60 seconds''%',
  'QR token TTL is 60 seconds'
);

select ok(
  pg_get_functiondef(
    'public.employee_schedule(uuid,date,date)'::regprocedure
  )
  ~ 'profile_id[ ]*=[ ]*auth\.uid\(\)',
  'Employee schedule permits only own employee identity outside SUPER_ADMIN'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname =
        'attendance_qr_shift_event_once'
  ),
  'One QR event type per employee shift'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.employee_attendance_scan_events'::regclass
      and tgname =
        'attendance_qr_scan_no_update'
      and not tgisinternal
  ),
  'QR scan UPDATE immutability trigger exists'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.employee_attendance_scan_events'::regclass
      and tgname =
        'attendance_qr_scan_no_delete'
      and not tgisinternal
  ),
  'QR scan DELETE immutability trigger exists'
);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '',
  true
);

select throws_ok(
  $$select public.scan_employee_attendance_qr(
    repeat('a',64)
  )$$,
  'P0001',
  'QR_ATTENDANCE_LOGIN_REQUIRED',
  'QR scan requires authenticated account'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '',
  true
);

select * from finish();

rollback;
