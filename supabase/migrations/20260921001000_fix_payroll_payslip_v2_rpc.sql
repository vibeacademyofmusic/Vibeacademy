begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.payroll_payslip(
  p_payroll uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  pay public.teacher_payrolls;
  period public.payroll_periods;
  code text;
  is_v2 boolean;
begin
  if not coalesce(public.account_is_active(), false) then
    raise exception 'Unauthorized';
  end if;

  select *
  into pay
  from public.teacher_payrolls
  where id = p_payroll;

  if not found then
    return null;
  end if;

  select *
  into period
  from public.payroll_periods
  where id = pay.period_id;

  if period.status not in ('APPROVED', 'FINALIZED') then
    return null;
  end if;

  if not (
    coalesce(public.has_role('SUPER_ADMIN'), false)
    or coalesce(
      public.has_role_permission(
        'FINANCE',
        'payroll.view',
        pay.branch_id
      ),
      false
    )
    or coalesce(
      public.can_read_employee_payroll(
        pay.employee_id,
        pay.branch_id
      ),
      false
    )
    or coalesce(
      public.can_read_own_payroll(
        pay.teacher_id,
        pay.branch_id
      ),
      false
    )
  ) then
    return null;
  end if;

  select employee_code
  into code
  from public.employees
  where id = pay.employee_id;

  is_v2 :=
    coalesce(
      pay.calculation_version like 'PAYROLL_V2%',
      false
    );

  return jsonb_build_object(
    'payroll',
    to_jsonb(pay),

    'employee_code',
    coalesce(code, pay.teacher_id::text),

    'engine',
    case
      when is_v2 then 'V2'
      else 'V1'
    end,

    'period',
    jsonb_build_object(
      'starts_on', period.starts_on,
      'ends_on', period.ends_on,
      'status', period.status,
      'approved_by', period.approved_by,
      'approved_at', period.approved_at,
      'finalized_at', period.finalized_at
    ),

    'lines',
    case
      when not is_v2 then
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', l.id,
                'earned_on', l.earned_on,
                'kind',
                  case
                    when l.earning_type = 'MONTHLY_BASE'
                      then 'MONTHLY_BASE'
                    else coalesce(
                      l.calculation_snapshot ->> 'pay_type',
                      pay.pay_type
                    )
                  end,
                'hours', l.duration_hours,
                'rate', l.rate,
                'amount', l.amount,
                'required_minutes',
                  l.calculation_snapshot -> 'required_minutes',
                'payable_minutes',
                  l.calculation_snapshot -> 'payable_minutes'
              )
              order by l.earned_on, l.id
            )
            from public.payroll_earning_lines l
            where l.payroll_id = pay.id
          ),
          '[]'::jsonb
        )
      else
        '[]'::jsonb
    end,

    'component_lines_v2',
    case
      when is_v2 then
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', l.id,
                'component_code', l.component_code,
                'category', l.category,
                'calculation_method', l.calculation_method,
                'source_type', l.source_type,
                'source_session_id', l.source_session_id,
                'earned_on', l.earned_on,
                'quantity', l.quantity,
                'unit_rate', l.unit_rate,
                'amount', l.amount,
                'currency', l.currency
              )
              order by
                l.earned_on,
                l.component_code,
                l.id
            )
            from public.payroll_component_lines_v2 l
            where l.payroll_id = pay.id
          ),
          '[]'::jsonb
        )
      else
        '[]'::jsonb
    end,

    'period_actions_v2',
    case
      when is_v2 then
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'component_code', a.component_code,
                'category', a.category,
                'source_type', a.source_type,
                'source_expense_claim_id',
                  a.source_expense_claim_id,
                'amount', a.amount,
                'currency', a.currency,
                'reason', a.reason,
                'approved_at', a.approved_at
              )
              order by a.created_at, a.id
            )
            from public.payroll_period_actions_v2 a
            where a.period_id = pay.period_id
              and a.employee_id = pay.employee_id
              and a.status = 'ACTIVE'
          ),
          '[]'::jsonb
        )
      else
        '[]'::jsonb
    end,

    'adjustments',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'kind', a.kind,
            'amount', a.amount,
            'reason', a.reason
          )
          order by a.created_at, a.id
        )
        from public.payroll_adjustments a
        where a.payroll_id = pay.id
      ),
      '[]'::jsonb
    ),

    'totals',
    case
      when is_v2 then
        jsonb_build_object(
          'earnings',
            pay.v2_earnings_amount,
          'reimbursements',
            pay.v2_reimbursement_amount,
          'deductions',
            pay.v2_deduction_amount,
          'adjustment',
            pay.adjustment_amount,
          'net',
            pay.v2_net_amount
        )
      else
        null
    end
  );
end;
$function$;

revoke all
on function public.payroll_payslip(uuid)
from public, anon, service_role;

grant execute
on function public.payroll_payslip(uuid)
to authenticated;

do $verify$
begin
  if pg_get_functiondef(
    'public.payroll_payslip(uuid)'::regprocedure
  ) not like '%component_lines_v2%'
  then
    raise exception
      'PAYSLIP_V2_RPC_COMPONENT_LINES_VERIFY_FAILED';
  end if;

  if pg_get_functiondef(
    'public.payroll_payslip(uuid)'::regprocedure
  ) not like '%period_actions_v2%'
  then
    raise exception
      'PAYSLIP_V2_RPC_PERIOD_ACTIONS_VERIFY_FAILED';
  end if;

  if pg_get_functiondef(
    'public.payroll_payslip(uuid)'::regprocedure
  ) not like '%v2_net_amount%'
  then
    raise exception
      'PAYSLIP_V2_RPC_TOTALS_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
