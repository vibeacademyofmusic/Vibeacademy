-- 20260928080000 can be applied after 20260928223000 on a database whose
-- ledger skipped the earlier file. That late apply replaces the consent-aware
-- outbound wrapper with the older body. Restore the later contract: recovery
-- sends go through the same consent and template gate as the first send.
create or replace function public.start_zalo_recovery_outbound(p_attempt uuid)
returns text language sql security definer set search_path=public,pg_temp as $$
 select public.authorize_zalo_registration_outbound(p_attempt, true);
$$;
revoke all on function public.start_zalo_recovery_outbound(uuid) from public, anon, authenticated, service_role;
grant execute on function public.start_zalo_recovery_outbound(uuid) to service_role;
