-- Phase 1.1 validation gate. Additive replace of report helpers only.
-- Does not rewrite applied 20260922013000 / 20260922013100.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, extensions, pg_temp;

drop function if exists vibe_financial_report_private.metric(text, numeric, text, text, text[], text);

create function vibe_financial_report_private.metric(
  p_code text,
  p_value numeric,
  p_status text,
  p_reason text,
  p_sources text[],
  p_as_of text,
  p_known integer default 0,
  p_unresolved integer default 0
) returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'code', p_code,
    'value', to_jsonb(p_value),
    'status', p_status,
    'reason', p_reason,
    'source_codes', to_jsonb(coalesce(p_sources, array[]::text[])),
    'as_of_type', p_as_of,
    'known_source_count', coalesce(p_known, 0),
    'unresolved_source_count', coalesce(p_unresolved, 0)
  )
$$;

create or replace function vibe_financial_report_private.month_metrics(
  p_month date,
  p_branches uuid[],
  p_currency text
) returns jsonb
language plpgsql stable
set search_path = public, pg_temp
as $fn$
declare
  v_month_start date := vibe_financial_report_private.month_start(p_month);
  v_month_end date := vibe_financial_report_private.month_end(p_month);
  tz text := 'Asia/Ho_Chi_Minh';
  revenue_value numeric;
  revenue_unresolved integer := 0;
  revenue_status text;
  personnel_value numeric;
  personnel_status text;
  personnel_known integer := 0;
  personnel_unresolved integer := 0;
  travel_value numeric;
  travel_v2 numeric := 0;
  travel_legacy numeric := 0;
  travel_action_count integer := 0;
  travel_allowance_count integer := 0;
  opex_recorded numeric;
  opex_planned numeric;
  opex_unplanned integer := 0;
  opex_eligible integer := 0;
  opex_plan_status text;
  opex_variance numeric;
  other_opex jsonb;
  operating_result numeric;
  operating_status text;
  operating_unresolved integer := 0;
  cash_in numeric;
  payroll_out numeric;
  refund_out numeric;
  total_in numeric;
  total_out numeric;
  net_cash numeric;
  current_ar numeric;
  opening_ar numeric;
  recognized_payable numeric;
  disbursable_payable numeric;
  paid_amount numeric;
  remaining_disbursable numeric;
  paid_recognized numeric;
  remaining_recognized numeric;
  integrity_warning boolean := false;
  tuition_count integer := 0;
  opex_record_count integer := 0;
  payment_count integer := 0;
  refund_count integer := 0;
  disbursement_count integer := 0;
  payroll_count integer := 0;
  by_category jsonb;
  by_branch jsonb;
  opex_plan_metric jsonb;
