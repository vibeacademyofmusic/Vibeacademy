begin;

create extension if not exists pgtap
with schema extensions;

select no_plan();

select ok(
  to_regclass(
    'public.employee_attendance_qr_verifications'
  ) is not null,
  'QR verification relation exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid=
      'public.employee_attendance_qr_verifications'::regclass
  ),
  'QR verification RLS enabled'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.employee_attendance_qr_verifications',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'Authenticated cannot forge QR verification'
);

select ok(
  to_regprocedure(
    'public.materialize_qr_attendance()'
  ) is not null,
  'QR materialization trigger function exists'
);

select ok(
  exists(
    select 1
    from pg_trigger
    where tgrelid=
      'public.employee_attendance_scan_events'::regclass
      and tgname=
        'attendance_qr_materialize_checkout'
      and not tgisinternal
  ),
  'CHECK_OUT materialization trigger exists'
);

select ok(
  exists(
    select 1
    from pg_trigger
    where tgrelid=
      'public.employee_attendance_qr_verifications'::regclass
      and tgname=
        'attendance_qr_verification_no_update'
      and not tgisinternal
  ),
  'QR verification UPDATE blocked'
);

select ok(
  exists(
    select 1
    from pg_trigger
    where tgrelid=
      'public.employee_attendance_qr_verifications'::regclass
      and tgname=
        'attendance_qr_verification_no_delete'
      and not tgisinternal
  ),
  'QR verification DELETE blocked'
);

select ok(
  pg_get_functiondef(
    'hr_private.monthly_payroll_evidence(uuid,date,date)'::regprocedure
  )
  like '%employee_attendance_qr_verifications%',
  'Payroll evidence reads QR verification'
);

select ok(
  pg_get_functiondef(
    'hr_private.monthly_payroll_evidence(uuid,date,date)'::regprocedure
  )
  like '%a.checker is null%qr_verification is null%',
  'Payroll requires checker or QR verification'
);

select ok(
  to_regprocedure(
    'public.get_employee_attendance_qr_verified_entries(uuid,date,date)'
  ) is not null,
  'Admin QR verification read RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_employee_attendance_qr_verified_entries(uuid,date,date)',
    'EXECUTE'
  ),
  'Authenticated role can invoke guarded verification RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_employee_attendance_qr_verified_entries(uuid,date,date)',
    'EXECUTE'
  ),
  'Anonymous cannot invoke verification RPC'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n
      on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'materialize_qr_attendance',
        'guard_attendance_qr_verification_immutable',
        'get_employee_attendance_qr_verified_entries'
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
  'Phase 2 SECURITY DEFINER search paths are trusted'
);

select * from finish();

rollback;
