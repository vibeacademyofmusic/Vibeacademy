-- Explicit grants override Supabase default function privileges on newly-created RPCs.
-- No application/finance behavior changes. Rollback: keep this least-privilege boundary.
begin;
revoke all on function public.create_registration_application_with_academics(uuid,uuid,uuid,text,date,text,text,uuid,uuid,uuid,date,text) from public, anon, service_role;
grant execute on function public.create_registration_application_with_academics(uuid,uuid,uuid,text,date,text,text,uuid,uuid,uuid,date,text) to authenticated;
revoke all on function public.guard_registration_branch_after_quote(), public.require_paid_registration_completion() from public, anon, authenticated, service_role;
commit;