begin
  select
    coalesce(sum(a.amount) filter (where not a.unresolved), 0),
    count(*) filter (where a.unresolved),
    count(distinct a.tuition_id) filter (where not a.unresolved)
  into revenue_value, revenue_unresolved, tuition_count
  from vibe_financial_report_private.tuition_month_amounts(p_branches, p_currency) a
  where a.month_start = v_month_start;

  if revenue_unresolved > 0 and tuition_count = 0 then
    revenue_value := null;
    revenue_status := 'PARTIAL';
  elsif revenue_unresolved > 0 then
    revenue_status := 'PARTIAL';
  else
    revenue_status := 'AVAILABLE';
  end if;

  -- LEGACY_PERSONNEL_EXPENSE =
  --   sum(payroll_earning_lines.amount) [MONTHLY_BASE + TEACHING]
  --   + sum(payroll_adjustments.amount) where kind = 'BONUS'
  -- TRAVEL_ALLOWANCE is travel, not personnel.
  -- DEDUCTION does not reduce personnel.
  -- CORRECTION / ADJUSTMENT are excluded and force PARTIAL.
  -- V2 personnel = EARNING component lines + ACTIVE EARNING actions.
  -- Never use teacher_payrolls.gross_amount or v2_net_amount as personnel.
  select
    coalesce(sum(x.personnel), 0),
    coalesce(sum(x.known_n), 0)::integer,
    coalesce(sum(x.unresolved_n), 0)::integer
  into personnel_value, personnel_known, personnel_unresolved
  from (
    select
      case
        when coalesce(pay.calculation_version, '') like 'PAYROLL_V2%' then
          coalesce((
            select sum(l.amount) from public.payroll_component_lines_v2 l
            where l.payroll_id = pay.id and l.category = 'EARNING' and l.currency = p_currency
          ), 0)
          + coalesce((
            select sum(a.amount) from public.payroll_period_actions_v2 a
            where a.period_id = pay.period_id
              and a.employee_id is not distinct from pay.employee_id
              and a.status = 'ACTIVE'
              and a.category = 'EARNING'
              and a.currency = p_currency
          ), 0)
        else
          coalesce((
            select sum(e.amount) from public.payroll_earning_lines e where e.payroll_id = pay.id
          ), 0)
          + coalesce((
            select sum(adj.amount) from public.payroll_adjustments adj
            where adj.payroll_id = pay.id and adj.kind = 'BONUS'
          ), 0)
      end as personnel,
      case
        when coalesce(pay.calculation_version, '') like 'PAYROLL_V2%' then
          coalesce((
            select count(*)::integer from public.payroll_component_lines_v2 l
            where l.payroll_id = pay.id and l.category = 'EARNING' and l.currency = p_currency
          ), 0)
          + coalesce((
            select count(*)::integer from public.payroll_period_actions_v2 a
            where a.period_id = pay.period_id
              and a.employee_id is not distinct from pay.employee_id
              and a.status = 'ACTIVE'
              and a.category = 'EARNING'
              and a.currency = p_currency
          ), 0)
        else
          coalesce((select count(*)::integer from public.payroll_earning_lines e where e.payroll_id = pay.id), 0)
          + coalesce((
            select count(*)::integer from public.payroll_adjustments adj
            where adj.payroll_id = pay.id and adj.kind = 'BONUS'
          ), 0)
      end as known_n,
      case
        when coalesce(pay.calculation_version, '') like 'PAYROLL_V2%' then
          case when pay.adjustment_amount <> 0 then 1 else 0 end
        else
          coalesce((
            select count(*)::integer from public.payroll_adjustments adj
            where adj.payroll_id = pay.id and adj.kind in ('CORRECTION', 'ADJUSTMENT')
          ), 0)
      end as unresolved_n
    from public.teacher_payrolls pay
    join public.payroll_periods per on per.id = pay.period_id
    where per.status in ('APPROVED', 'FINALIZED')
      and per.starts_on = v_month_start
      and pay.branch_id = any(p_branches)
      and pay.currency = p_currency
  ) x;

  personnel_status := case when personnel_unresolved > 0 then 'PARTIAL' else 'AVAILABLE' end;

  select coalesce(sum(a.amount), 0), count(*)
  into travel_v2, travel_action_count
  from public.payroll_period_actions_v2 a
  join public.payroll_periods per on per.id = a.period_id
  join public.teacher_payrolls pay
    on pay.period_id = a.period_id
   and pay.employee_id is not distinct from a.employee_id
  where per.status in ('APPROVED', 'FINALIZED')
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and a.status = 'ACTIVE'
    and a.component_code = 'TRAVEL_EXPENSE'
    and a.category = 'REIMBURSEMENT'
    and a.source_type = 'EXPENSE_CLAIM'
    and a.currency = p_currency;

  select coalesce(sum(adj.amount), 0), count(*)
  into travel_legacy, travel_allowance_count
  from public.payroll_adjustments adj
  join public.teacher_payrolls pay on pay.id = adj.payroll_id
  join public.payroll_periods per on per.id = pay.period_id
  where per.status in ('APPROVED', 'FINALIZED')
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and pay.currency = p_currency
    and coalesce(pay.calculation_version, '') not like 'PAYROLL_V2%'
    and adj.kind = 'TRAVEL_ALLOWANCE';

  travel_value := travel_v2 + travel_legacy;

  select
    coalesce(sum(r.actual_amount) filter (where r.status = 'RECORDED'), 0),
    sum(r.expected_amount) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is not null),
    count(*) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is null),
    count(*) filter (where r.status in ('DRAFT', 'RECORDED')),
    count(*) filter (where r.status = 'RECORDED')
  into opex_recorded, opex_planned, opex_unplanned, opex_eligible, opex_record_count
  from public.operating_expense_records r
  where r.expense_month = v_month_start
    and r.branch_id = any(p_branches)
    and r.currency = p_currency;

  if opex_eligible = 0 then
    opex_planned := 0;
    opex_plan_status := 'AVAILABLE';
  elsif opex_unplanned > 0 then
    opex_plan_status := 'PARTIAL';
  else
    opex_planned := coalesce(opex_planned, 0);
    opex_plan_status := 'AVAILABLE';
  end if;

  if opex_plan_status = 'AVAILABLE' then
    opex_variance := opex_recorded - opex_planned;
  else
    opex_variance := null;
  end if;

  opex_plan_metric := vibe_financial_report_private.metric(
    'OPERATING_EXPENSE_PLAN',
    opex_planned,
    opex_plan_status,
    case
      when opex_eligible = 0 then 'No eligible operating-expense records; planned known amount is zero'
      when opex_plan_status = 'PARTIAL' then 'One or more eligible VARIABLE records have expected_amount null; planned_known_amount is resolvable snapshots only'
      else 'All eligible records have authoritative expected_amount snapshots'
    end,
    array['operating_expense_records'],
    'PERIOD',
    opex_eligible - opex_unplanned,
    opex_unplanned
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'category', x.category,
    'planned', to_jsonb(x.planned),
    'actual', to_jsonb(x.actual),
    'variance', to_jsonb(case
      when x.plan_incomplete or x.planned is null then null
      else x.actual - x.planned
    end),
    'status', case when x.plan_incomplete then 'PARTIAL' else 'AVAILABLE' end
  ) order by x.category), '[]'::jsonb)
  into by_category
  from (
    select
      r.category,
      sum(r.expected_amount) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is not null) as planned,
      coalesce(sum(r.actual_amount) filter (where r.status = 'RECORDED'), 0) as actual,
      coalesce(bool_or(r.status in ('DRAFT', 'RECORDED') and r.expected_amount is null), false) as plan_incomplete
    from public.operating_expense_records r
    where r.expense_month = v_month_start
      and r.branch_id = any(p_branches)
      and r.currency = p_currency
      and r.status in ('DRAFT', 'RECORDED')
    group by r.category
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id', b.id,
    'branch_name', b.name,
    'planned', to_jsonb(
      case
        when coalesce(x.eligible, 0) = 0 then 0
        else x.planned
      end
    ),
    'actual', to_jsonb(coalesce(x.actual, 0)),
    'variance', to_jsonb(
      case
        when coalesce(x.eligible, 0) = 0 then 0
        when coalesce(x.unplanned, 0) > 0 then null
        when x.planned is null then null
        else coalesce(x.actual, 0) - x.planned
      end
    ),
    'planned_status', case
      when coalesce(x.eligible, 0) = 0 then 'AVAILABLE'
      when coalesce(x.unplanned, 0) > 0 then 'PARTIAL'
      else 'AVAILABLE'
    end
  ) order by b.name, b.id), '[]'::jsonb)
  into by_branch
  from public.branches b
  left join (
    select
      r.branch_id,
      sum(r.expected_amount) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is not null) as planned,
      sum(r.actual_amount) filter (where r.status = 'RECORDED') as actual,
      count(*) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is null) as unplanned,
      count(*) filter (where r.status in ('DRAFT', 'RECORDED')) as eligible
    from public.operating_expense_records r
    where r.expense_month = v_month_start
      and r.currency = p_currency
      and r.status in ('DRAFT', 'RECORDED')
    group by r.branch_id
  ) x on x.branch_id = b.id
  where b.id = any(p_branches);

  other_opex := vibe_financial_report_private.metric(
    'OTHER_OPERATING_EXPENSE', null, 'NOT_IMPLEMENTED',
    'No other-operating-expense source', array[]::text[], 'PERIOD', 0, 0
  );

  if revenue_value is null then
    operating_result := null;
    operating_status := 'PARTIAL';
    operating_unresolved := 1 + case when personnel_status = 'PARTIAL' then 1 else 0 end;
  else
    operating_result := revenue_value - personnel_value - travel_value - opex_recorded;
    operating_status := case
      when revenue_status = 'PARTIAL' or personnel_status = 'PARTIAL' then 'PARTIAL'
      else 'AVAILABLE'
    end;
    operating_unresolved :=
      case when revenue_status = 'PARTIAL' then 1 else 0 end
      + case when personnel_status = 'PARTIAL' then 1 else 0 end;
  end if;

  select coalesce(sum(p.amount), 0), count(*)
  into cash_in, payment_count
  from public.payments p
  where p.status = 'POSTED'
    and p.currency = p_currency
    and p.branch_id_snapshot = any(p_branches)
    and date_trunc('month', p.paid_at at time zone tz)::date = v_month_start;

  select coalesce(sum(d.amount), 0), count(*)
  into payroll_out, disbursement_count
  from public.payroll_disbursements d
  where d.status = 'ACTIVE'
    and d.currency = p_currency
    and d.branch_id = any(p_branches)
    and date_trunc('month', d.paid_on)::date = v_month_start;

  select coalesce(sum(r.amount), 0), count(*)
  into refund_out, refund_count
  from public.refunds r
  where r.status = 'POSTED'
    and r.currency = p_currency
    and r.branch_id_snapshot = any(p_branches)
    and date_trunc('month', r.refunded_at at time zone tz)::date = v_month_start;

  total_in := cash_in;
  total_out := payroll_out + refund_out;
  net_cash := total_in - total_out;

  select coalesce(sum(i.outstanding_balance), 0)
  into current_ar
  from public.invoice_receivables i
  where i.invoice_status = 'ISSUED'
    and i.currency = p_currency
    and i.branch_id_snapshot = any(p_branches);

  select coalesce(sum(o.outstanding_balance), 0)
  into opening_ar
  from public.opening_receivable_balances o
  where o.currency = p_currency
    and o.branch_id = any(p_branches)
    and coalesce(o.reversed, false) = false;

  select
    coalesce(sum(case
      when coalesce(pay.calculation_version, '') like 'PAYROLL_V2%' then pay.v2_net_amount
      else pay.gross_amount
    end), 0),
    count(*)
  into recognized_payable, payroll_count
  from public.teacher_payrolls pay
  join public.payroll_periods per on per.id = pay.period_id
  where per.status in ('APPROVED', 'FINALIZED')
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and pay.currency = p_currency;

  select coalesce(sum(case
    when coalesce(pay.calculation_version, '') like 'PAYROLL_V2%' then pay.v2_net_amount
    else pay.gross_amount
  end), 0)
  into disbursable_payable
  from public.teacher_payrolls pay
  join public.payroll_periods per on per.id = pay.period_id
  where per.status = 'FINALIZED'
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and pay.currency = p_currency;

  select coalesce(sum(d.amount), 0)
  into paid_amount
  from public.payroll_disbursements d
  join public.teacher_payrolls pay on pay.id = d.payroll_id
  join public.payroll_periods per on per.id = pay.period_id
  where d.status = 'ACTIVE'
    and per.status = 'FINALIZED'
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and d.currency = p_currency;

  remaining_disbursable := disbursable_payable - paid_amount;
  if remaining_disbursable < 0 then
    integrity_warning := true;
  end if;

  select coalesce(sum(d.amount), 0)
  into paid_recognized
  from public.payroll_disbursements d
  join public.teacher_payrolls pay on pay.id = d.payroll_id
  join public.payroll_periods per on per.id = pay.period_id
  where d.status = 'ACTIVE'
    and per.status in ('APPROVED', 'FINALIZED')
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and d.currency = p_currency;

  remaining_recognized := recognized_payable - paid_recognized;
  if remaining_recognized < 0 then
    integrity_warning := true;
  end if;

  return jsonb_build_object(
    'month', v_month_start,
    'pnl', jsonb_build_object(
      'revenue', vibe_financial_report_private.metric(
        'REVENUE', revenue_value, revenue_status,
        case
          when revenue_unresolved > 0 then 'CANCELLATION_POLICY_UNRESOLVED: recognized amount is from resolvable terms only, not full monthly revenue'
          else 'Service-period recognition excluding pauses'
        end,
        array['enrollment_tuition.amount','enrollment_pauses'],
        'PERIOD',
        tuition_count,
        revenue_unresolved
      ),
      'personnel_expense', vibe_financial_report_private.metric(
        'PERSONNEL_EXPENSE', personnel_value, personnel_status,
        case
          when personnel_unresolved > 0 then 'PARTIAL: LEGACY_PERSONNEL_EXPENSE excludes unclassified CORRECTION/ADJUSTMENT; V2 residual adjustment_amount is unclassified'
          else 'LEGACY_PERSONNEL_EXPENSE = MONTHLY_BASE + TEACHING + BONUS; V2 = EARNING lines + ACTIVE EARNING actions; DEDUCTION and TRAVEL_ALLOWANCE excluded; gross_amount unused'
        end,
        array['payroll_component_lines_v2','payroll_period_actions_v2','payroll_earning_lines','payroll_adjustments'],
        'PERIOD',
        personnel_known,
        personnel_unresolved
      ),
      'travel_reimbursement_expense', vibe_financial_report_private.metric(
        'TRAVEL_REIMBURSEMENT_EXPENSE', travel_value, 'AVAILABLE',
        'ACTIVE TRAVEL_EXPENSE payroll period actions plus legacy TRAVEL_ALLOWANCE on APPROVED/FINALIZED payrolls',
        array['payroll_period_actions_v2','payroll_adjustments'],
        'PERIOD',
        travel_action_count + travel_allowance_count,
        0
      ),
      'operating_expense', vibe_financial_report_private.metric(
        'OPERATING_EXPENSE', opex_recorded, 'AVAILABLE',
        'RECORDED actual_amount only',
        array['operating_expense_records'],
        'PERIOD',
        opex_record_count,
        0
      ),
      'other_operating_expense', other_opex,
      'operating_result', vibe_financial_report_private.metric(
        'OPERATING_RESULT_KNOWN_SOURCES', operating_result, coalesce(operating_status, 'PARTIAL'),
        'Known-source subtotal: resolvable Revenue - Personnel - Travel reimbursement - Operating expense. Not a complete P&L result when any input is PARTIAL. Other operating expense is out of V1 scope and not treated as zero.',
        array['enrollment_tuition','teacher_payrolls','operating_expense_records'],
        'PERIOD',
        4 - operating_unresolved,
        operating_unresolved
      ),
      'loan_interest_expense', vibe_financial_report_private.metric(
        'LOAN_INTEREST_EXPENSE', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD', 0, 0
      ),
      'other_financial_expense', vibe_financial_report_private.metric(
        'OTHER_FINANCIAL_EXPENSE', null, 'NOT_IMPLEMENTED', 'Financial-expense domain not implemented', array[]::text[], 'PERIOD', 0, 0
      ),
      'management_result', vibe_financial_report_private.metric(
        'MANAGEMENT_RESULT', null, 'NOT_IMPLEMENTED', 'Loan/financial expense source unavailable', array[]::text[], 'PERIOD', 0, 0
      ),
      'management_margin', vibe_financial_report_private.metric(
        'MANAGEMENT_MARGIN', null, 'NOT_IMPLEMENTED', 'Requires management_result', array[]::text[], 'PERIOD', 0, 0
      )
    ),
    'operating_expense', jsonb_build_object(
      'planned_amount', to_jsonb(opex_planned),
      'planned_known_amount', to_jsonb(opex_planned),
      'recorded_amount', to_jsonb(opex_recorded),
      'variance_amount', to_jsonb(opex_variance),
      'planned_status', opex_plan_status,
      'unplanned_template_count', opex_unplanned,
      'record_count', opex_eligible,
      'plan', opex_plan_metric,
      'by_category', by_category,
      'by_branch', by_branch
    ),
    'cash_flow', jsonb_build_object(
      'tuition_cash_in', vibe_financial_report_private.metric('TUITION_CASH_IN', cash_in, 'AVAILABLE', 'POSTED payments.amount by paid_at VN month', array['payments'], 'PERIOD', payment_count, 0),
      'payroll_cash_out', vibe_financial_report_private.metric('PAYROLL_CASH_OUT', payroll_out, 'AVAILABLE', 'ACTIVE payroll_disbursements by paid_on', array['payroll_disbursements'], 'PERIOD', disbursement_count, 0),
      'refund_cash_out', vibe_financial_report_private.metric('REFUND_CASH_OUT', refund_out, 'AVAILABLE', 'POSTED refunds by refunded_at VN month', array['refunds'], 'PERIOD', refund_count, 0),
      'opex_cash_out', vibe_financial_report_private.metric('OPEX_CASH_OUT', null, 'NOT_IMPLEMENTED', 'No operating-expense payment ledger', array[]::text[], 'PERIOD', 0, 0),
      'other_operating_in', vibe_financial_report_private.metric('OTHER_OPERATING_IN', null, 'NOT_IMPLEMENTED', 'No source', array[]::text[], 'PERIOD', 0, 0),
      'loan_drawdown', vibe_financial_report_private.metric('LOAN_DRAWDOWN', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD', 0, 0),
      'loan_principal_out', vibe_financial_report_private.metric('LOAN_PRINCIPAL_OUT', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD', 0, 0),
      'loan_interest_out', vibe_financial_report_private.metric('LOAN_INTEREST_OUT', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD', 0, 0),
      'vendor_out', vibe_financial_report_private.metric('VENDOR_OUT', null, 'NOT_IMPLEMENTED', 'No AP payment source', array[]::text[], 'PERIOD', 0, 0),
      'tax_fee_out', vibe_financial_report_private.metric('TAX_FEE_OUT', null, 'NOT_IMPLEMENTED', 'No tax payment source', array[]::text[], 'PERIOD', 0, 0),
      'capex_out', vibe_financial_report_private.metric('CAPEX_OUT', null, 'NOT_IMPLEMENTED', 'No capex source', array[]::text[], 'PERIOD', 0, 0),
      'total_in_integrated', vibe_financial_report_private.metric('TOTAL_CASH_IN', total_in, 'AVAILABLE', 'Sum of AVAILABLE inflows only', array['payments'], 'PERIOD', payment_count, 0),
      'total_out_integrated', vibe_financial_report_private.metric('TOTAL_CASH_OUT', total_out, 'AVAILABLE', 'Sum of AVAILABLE outflows only', array['payroll_disbursements','refunds'], 'PERIOD', disbursement_count + refund_count, 0),
      'net_integrated', vibe_financial_report_private.metric('NET_CASH', net_cash, 'AVAILABLE', 'Dòng tiền trên các nguồn đã tích hợp', array['payments','payroll_disbursements','refunds'], 'PERIOD', 0, 0),
      'label', 'Dòng tiền trên các nguồn đã tích hợp'
    ),
    'receivables', jsonb_build_object(
      'current_tuition_receivable', vibe_financial_report_private.metric(
        'CURRENT_RECEIVABLE', current_ar, 'AVAILABLE', 'Công nợ hiện tại from ISSUED invoice_receivables', array['invoice_receivables'], 'LIVE', 0, 0
      ),
      'opening_receivable_current', vibe_financial_report_private.metric(
        'OPENING_RECEIVABLE_CURRENT', opening_ar, 'AVAILABLE', 'Opening AR not reversed', array['opening_receivable_balances'], 'LIVE', 0, 0
      ),
      'month_end_receivable', vibe_financial_report_private.metric(
        'MONTH_END_RECEIVABLE', null, 'NOT_IMPLEMENTED', 'No as-of reconstruction or snapshot', array[]::text[], 'SNAPSHOT', 0, 0
      )
    ),
    'obligations', jsonb_build_object(
      'payroll_recognized_payable', vibe_financial_report_private.metric(
        'PAYROLL_PAYABLE', recognized_payable, 'AVAILABLE', 'Net obligation of APPROVED and FINALIZED payrolls', array['teacher_payrolls'], 'PERIOD', payroll_count, 0
      ),
      'payroll_disbursable_remaining', vibe_financial_report_private.metric(
        'PAYROLL_DISBURSABLE_REMAINING',
        remaining_disbursable,
        case when integrity_warning then 'PARTIAL' else 'AVAILABLE' end,
        case
          when integrity_warning then 'Paid exceeds payable'
          when disbursable_payable = 0 then 'Không có bảng lương FINALIZED'
          when paid_amount = 0 then 'Có thể ghi nhận chi trả'
          when remaining_disbursable > 0 then 'Đã ghi nhận chi trả một phần'
          else 'Đã ghi nhận đủ chi trả'
        end,
        array['payroll_disbursements'],
        'PERIOD',
        payroll_count,
        case when integrity_warning then 1 else 0 end
      ),
      'payroll_paid_amount', to_jsonb(paid_amount),
      'payroll_approved_not_disbursable_label', 'Đã ghi nhận, chưa được phép chi',
      'opex_payable', vibe_financial_report_private.metric('OPEX_PAYABLE', null, 'NOT_IMPLEMENTED', 'RECORDED is not a payable contract', array[]::text[], 'PERIOD', 0, 0),
      'loan_balance', vibe_financial_report_private.metric('LOAN_BALANCE', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD', 0, 0),
      'integrity_warning', integrity_warning
    ),
    'counts', jsonb_build_object(
      'tuition_terms', tuition_count,
      'unresolved_tuition_terms', revenue_unresolved,
      'opex_recorded', opex_record_count,
      'opex_eligible', opex_eligible,
      'opex_unplanned', opex_unplanned,
      'payments', payment_count,
      'refunds', refund_count,
      'disbursements', disbursement_count,
      'payrolls', payroll_count,
      'travel_actions', travel_action_count,
      'travel_allowances', travel_allowance_count
    )
  );
end;
$fn$;

create or replace function vibe_financial_report_private.conclusions(p_current jsonb, p_currency text)
returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $fn$
declare
  facts jsonb := '[]'::jsonb;
  observations jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  executive jsonb := '[]'::jsonb;
  revenue numeric := (p_current#>>'{pnl,revenue,value}')::numeric;
  personnel numeric := (p_current#>>'{pnl,personnel_expense,value}')::numeric;
  travel numeric := (p_current#>>'{pnl,travel_reimbursement_expense,value}')::numeric;
  opex numeric := (p_current#>>'{pnl,operating_expense,value}')::numeric;
  opex_plan numeric := (p_current#>>'{operating_expense,planned_known_amount}')::numeric;
  opex_var numeric := (p_current#>>'{operating_expense,variance_amount}')::numeric;
  operating numeric := (p_current#>>'{pnl,operating_result,value}')::numeric;
  net_cash numeric := (p_current#>>'{cash_flow,net_integrated,value}')::numeric;
  current_ar numeric := (p_current#>>'{receivables,current_tuition_receivable,value}')::numeric;
  revenue_status text := p_current#>>'{pnl,revenue,status}';
  personnel_status text := p_current#>>'{pnl,personnel_expense,status}';
  operating_status text := p_current#>>'{pnl,operating_result,status}';
  opex_plan_status text := p_current#>>'{operating_expense,planned_status}';
  money text;
  driver text;
  driver_value numeric;
  total_exp numeric;
begin
  money := p_currency;
  if revenue is not null then
    facts := facts || jsonb_build_array(jsonb_build_object(
      'kind','FACT','code','REVENUE','text',
      case
        when revenue_status = 'PARTIAL' then 'Doanh thu xác định được từ các hồ sơ đủ điều kiện là '||revenue||' '||money||'.'
        else 'Doanh thu ghi nhận trong tháng là '||revenue||' '||money||'.'
      end
    ));
  end if;
  if personnel is not null then
    facts := facts || jsonb_build_array(jsonb_build_object(
      'kind','FACT','code','PERSONNEL','text',
      case
        when personnel_status = 'PARTIAL' then 'Chi phí nhân sự xác định được từ các nguồn đủ điều kiện là '||personnel||' '||money||'.'
        else 'Chi phí nhân sự trong tháng là '||personnel||' '||money||'.'
      end
    ));
  end if;
  if travel is not null then
    facts := facts || jsonb_build_array(jsonb_build_object('kind','FACT','code','TRAVEL','text','Chi phí hoàn trả công tác trong tháng là '||travel||' '||money||'.'));
  end if;
  if opex is not null then
    facts := facts || jsonb_build_array(jsonb_build_object('kind','FACT','code','OPEX','text','Chi phí vận hành đã ghi nhận trong tháng là '||opex||' '||money||'.'));
  end if;
  if operating is not null then
    facts := facts || jsonb_build_array(jsonb_build_object(
      'kind','FACT','code','OPERATING_RESULT','text',
      case
        when operating_status = 'PARTIAL' then 'Kết quả hoạt động xác định được từ các nguồn đủ điều kiện là '||operating||' '||money||'.'
        else 'Kết quả hoạt động từ các nguồn đã tích hợp là '||operating||' '||money||'.'
      end
    ));
  end if;
  if net_cash is not null then
    facts := facts || jsonb_build_array(jsonb_build_object('kind','FACT','code','NET_CASH','text','Dòng tiền thuần trên các nguồn đã tích hợp là '||net_cash||' '||money||'.'));
  end if;
  if current_ar is not null then
    facts := facts || jsonb_build_array(jsonb_build_object('kind','FACT','code','CURRENT_RECEIVABLE','text','Công nợ hiện tại là '||current_ar||' '||money||'.'));
  end if;

  if opex is not null and opex_var is not null and opex_plan is not null and opex_plan_status = 'AVAILABLE' and opex_plan <> 0 then
    if opex_var > 0 then
      observations := observations || jsonb_build_array(jsonb_build_object('kind','OBSERVATION','code','OPEX_OVER_PLAN','text','Chi phí vận hành cao hơn kế hoạch '||opex_var||' '||money||'.'));
    elsif opex_var < 0 then
      observations := observations || jsonb_build_array(jsonb_build_object('kind','OBSERVATION','code','OPEX_UNDER_PLAN','text','Chi phí vận hành thấp hơn kế hoạch '||abs(opex_var)||' '||money||'.'));
    end if;
  end if;

  if personnel is not null and travel is not null and opex is not null then
    total_exp := personnel + travel + opex;
    if total_exp > 0 then
      driver := 'PERSONNEL';
      driver_value := personnel;
      if travel > driver_value then
        driver := 'TRAVEL';
        driver_value := travel;
      end if;
      if opex > driver_value then
        driver := 'OPERATING';
        driver_value := opex;
      end if;
      observations := observations || jsonb_build_array(jsonb_build_object(
        'kind','OBSERVATION',
        'code','COST_DRIVER',
        'text', case driver
          when 'PERSONNEL' then 'Chi phí nhân sự là nhóm chi phí lớn nhất trong các nhóm đã tích hợp.'
          when 'TRAVEL' then 'Chi phí hoàn trả công tác là nhóm chi phí lớn nhất trong các nhóm đã tích hợp.'
          else 'Chi phí vận hành là nhóm chi phí lớn nhất trong các nhóm đã tích hợp.'
        end
      ));
    end if;
  end if;

  warnings := warnings || jsonb_build_array(jsonb_build_object(
    'kind','WARNING','code','MANAGEMENT_RESULT',
    'text','Chưa đủ nguồn dữ liệu để kết luận kết quả quản trị sau chi phí tài chính.'
  ));
  warnings := warnings || jsonb_build_array(jsonb_build_object(
    'kind','WARNING','code','OPEX_CASH',
    'text','Chi phí vận hành đã ghi nhận không đồng nghĩa đã thanh toán.'
  ));
  warnings := warnings || jsonb_build_array(jsonb_build_object(
    'kind','WARNING','code','MONTH_END_RECEIVABLE',
    'text','Công nợ phải thu đang là công nợ hiện tại, không phải công nợ cuối tháng.'
  ));
  warnings := warnings || jsonb_build_array(jsonb_build_object(
    'kind','WARNING','code','LOAN',
    'text','Chưa có nguồn dữ liệu khoản vay được xác nhận.'
  ));
  if revenue_status = 'PARTIAL' then
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'kind','WARNING','code','CANCELLATION',
      'text','Một số kỳ học phí CANCELLED chưa có ngày hủy có hiệu lực. Doanh thu tháng này PARTIAL, không phải doanh thu tháng đầy đủ.'
    ));
  end if;
  if personnel_status = 'PARTIAL' then
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'kind','WARNING','code','ADJUSTMENT',
      'text','Có khoản điều chỉnh lương chưa phân loại. Chi phí nhân sự PARTIAL.'
    ));
  end if;

  if operating is not null then
    executive := executive || jsonb_build_array(jsonb_build_object(
      'kind','FACT','code','RESULT','text',
      case
        when operating_status = 'PARTIAL' then 'Kết quả hoạt động xác định được từ các nguồn đủ điều kiện là '||operating||' '||money||'.'
        else 'Kết quả hoạt động từ các nguồn đã tích hợp là '||operating||' '||money||'.'
      end
    ));
  end if;
  if jsonb_array_length(observations) > 0 then
    executive := executive || observations->0;
  end if;
  if net_cash is not null then
    executive := executive || jsonb_build_array(jsonb_build_object('kind','FACT','code','CASH','text','Dòng tiền thuần trên các nguồn đã tích hợp là '||net_cash||' '||money||'.'));
  end if;
  if current_ar is not null then
    executive := executive || jsonb_build_array(jsonb_build_object('kind','FACT','code','RECEIVABLE','text','Công nợ hiện tại là '||current_ar||' '||money||'.'));
  end if;
  executive := executive || jsonb_build_array(jsonb_build_object(
    'kind','WARNING','code','FINANCIAL_COST',
    'text','Chưa đủ nguồn dữ liệu để kết luận kết quả quản trị sau chi phí tài chính.'
  ));
  if jsonb_array_length(executive) > 5 then
    executive := (select jsonb_agg(value) from jsonb_array_elements(executive) with ordinality t(value, ord) where ord <= 5);
  end if;

  return jsonb_build_object('facts', facts, 'observations', observations, 'warnings', warnings, 'executive', executive);
end;
$fn$;

create or replace function public.get_financial_management_report(
  p_month date,
  p_branch uuid default null,
  p_currency text default 'VND'
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  month_start date := vibe_financial_report_private.month_start(p_month);
  previous_month date;
  currency text := upper(btrim(coalesce(p_currency, '')));
  branches uuid[];
  branch_name text;
  current_metrics jsonb;
  previous_metrics jsonb;
  trend jsonb := '[]'::jsonb;
  i integer;
  m date;
  slice jsonb;
  source_status jsonb;
  branch_rows jsonb;
  changes jsonb;
begin
  if auth.uid() is null or not vibe_financial_report_private.authorized(p_branch) then
    raise exception 'FINANCIAL_REPORT_UNAUTHORIZED';
  end if;
  if month_start is null then
    raise exception 'FINANCIAL_REPORT_INVALID_MONTH';
  end if;
  if currency !~ '^[A-Z]{3}$' then
    raise exception 'FINANCIAL_REPORT_INVALID_CURRENCY';
  end if;

  select array_agg(s.id), max(s.name) filter (where p_branch is not null)
  into branches, branch_name
  from vibe_financial_report_private.scope_branches(p_branch) s;

  if branches is null then
    branches := array[]::uuid[];
  end if;

  previous_month := (month_start - interval '1 month')::date;
  current_metrics := vibe_financial_report_private.month_metrics(month_start, branches, currency);
  previous_metrics := vibe_financial_report_private.month_metrics(previous_month, branches, currency);

  for i in 0..11 loop
    m := (month_start - make_interval(months => 11 - i))::date;
    slice := vibe_financial_report_private.month_metrics(m, branches, currency);
    trend := trend || jsonb_build_array(jsonb_build_object(
      'month', m,
      'revenue', slice#>'{pnl,revenue}',
      'personnel_expense', slice#>'{pnl,personnel_expense}',
      'travel_expense', slice#>'{pnl,travel_reimbursement_expense}',
      'operating_expense', slice#>'{pnl,operating_expense}',
      'operating_result', slice#>'{pnl,operating_result}',
      'cash_in_integrated', slice#>'{cash_flow,total_in_integrated}',
      'cash_out_integrated', slice#>'{cash_flow,total_out_integrated}',
      'net_cash_integrated', slice#>'{cash_flow,net_integrated}'
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id', b.id,
    'branch_name', b.name,
    'metrics', vibe_financial_report_private.month_metrics(month_start, array[b.id], currency)
  ) order by b.name, b.id), '[]'::jsonb)
  into branch_rows
  from vibe_financial_report_private.scope_branches(p_branch) b;

  changes := jsonb_build_object(
    'revenue', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{pnl,revenue,value}')::numeric, (previous_metrics#>>'{pnl,revenue,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{pnl,revenue,value}')::numeric, (previous_metrics#>>'{pnl,revenue,value}')::numeric))
    ),
    'personnel_expense', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{pnl,personnel_expense,value}')::numeric, (previous_metrics#>>'{pnl,personnel_expense,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{pnl,personnel_expense,value}')::numeric, (previous_metrics#>>'{pnl,personnel_expense,value}')::numeric))
    ),
    'travel_reimbursement_expense', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{pnl,travel_reimbursement_expense,value}')::numeric, (previous_metrics#>>'{pnl,travel_reimbursement_expense,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{pnl,travel_reimbursement_expense,value}')::numeric, (previous_metrics#>>'{pnl,travel_reimbursement_expense,value}')::numeric))
    ),
    'operating_expense', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{pnl,operating_expense,value}')::numeric, (previous_metrics#>>'{pnl,operating_expense,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{pnl,operating_expense,value}')::numeric, (previous_metrics#>>'{pnl,operating_expense,value}')::numeric))
    ),
    'operating_result', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{pnl,operating_result,value}')::numeric, (previous_metrics#>>'{pnl,operating_result,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{pnl,operating_result,value}')::numeric, (previous_metrics#>>'{pnl,operating_result,value}')::numeric))
    ),
    'tuition_cash_in', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{cash_flow,tuition_cash_in,value}')::numeric, (previous_metrics#>>'{cash_flow,tuition_cash_in,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{cash_flow,tuition_cash_in,value}')::numeric, (previous_metrics#>>'{cash_flow,tuition_cash_in,value}')::numeric))
    ),
    'payroll_cash_out', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{cash_flow,payroll_cash_out,value}')::numeric, (previous_metrics#>>'{cash_flow,payroll_cash_out,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{cash_flow,payroll_cash_out,value}')::numeric, (previous_metrics#>>'{cash_flow,payroll_cash_out,value}')::numeric))
    ),
    'refund_cash_out', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{cash_flow,refund_cash_out,value}')::numeric, (previous_metrics#>>'{cash_flow,refund_cash_out,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{cash_flow,refund_cash_out,value}')::numeric, (previous_metrics#>>'{cash_flow,refund_cash_out,value}')::numeric))
    ),
    'net_integrated', jsonb_build_object(
      'amount', to_jsonb(vibe_financial_report_private.delta((current_metrics#>>'{cash_flow,net_integrated,value}')::numeric, (previous_metrics#>>'{cash_flow,net_integrated,value}')::numeric)),
      'pct', to_jsonb(vibe_financial_report_private.change_pct((current_metrics#>>'{cash_flow,net_integrated,value}')::numeric, (previous_metrics#>>'{cash_flow,net_integrated,value}')::numeric))
    )
  );

  source_status := jsonb_build_array(
    current_metrics#>'{pnl,revenue}',
    current_metrics#>'{pnl,personnel_expense}',
    current_metrics#>'{pnl,travel_reimbursement_expense}',
    current_metrics#>'{pnl,operating_expense}',
    current_metrics#>'{operating_expense,plan}',
    current_metrics#>'{pnl,other_operating_expense}',
    current_metrics#>'{pnl,operating_result}',
    current_metrics#>'{pnl,management_result}',
    current_metrics#>'{cash_flow,tuition_cash_in}',
    current_metrics#>'{cash_flow,payroll_cash_out}',
    current_metrics#>'{cash_flow,refund_cash_out}',
    current_metrics#>'{cash_flow,opex_cash_out}',
    current_metrics#>'{cash_flow,loan_drawdown}',
    current_metrics#>'{receivables,current_tuition_receivable}',
    current_metrics#>'{receivables,month_end_receivable}',
    current_metrics#>'{obligations,opex_payable}',
    current_metrics#>'{obligations,loan_balance}'
  );

  return jsonb_build_object(
    'period', jsonb_build_object(
      'month', month_start,
      'previous_month', previous_month,
      'timezone', 'Asia/Ho_Chi_Minh'
    ),
    'scope', jsonb_build_object(
      'type', case when p_branch is null then 'CONSOLIDATED' else 'BRANCH' end,
      'branch_id', p_branch,
      'branch_name', branch_name
    ),
    'currency', currency,
    'generated_at', clock_timestamp(),
    'source_status', source_status,
    'pnl', current_metrics->'pnl',
    'operating_expense', current_metrics->'operating_expense',
    'cash_flow', current_metrics->'cash_flow',
    'receivables', current_metrics->'receivables',
    'obligations', current_metrics->'obligations',
    'branches', branch_rows,
    'previous_period', jsonb_build_object('metrics', previous_metrics, 'changes', changes),
    'trend_12_months', trend,
    'conclusions', vibe_financial_report_private.conclusions(current_metrics, currency),
    'source_refs', jsonb_build_object(
      'strategy', 'counts_and_drill_filters',
      'month', month_start,
      'branch_ids', to_jsonb(branches),
      'currency', currency,
      'counts', current_metrics->'counts'
    )
  );
end;
$fn$;

revoke all on function public.get_financial_management_report(date, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.get_financial_management_report(date, uuid, text) to authenticated;

do $verify$
begin
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.get_financial_management_report(date,uuid,text)')
      and p.prosecdef
      and coalesce(p.proconfig @> array['search_path=public, pg_temp'], false)
  ) then
    raise exception 'VIBE_FINANCIAL_REPORT_SECURITY_VERIFY_FAILED';
  end if;
  if has_function_privilege('anon', 'public.get_financial_management_report(date,uuid,text)', 'EXECUTE') then
    raise exception 'VIBE_FINANCIAL_REPORT_ANON_EXECUTE_STILL_PRESENT';
  end if;
end;
$verify$;

commit;
