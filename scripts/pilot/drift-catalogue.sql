-- Read-only catalog evidence. Run on a complete restored local clone and a
-- clean reference. It deliberately does not write the migration ledger.
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'platform', jsonb_build_object(
    'auth_users', to_regclass('auth.users') is not null,
    'storage_buckets', to_regclass('storage.buckets') is not null,
    'storage_objects', to_regclass('storage.objects') is not null,
    'ledger', to_regclass('supabase_migrations.schema_migrations') is not null),
  'functions', (select jsonb_agg(jsonb_build_object(
    'signature', p.oid::regprocedure::text,
    'arguments', pg_get_function_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'definition_md5', md5(pg_get_functiondef(p.oid)),
    'body_md5', md5(p.prosrc), 'owner', pg_get_userbyid(p.proowner),
    'security_definer', p.prosecdef, 'settings', p.proconfig,
    'acl', p.proacl::text,
    'anon_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE'))
    order by n.nspname,p.proname,p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and (n.nspname='public' or n.nspname like '%private')),
  'tables', (select jsonb_agg(jsonb_build_object(
    'name', c.oid::regclass::text, 'rls', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity, 'owner', pg_get_userbyid(c.relowner),
    'acl', c.relacl::text,
    'columns', (select jsonb_agg(jsonb_build_object('name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_agg(jsonb_build_object('name',conname,
      'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname)
      from pg_constraint where conrelid=c.oid),
    'indexes', (select jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text)
      from pg_index where indrelid=c.oid),
    'policies', (select jsonb_agg(jsonb_build_object('name',polname,'roles',
      (select array_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r)
       from unnest(polroles) r),
      'command',polcmd,'permissive',polpermissive,'using',pg_get_expr(polqual,polrelid),
      'check',pg_get_expr(polwithcheck,polrelid)) order by polname)
      from pg_policy where polrelid=c.oid),
    'triggers', (select jsonb_agg(pg_get_triggerdef(oid) order by tgname)
      from pg_trigger where tgrelid=c.oid and not tgisinternal)) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p'))
));
rollback;
