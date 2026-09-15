-- Read-only role rollout. Mutation/approval RPCs remain unchanged.
insert into public.permissions(code,name,module) values
 ('finance.view','Read finance in assigned scope','finance'),
 ('payroll.view','Read payroll in assigned scope','payroll'),
 ('payroll.view_own','Read own approved payroll','payroll') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (r.code='FINANCE' and p.code in ('finance.view','payroll.view'))
 or (r.code='TEACHER' and p.code='payroll.view_own') on conflict do nothing;

create policy finance_invoice_read on public.invoices for select to authenticated
 using(public.has_role_permission('FINANCE','finance.view',branch_id_snapshot));
create policy finance_invoice_item_read on public.invoice_items for select to authenticated
 using(exists(select 1 from public.invoices i where i.id=invoice_id and public.has_role_permission('FINANCE','finance.view',i.branch_id_snapshot)));
create policy finance_payment_read on public.payments for select to authenticated
 using(public.has_role_permission('FINANCE','finance.view',branch_id_snapshot));
create policy finance_payment_allocation_read on public.payment_allocations for select to authenticated
 using(exists(select 1 from public.payments p join public.invoices i on i.id=invoice_id
 where p.id=payment_id and public.has_role_permission('FINANCE','finance.view',p.branch_id_snapshot)
 and public.has_role_permission('FINANCE','finance.view',i.branch_id_snapshot)));
create policy finance_refund_read on public.refunds for select to authenticated
 using(public.has_role_permission('FINANCE','finance.view',branch_id_snapshot));
create policy finance_refund_allocation_read on public.refund_allocations for select to authenticated
 using(exists(select 1 from public.refunds r where r.id=refund_id and public.has_role_permission('FINANCE','finance.view',r.branch_id_snapshot)));
-- Branch labels are needed by scoped summary views, without granting operational scope.
create policy finance_branch_metadata_read on public.branches for select to authenticated
 using(public.has_role_permission('FINANCE','finance.view',id) or public.has_role_permission('FINANCE','payroll.view',id));

create or replace function public.can_read_own_payroll(p_teacher uuid,p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role_permission('TEACHER','payroll.view_own',p_branch) and exists(
  select 1 from public.teachers t where t.id=p_teacher and t.user_id=auth.uid() and t.status='ACTIVE')
$$;
create or replace function public.can_read_payroll_period(p_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(
  select 1 from public.payroll_periods p where p.id=p_id and (
   public.has_role_permission('FINANCE','payroll.view',p.branch_id)
   or (p.status in ('APPROVED','FINALIZED') and exists(select 1 from public.teacher_payrolls r
    where r.period_id=p.id and public.can_read_own_payroll(r.teacher_id,p.branch_id)))))
$$;
create policy finance_payroll_read on public.teacher_payrolls for select to authenticated
 using(public.has_role_permission('FINANCE','payroll.view',branch_id));
create policy finance_compensation_read on public.teacher_compensation_rules for select to authenticated
 using(public.has_role_permission('FINANCE','payroll.view',branch_id));
create policy finance_payroll_events_read on public.payroll_events for select to authenticated
 using(exists(select 1 from public.payroll_periods p where p.id=period_id and public.has_role_permission('FINANCE','payroll.view',p.branch_id)));
