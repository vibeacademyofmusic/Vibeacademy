-- Business data has no approved anonymous consumer. Login uses Supabase Auth;
-- role/profile queries occur after sign-in. RLS remains mandatory, not replaced.
-- Do not alter authenticated/service-role grants or auth/storage/platform schemas.
revoke all privileges on all tables in schema public from anon, public;
revoke all privileges on all sequences in schema public from anon, public;

-- Repository migrations run as postgres. Supabase platform-owned defaults are
-- deliberately untouched; catalogue regression checks detect future regressions.
alter default privileges for role postgres in schema public revoke all on tables from anon, public;
alter default privileges for role postgres in schema public revoke all on sequences from anon, public;
