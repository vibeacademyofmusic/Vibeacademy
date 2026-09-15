-- Shadow permission foundation. No new business-table RLS policies or user role assignments.
alter table public.user_roles add column is_active boolean not null default true;
alter table public.user_roles add column valid_from timestamptz;
alter table public.user_roles add column valid_until timestamptz;
alter table public.user_roles add constraint user_role_valid_dates check(valid_until is null or valid_from is null or valid_until>valid_from);
create index user_role_authorization_lookup on public.user_roles(user_id,role_id,branch_id) where is_active;
insert into public.roles(code,name,is_system) values('BRANCH_ADMIN','Branch administrator',true),('ACADEMIC_ADMIN','Academic administrator',true),('FINANCE','Finance',true) on conflict(code) do nothing;
insert into public.permissions(code,name,module,description)
select code,code,split_part(code,'.',1),description from (values
('branches.manage','Manage branches'),('students.view','View students in authorized branches'),('students.view_own','View own student record'),('students.view_related','View students linked to parent or teacher'),('attendance.manage','Manage attendance'),('finance.invoice.create','Create invoice'),('finance.payment.void','Void payment'),('payroll.approve','Approve payroll')) v(code,description) on conflict(code) do nothing;

create function public.account_is_active() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='ACTIVE')
$$;
create function public.has_permission(p_permission text,p_branch uuid default null) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(select 1 from public.permissions where code=p_permission) and exists(
 select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and ur.is_active and (ur.valid_from is null or ur.valid_from<=now()) and (ur.valid_until is null or ur.valid_until>now())
 and ((r.code='SUPER_ADMIN' and ur.branch_id is null) or
 ((ur.branch_id is null or (p_branch is not null and ur.branch_id=p_branch)) and exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=(select id from public.permissions where code=p_permission)))))
$$;
create function public.can_access_student(p_student uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(select 1 from public.students s where s.id=p_student and (
 public.has_permission('students.view',s.default_branch_id)
 or (s.user_id=auth.uid() and public.has_permission('students.view_own',s.default_branch_id))
 or (public.has_permission('students.view_related',s.default_branch_id) and (
 exists(select 1 from public.parents p join public.student_parents sp on sp.parent_id=p.id where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=s.id)
 or exists(select 1 from public.teachers t join public.class_teachers ct on ct.teacher_id=t.id join public.enrollments e on e.class_id=ct.class_id where t.user_id=auth.uid() and t.status='ACTIVE' and ct.is_active and ct.assigned_at<=(now() at time zone 'Asia/Ho_Chi_Minh')::date and (ct.ended_at is null or ct.ended_at>=(now() at time zone 'Asia/Ho_Chi_Minh')::date) and e.student_id=s.id and e.status='ACTIVE')))))
$$;
-- Legacy callers keep the same role API and now require an ACTIVE account.
create or replace function public.has_role(role_code text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and r.code=role_code and ur.is_active and (ur.valid_from is null or ur.valid_from<=now()) and (ur.valid_until is null or ur.valid_until>now()))
$$;
create function public.guard_profile_account_status() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new.status is distinct from old.status and auth.uid() is not null and not public.has_role('SUPER_ADMIN') then raise exception 'Only active SUPER_ADMIN may change account status'; end if;
 if tg_op='INSERT' and new.status<>'ACTIVE' and auth.uid() is not null and not public.has_role('SUPER_ADMIN') then raise exception 'Only active SUPER_ADMIN may set account status'; end if;
 return new;
end $$;
create trigger profile_account_status_guard before insert or update on public.profiles for each row execute function public.guard_profile_account_status();
revoke all on function public.account_is_active(),public.has_permission(text,uuid),public.can_access_student(uuid),public.guard_profile_account_status() from public,anon,authenticated;
grant execute on function public.account_is_active(),public.has_permission(text,uuid),public.can_access_student(uuid) to authenticated;
