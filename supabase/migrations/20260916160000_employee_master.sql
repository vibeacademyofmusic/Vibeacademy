-- Employee identity and effective-dated employment metadata; no auth provisioning or payroll writes.
create schema if not exists hr_private;
revoke all on schema hr_private from public,anon,authenticated,service_role;
create table public.organization_units (
 code text primary key check(code in ('HQ','ST','LX')), name text not null,
 branch_id uuid unique references public.branches(id)
);
insert into public.organization_units(code,name) values ('HQ','Cần Thơ Headquarters'),('ST','Sóc Trăng'),('LX','Long Xuyên');
create table hr_private.employee_counters(unit_code text primary key references public.organization_units(code), last_number bigint not null check(last_number>0));
create table public.employees (
 id uuid primary key default gen_random_uuid(), employee_code text not null unique,
 home_unit text not null references public.organization_units(code), hire_date date not null,
 profile_id uuid unique references public.profiles(id), teacher_id uuid unique references public.teachers(id),
 created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id)
);
create table public.employee_versions (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
 version integer not null check(version>0), effective_on date not null,
 full_name text not null check(length(btrim(full_name)) between 1 and 200),
 unit_code text not null references public.organization_units(code), employee_group text not null check(length(btrim(employee_group)) between 1 and 100),
 employment_status text not null check(employment_status in ('ACTIVE','ON_LEAVE','TERMINATED')),
 end_date date, pay_type text not null check(pay_type in ('MONTHLY','PER_SESSION','HOURLY')),
 operational_role_id uuid references public.roles(id),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id),
 unique(employee_id,version), check((employment_status='TERMINATED')=(end_date is not null)),
 check(end_date is null or end_date=effective_on)
);
create index employee_versions_effective on public.employee_versions(employee_id,effective_on desc,version desc);
create index employees_home on public.employees(home_unit);
create table public.employee_audit (
 id uuid primary key default gen_random_uuid(), employee_id uuid references public.employees(id),
 action text not null, before_data jsonb, after_data jsonb not null,
 reason text not null, actor uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index employee_audit_employee on public.employee_audit(employee_id,created_at desc);
create function hr_private.immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$begin raise exception 'Employee history is immutable'; end$$;
create trigger employee_version_immutable before update or delete on public.employee_versions for each row execute function hr_private.immutable();
create trigger employee_audit_immutable before update or delete on public.employee_audit for each row execute function hr_private.immutable();
create function hr_private.identity_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' or new.id<>old.id or new.employee_code<>old.employee_code or new.home_unit<>old.home_unit or new.hire_date<>old.hire_date then raise exception 'Employee identity is immutable'; end if;
 return new;end$$;
create trigger employee_identity_immutable before update or delete on public.employees for each row execute function hr_private.identity_guard();
alter table public.organization_units enable row level security;
alter table public.employees enable row level security;
alter table public.employee_versions enable row level security;
alter table public.employee_audit enable row level security;
create policy employee_units_admin on public.organization_units for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy employee_master_admin on public.employees for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy employee_versions_admin on public.employee_versions for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy employee_audit_admin on public.employee_audit for select to authenticated using(public.has_role('SUPER_ADMIN'));
revoke all on public.organization_units,public.employees,public.employee_versions,public.employee_audit from public,anon,authenticated,service_role;
grant select on public.organization_units,public.employees,public.employee_versions,public.employee_audit to authenticated;

create function public.configure_employee_unit(p_unit text,p_branch uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare old_row jsonb;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee administration denied'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reason required'; end if;
 select to_jsonb(u) into old_row from public.organization_units u where code=p_unit for update;
 if old_row is null then raise exception 'Unknown unit'; end if;
 if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and status='ACTIVE') then raise exception 'Active branch required'; end if;
 update public.organization_units set branch_id=p_branch where code=p_unit;
 insert into public.employee_audit(action,before_data,after_data,reason,actor) values('UNIT_MAPPING',old_row,jsonb_build_object('unit',p_unit,'branch_id',p_branch),p_reason,auth.uid());
end$$;

create function hr_private.check_links(p_profile uuid,p_teacher uuid) returns void language plpgsql set search_path=public,pg_temp as $$begin
 if p_profile is not null and not exists(select 1 from public.profiles where id=p_profile) then raise exception 'Profile not found'; end if;
 if p_teacher is not null then
   if not exists(select 1 from public.teachers where id=p_teacher) then raise exception 'Teacher not found'; end if;
   if exists(select 1 from public.teachers where id=p_teacher and user_id is not null and user_id is distinct from p_profile) then raise exception 'Teacher/profile identity mismatch'; end if;
 end if;
end$$;

create function public.set_employee_version(p_employee uuid,p_expected_version integer,p_effective_on date,p_full_name text,p_unit text,p_group text,p_status text,p_pay_type text,p_role uuid,p_reason text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees; previous public.employee_versions; result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee administration denied'; end if;
 select * into e from public.employees where id=p_employee for update;
 if not found then raise exception 'Employee not found'; end if;
 select * into previous from public.employee_versions where employee_id=e.id order by version desc limit 1;
 if p_expected_version is distinct from coalesce(previous.version,0) then raise exception 'Employee changed; reload before saving'; end if;
 if p_effective_on is null or p_effective_on<e.hire_date or p_effective_on<previous.effective_on then raise exception 'Invalid effective date'; end if;
 insert into public.employee_versions(employee_id,version,effective_on,full_name,unit_code,employee_group,employment_status,end_date,pay_type,operational_role_id,reason,created_by)
 values(e.id,coalesce(previous.version,0)+1,p_effective_on,btrim(p_full_name),p_unit,btrim(p_group),p_status,case when p_status='TERMINATED' then p_effective_on end,p_pay_type,p_role,btrim(p_reason),auth.uid()) returning id into result;
 insert into public.employee_audit(employee_id,action,before_data,after_data,reason,actor)
 select e.id,'EMPLOYMENT_VERSION',case when previous.id is not null then to_jsonb(previous) end,to_jsonb(v),p_reason,auth.uid() from public.employee_versions v where id=result;
 return result;end$$;

create function public.create_employee(p_home text,p_hire_date date,p_full_name text,p_group text,p_pay_type text,p_role uuid,p_profile uuid,p_teacher uuid,p_reason text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare n bigint; eid uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee administration denied'; end if;
 perform hr_private.check_links(p_profile,p_teacher);
 insert into hr_private.employee_counters(unit_code,last_number) values(p_home,1) on conflict(unit_code) do update set last_number=employee_counters.last_number+1 returning last_number into n;
 insert into public.employees(employee_code,home_unit,hire_date,profile_id,teacher_id,created_by)
 values('VIBE-'||p_home||'-'||lpad(n::text,greatest(4,length(n::text)),'0'),p_home,p_hire_date,p_profile,p_teacher,auth.uid()) returning id into eid;
 perform public.set_employee_version(eid,0,p_hire_date,p_full_name,p_home,p_group,'ACTIVE',p_pay_type,p_role,p_reason);
 insert into public.employee_audit(employee_id,action,after_data,reason,actor) select eid,'IDENTITY_CREATED',to_jsonb(e),p_reason,auth.uid() from public.employees e where id=eid;
 return eid;end$$;

create function public.link_employee_identity(p_employee uuid,p_profile uuid,p_teacher uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare before_row jsonb;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Employee administration denied'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reason required'; end if;
 select to_jsonb(e) into before_row from public.employees e where id=p_employee for update;
 if before_row is null then raise exception 'Employee not found'; end if;
 perform hr_private.check_links(p_profile,p_teacher);
 update public.employees set profile_id=p_profile,teacher_id=p_teacher where id=p_employee;
 insert into public.employee_audit(employee_id,action,before_data,after_data,reason,actor) select p_employee,'IDENTITY_LINK',before_row,to_jsonb(e),p_reason,auth.uid() from public.employees e where id=p_employee;
end$$;

create view public.employee_directory with(security_invoker=true) as
 select e.*,v.full_name,v.unit_code,v.employee_group,v.employment_status,v.end_date,v.pay_type,v.operational_role_id,v.effective_on,v.version,
 latest.version as latest_version,latest.effective_on as latest_effective_on
 from public.employees e
 left join lateral(select * from public.employee_versions where employee_id=e.id and effective_on<=(now() at time zone 'Asia/Ho_Chi_Minh')::date order by effective_on desc,version desc limit 1) v on true
 left join lateral(select version,effective_on from public.employee_versions where employee_id=e.id order by version desc limit 1) latest on true;
grant select on public.employee_directory to authenticated;
revoke all on all functions in schema hr_private from public,anon,authenticated,service_role;
revoke all on function public.configure_employee_unit(text,uuid,text),public.set_employee_version(uuid,integer,date,text,text,text,text,text,uuid,text),public.create_employee(text,date,text,text,text,uuid,uuid,uuid,text),public.link_employee_identity(uuid,uuid,uuid,text) from public,anon,service_role;
grant execute on function public.configure_employee_unit(text,uuid,text),public.set_employee_version(uuid,integer,date,text,text,text,text,text,uuid,text),public.create_employee(text,date,text,text,text,uuid,uuid,uuid,text),public.link_employee_identity(uuid,uuid,uuid,text) to authenticated;
