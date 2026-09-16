-- Catalogue access must not depend on unrelated branch-directory permissions.
create function public.can_read_inventory_catalogue() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(
 select 1 from public.branches b where public.has_permission('inventory.view',b.id))
$$;
revoke all on function public.can_read_inventory_catalogue() from public,anon,authenticated,service_role;
grant execute on function public.can_read_inventory_catalogue() to authenticated;
drop policy inventory_catalogue_read on public.inventory_items;
create policy inventory_catalogue_read on public.inventory_items for select to authenticated using(public.can_read_inventory_catalogue());
