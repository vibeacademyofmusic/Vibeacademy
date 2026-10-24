-- Additive, read-only preview and version/source-checked confirmation.
-- Existing generate_staff_payroll_v2 and transition workflows remain authoritative.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function public.preview_staff_payroll_v2(p_period uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,pg_temp as $$
declare
 p public.payroll_periods%rowtype; staff record; cfg record; sess record; chosen record; employment record;
 issues text[]; global_issues text[] := '{}'; projected numeric; current_amount numeric; currency_value text;
 rows_value jsonb := '[]'; sources jsonb; amount_value numeric;
begin
 select * into p from public.payroll_periods target where target.id=p_period
 and auth.uid() is not null and public.account_is_active()
 and public.has_permission('payroll.prepare',target.branch_id)
 and (public.is_global_super_admin() or public.has_role_permission('FINANCE','payroll.prepare',target.branch_id));
 if not found then raise exception 'PAYROLL_V2_UNAUTHORIZED'; end if;
 if p.status not in ('DRAFT','GENERATED','REVIEW') then global_issues:=array_append(global_issues,'Kỳ đã duyệt/chốt; dùng quy trình sửa sai.'); end if;
 if exists(select 1 from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id where t.period_id=p.id) then global_issues:=array_append(global_issues,'Có điều chỉnh cũ: bộ tính hiện tại chặn tính lại.'); end if;
 for staff in select distinct e.id,e.employee_code,e.teacher_id from public.employees e join public.staff_compensation_components c on c.employee_id=e.id where c.branch_id=p.branch_id and c.status='ACTIVE' and c.effective_from<=p.ends_on and (c.effective_to is null or c.effective_to>=p.starts_on) order by e.id loop
  issues:='{}'; projected:=0;
  select v.* into employment from public.employee_versions v where v.employee_id=staff.id and v.effective_on<=p.ends_on order by v.effective_on desc,v.version desc limit 1;
  if not found or employment.employment_status not in ('ACTIVE','ON_LEAVE') then issues:=array_append(issues,'Thiếu hồ sơ hiệu lực hoặc cần chia lương khi nghỉ việc; chưa hỗ trợ.'); end if;
  select min(c.currency) into currency_value from public.staff_compensation_components c where c.employee_id=staff.id and c.branch_id=p.branch_id and c.status='ACTIVE' and c.effective_from<=p.ends_on and (c.effective_to is null or c.effective_to>=p.starts_on);
  if currency_value is null or (select count(distinct c.currency) from public.staff_compensation_components c where c.employee_id=staff.id and c.branch_id=p.branch_id and c.status='ACTIVE' and c.effective_from<=p.ends_on and (c.effective_to is null or c.effective_to>=p.starts_on))<>1 then issues:=array_append(issues,'Thiếu hoặc có nhiều tiền tệ trong cùng hồ sơ.'); end if;
  for cfg in select c.*,cat.category from public.staff_compensation_components c join public.payroll_component_catalog cat on cat.code=c.component_code where c.employee_id=staff.id and c.branch_id=p.branch_id and c.status='ACTIVE' and c.effective_from<=p.ends_on and (c.effective_to is null or c.effective_to>=p.starts_on) order by c.id loop
   if cfg.calculation_method not in ('FIXED_AMOUNT','PER_SESSION') then issues:=array_append(issues,cfg.component_code||': phương pháp chưa được hỗ trợ.');
   elsif cfg.calculation_method='FIXED_AMOUNT' then
    if cfg.effective_from>p.starts_on or coalesce(cfg.effective_to,p.ends_on)<p.ends_on then issues:=array_append(issues,cfg.component_code||': hiệu lực không phủ trọn tháng; không tự chia lương.');
    elsif cfg.amount is null then issues:=array_append(issues,cfg.component_code||': thiếu số tiền.');
    else projected:=projected+case when cfg.category='DEDUCTION' then -cfg.amount else cfg.amount end; end if;
   end if;
  end loop;
  if exists(select 1 from public.staff_compensation_components a join public.staff_compensation_components b on a.id<b.id and a.employee_id=b.employee_id and a.branch_id=b.branch_id and daterange(a.effective_from,a.effective_to,'[]') && daterange(b.effective_from,b.effective_to,'[]') where a.employee_id=staff.id and a.branch_id=p.branch_id and a.status='ACTIVE' and b.status='ACTIVE' and a.effective_from<=p.ends_on and coalesce(a.effective_to,p.ends_on)>=p.starts_on and b.effective_from<=p.ends_on and coalesce(b.effective_to,p.ends_on)>=p.starts_on and ((a.component_code=b.component_code and a.calculation_method='FIXED_AMOUNT') or (a.component_code='SOCIAL_LABOR_INSURANCE' and b.component_code in ('SOCIAL_INSURANCE','LABOR_INSURANCE')) or (b.component_code='SOCIAL_LABOR_INSURANCE' and a.component_code in ('SOCIAL_INSURANCE','LABOR_INSURANCE')))) then issues:=array_append(issues,'Cấu hình trùng phạm vi hoặc bảo hiểm gộp giao với mã cũ.'); end if;
  for sess in select a.*,c.class_type from public.session_actual_teachers a join public.classes c on c.id=a.class_id where a.teacher_id=staff.teacher_id and a.branch_id=p.branch_id and a.occurrence_date between p.starts_on and p.ends_on and a.status='COMPLETED' and a.ends_at<=statement_timestamp() order by a.session_id loop
   select c.*,cat.category into chosen from public.staff_compensation_components c join public.payroll_component_catalog cat on cat.code=c.component_code where c.employee_id=staff.id and c.branch_id=p.branch_id and c.component_code='TEACHING_PER_SESSION' and c.status='ACTIVE' and c.calculation_method='PER_SESSION' and c.effective_from<=sess.occurrence_date and (c.effective_to is null or c.effective_to>=sess.occurrence_date) and (c.class_type is null or c.class_type=sess.class_type) order by case when c.class_type is null then 1 else 0 end,c.effective_from desc,c.id limit 1;
   if found then
    if chosen.rate is null then issues:=array_append(issues,'Buổi dạy thiếu đơn giá.'); else projected:=projected+case when chosen.category='DEDUCTION' then -chosen.rate else chosen.rate end; end if;
   end if;
  end loop;
  if exists(select 1 from public.payroll_period_actions_v2 a where a.period_id=p.id and a.employee_id=staff.id and a.status='ACTIVE' and a.currency is distinct from currency_value) then issues:=array_append(issues,'Khoản phát sinh khác tiền tệ cấu hình.'); end if;
  select coalesce(sum(a.amount),0) into amount_value from public.payroll_period_actions_v2 a where a.period_id=p.id and a.employee_id=staff.id and a.status='ACTIVE';
  projected:=projected+amount_value;
  select case when t.calculation_version like 'PAYROLL_V2%' then t.v2_net_amount else t.gross_amount end into current_amount from public.teacher_payrolls t where t.period_id=p.id and t.employee_id=staff.id;
  rows_value:=rows_value||jsonb_build_array(jsonb_build_object('employee_id',staff.id,'name',coalesce(employment.full_name,staff.employee_code),'currency',currency_value,'current',current_amount::text,'projected',case when cardinality(issues)=0 then projected::text else null end,'delta',case when cardinality(issues)=0 and current_amount is not null then (projected-current_amount)::text else null end,'issues',to_jsonb(issues)));
 end loop;
 if jsonb_array_length(rows_value)=0 then global_issues:=array_append(global_issues,'Chưa có nhân viên có cấu hình hợp lệ trong kỳ.'); end if;
 if exists(select 1 from public.teacher_payrolls t where t.period_id=p.id and not exists(select 1 from jsonb_array_elements(rows_value) r where r->>'employee_id'=t.employee_id::text)) then global_issues:=array_append(global_issues,'Có bản tính cũ không còn cấu hình; cần đối soát trước khi thay thế.'); end if;
 if exists(select 1 from public.payroll_period_actions_v2 a where a.period_id=p.id and a.status='ACTIVE' and not exists(select 1 from jsonb_array_elements(rows_value) r where r->>'employee_id'=a.employee_id::text)) then global_issues:=array_append(global_issues,'Khoản phát sinh có nhân viên không còn cấu hình trong kỳ.'); end if;
 -- Fingerprint source evidence as well as amounts: equal totals alone are insufficient.
 sources:=jsonb_build_object('period',public.payroll_approval_snapshot(p.id),'configs',(select jsonb_agg(to_jsonb(c) order by c.id) from public.staff_compensation_components c where c.branch_id=p.branch_id),'staff',(select jsonb_agg(to_jsonb(e) order by e.id) from public.employees e),'employment',(select jsonb_agg(to_jsonb(v) order by v.employee_id,v.version) from public.employee_versions v),'catalog',(select jsonb_agg(to_jsonb(c) order by c.code) from public.payroll_component_catalog c),'sessions',(select jsonb_agg(to_jsonb(a)||jsonb_build_object('class_type',c.class_type) order by a.session_id) from public.session_actual_teachers a join public.classes c on c.id=a.class_id where a.branch_id=p.branch_id and a.occurrence_date between p.starts_on and p.ends_on));
 return jsonb_build_object('version',p.version,'status',p.status,'rows',rows_value,'issues',to_jsonb(global_issues),'blocked',cardinality(global_issues)>0 or exists(select 1 from jsonb_array_elements(rows_value) r where jsonb_array_length(r->'issues')>0),'fingerprint',md5(sources::text||rows_value::text));
end $$;
create function public.confirm_staff_payroll_v2(p_period uuid,p_version integer,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare preview jsonb; target public.payroll_periods%rowtype;
begin
 -- Authorize before taking locks. No status is directly updated here.
 perform public.preview_staff_payroll_v2(p_period);
 select * into target from public.payroll_periods where id=p_period for update;
 if target.version is distinct from p_version or target.status<>'DRAFT' then raise exception 'PAYROLL_PREVIEW_CHANGED_RELOAD'; end if;
 lock table public.staff_compensation_components,public.employees,public.employee_versions,public.payroll_component_catalog,public.session_occurrences,public.schedules,public.classes,public.session_teacher_assignments,public.session_teacher_snapshots,public.class_teachers,public.payroll_period_actions_v2,public.payroll_adjustments in share mode;
 preview:=public.preview_staff_payroll_v2(p_period);
 if preview->>'fingerprint' is distinct from p_fingerprint then raise exception 'PAYROLL_PREVIEW_CHANGED_RELOAD'; end if;
 if (preview->>'blocked')::boolean then raise exception 'PAYROLL_PREVIEW_BLOCKED'; end if;
 return public.generate_staff_payroll_v2(p_period);
end $$;
revoke all on function public.preview_staff_payroll_v2(uuid),public.confirm_staff_payroll_v2(uuid,integer,text) from public,anon,service_role;
grant execute on function public.preview_staff_payroll_v2(uuid),public.confirm_staff_payroll_v2(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
