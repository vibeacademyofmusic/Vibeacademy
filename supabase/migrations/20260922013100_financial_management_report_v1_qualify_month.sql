-- Qualify month_start inside month_metrics. Additive replace of one private function.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, extensions, pg_temp;

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
  travel_value numeric;
  opex_recorded numeric;
  opex_planned numeric;
  opex_plan_partial boolean := false;
  opex_variance numeric;
  other_opex jsonb;
  operating_result numeric;
  operating_status text;
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
  unclassified_adj boolean := false;
  legacy_partial boolean := false;
  tuition_count integer := 0;
  opex_record_count integer := 0;
  payment_count integer := 0;
  refund_count integer := 0;
  disbursement_count integer := 0;
  payroll_count integer := 0;
  travel_action_count integer := 0;
  by_category jsonb;
  by_branch jsonb;
begin
  select
    coalesce(sum(a.amount) filter (where not a.unresolved), 0),
    count(*) filter (where a.unresolved),
    count(distinct a.tuition_id) filter (where not a.unresolved)
  into revenue_value, revenue_unresolved, tuition_count
  from vibe_financial_report_private.tuition_month_amounts(p_branches, p_currency) a
  where a.month_start = v_month_start;

  if revenue_unresolved > 0 and tuition_count = 0 and revenue_value = 0 then
    revenue_value := null;
    revenue_status := 'PARTIAL';
  elsif revenue_unresolved > 0 then
    revenue_status := 'PARTIAL';
  else
    revenue_status := 'AVAILABLE';
  end if;

  select coalesce(bool_or(pay.adjustment_amount <> 0), false)
  into unclassified_adj
  from public.teacher_payrolls pay
  join public.payroll_periods per on per.id = pay.period_id
  where per.status in ('APPROVED', 'FINALIZED')
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and pay.currency = p_currency;

  select coalesce(bool_or(coalesce(pay.calculation_version, '') not like 'PAYROLL_V2%'), false)
  into legacy_partial
  from public.teacher_payrolls pay
  join public.payroll_periods per on per.id = pay.period_id
  where per.status in ('APPROVED', 'FINALIZED')
    and per.starts_on = v_month_start
    and pay.branch_id = any(p_branches)
    and pay.currency = p_currency
    and coalesce(pay.calculation_version, '') not like 'PAYROLL_V2%'
    and pay.adjustment_amount <> 0;

  select coalesce((
    select sum(x.personnel)
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
          else coalesce((
            select sum(e.amount) from public.payroll_earning_lines e where e.payroll_id = pay.id
          ), 0)
        end as personnel
      from public.teacher_payrolls pay
      join public.payroll_periods per on per.id = pay.period_id
      where per.status in ('APPROVED', 'FINALIZED')
        and per.starts_on = v_month_start
        and pay.branch_id = any(p_branches)
        and pay.currency = p_currency
    ) x
  ), 0)
  into personnel_value;

  personnel_status := case
    when unclassified_adj or legacy_partial then 'PARTIAL'
    else 'AVAILABLE'
  end;

  select coalesce(sum(a.amount), 0), count(*)
  into travel_value, travel_action_count
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

  select
    coalesce(sum(r.actual_amount) filter (where r.status = 'RECORDED'), 0),
    sum(r.expected_amount) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is not null),
    coalesce(bool_or(r.status in ('DRAFT', 'RECORDED') and r.expected_amount is null), false),
    count(*) filter (where r.status = 'RECORDED')
  into opex_recorded, opex_planned, opex_plan_partial, opex_record_count
  from public.operating_expense_records r
  where r.expense_month = v_month_start
    and r.branch_id = any(p_branches)
    and r.currency = p_currency;

  if opex_planned is not null and not opex_plan_partial then
    opex_variance := opex_recorded - opex_planned;
  else
    opex_variance := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'category', x.category,
    'planned', to_jsonb(x.planned),
    'actual', to_jsonb(x.actual),
    'variance', to_jsonb(case when x.planned is null then null else x.actual - x.planned end),
    'status', case when x.planned is null then 'PARTIAL' else 'AVAILABLE' end
  ) order by x.category), '[]'::jsonb)
  into by_category
  from (
    select
      r.category,
      sum(r.expected_amount) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is not null) as planned,
      coalesce(sum(r.actual_amount) filter (where r.status = 'RECORDED'), 0) as actual
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
    'planned', to_jsonb(x.planned),
    'actual', to_jsonb(coalesce(x.actual, 0)),
    'variance', to_jsonb(case when x.planned is null then null else coalesce(x.actual, 0) - x.planned end)
  ) order by b.name, b.id), '[]'::jsonb)
  into by_branch
  from public.branches b
  left join (
    select
      r.branch_id,
      sum(r.expected_amount) filter (where r.status in ('DRAFT', 'RECORDED') and r.expected_amount is not null) as planned,
      sum(r.actual_amount) filter (where r.status = 'RECORDED') as actual
    from public.operating_expense_records r
    where r.expense_month = v_month_start
      and r.currency = p_currency
      and r.status in ('DRAFT', 'RECORDED')
    group by r.branch_id
  ) x on x.branch_id = b.id
  where b.id = any(p_branches);

  other_opex := vibe_financial_report_private.metric(
    'OTHER_OPERATING_EXPENSE', null, 'NOT_IMPLEMENTED',
    'No other-operating-expense source', array[]::text[], 'PERIOD'
  );

  if revenue_value is null then
    operating_result := null;
    operating_status := 'PARTIAL';
  else
    operating_result := revenue_value - personnel_value - travel_value - opex_recorded;
    operating_status := case
      when revenue_status = 'PARTIAL' or personnel_status = 'PARTIAL' then 'PARTIAL'
      else 'AVAILABLE'
    end;
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
          when revenue_unresolved > 0 then 'CANCELLATION_POLICY_UNRESOLVED'
          else 'Service-period recognition excluding pauses'
        end,
        array['enrollment_tuition.amount','enrollment_pauses'],
        'PERIOD'
      ),
      'personnel_expense', vibe_financial_report_private.metric(
        'PERSONNEL_EXPENSE', personnel_value, personnel_status,
        case
          when unclassified_adj then 'Unclassified payroll adjustment_amount excluded from Personnel Expense'
          else 'V2 earning lines and earning actions; legacy earning lines; deductions and reimbursements excluded'
        end,
        array['payroll_component_lines_v2','payroll_period_actions_v2','payroll_earning_lines'],
        'PERIOD'
      ),
      'travel_reimbursement_expense', vibe_financial_report_private.metric(
        'TRAVEL_REIMBURSEMENT_EXPENSE', travel_value, 'AVAILABLE',
        'ACTIVE TRAVEL_EXPENSE payroll period actions on APPROVED/FINALIZED periods',
        array['payroll_period_actions_v2'],
        'PERIOD'
      ),
      'operating_expense', vibe_financial_report_private.metric(
        'OPERATING_EXPENSE', opex_recorded, 'AVAILABLE',
        'RECORDED actual_amount only',
        array['operating_expense_records'],
        'PERIOD'
      ),
      'other_operating_expense', other_opex,
      'operating_result', vibe_financial_report_private.metric(
        'OPERATING_RESULT_KNOWN_SOURCES', operating_result, coalesce(operating_status, 'PARTIAL'),
        'Revenue - Personnel - Travel reimbursement - Operating expense. Other operating expense is out of V1 scope and not treated as zero.',
        array['enrollment_tuition','teacher_payrolls','operating_expense_records'],
        'PERIOD'
      ),
      'loan_interest_expense', vibe_financial_report_private.metric(
        'LOAN_INTEREST_EXPENSE', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD'
      ),
      'other_financial_expense', vibe_financial_report_private.metric(
        'OTHER_FINANCIAL_EXPENSE', null, 'NOT_IMPLEMENTED', 'Financial-expense domain not implemented', array[]::text[], 'PERIOD'
      ),
      'management_result', vibe_financial_report_private.metric(
        'MANAGEMENT_RESULT', null, 'NOT_IMPLEMENTED', 'Loan/financial expense source unavailable', array[]::text[], 'PERIOD'
      ),
      'management_margin', vibe_financial_report_private.metric(
        'MANAGEMENT_MARGIN', null, 'NOT_IMPLEMENTED', 'Requires management_result', array[]::text[], 'PERIOD'
      )
    ),
    'operating_expense', jsonb_build_object(
      'planned_amount', to_jsonb(opex_planned),
      'recorded_amount', to_jsonb(opex_recorded),
      'variance_amount', to_jsonb(opex_variance),
      'planned_status', case
        when opex_planned is null then 'PARTIAL'
        when opex_plan_partial then 'PARTIAL'
        else 'AVAILABLE'
      end,
      'by_category', by_category,
      'by_branch', by_branch
    ),
    'cash_flow', jsonb_build_object(
      'tuition_cash_in', vibe_financial_report_private.metric('TUITION_CASH_IN', cash_in, 'AVAILABLE', 'POSTED payments.amount by paid_at VN month', array['payments'], 'PERIOD'),
      'payroll_cash_out', vibe_financial_report_private.metric('PAYROLL_CASH_OUT', payroll_out, 'AVAILABLE', 'ACTIVE payroll_disbursements by paid_on', array['payroll_disbursements'], 'PERIOD'),
      'refund_cash_out', vibe_financial_report_private.metric('REFUND_CASH_OUT', refund_out, 'AVAILABLE', 'POSTED refunds by refunded_at VN month', array['refunds'], 'PERIOD'),
      'opex_cash_out', vibe_financial_report_private.metric('OPEX_CASH_OUT', null, 'NOT_IMPLEMENTED', 'No operating-expense payment ledger', array[]::text[], 'PERIOD'),
      'other_operating_in', vibe_financial_report_private.metric('OTHER_OPERATING_IN', null, 'NOT_IMPLEMENTED', 'No source', array[]::text[], 'PERIOD'),
      'loan_drawdown', vibe_financial_report_private.metric('LOAN_DRAWDOWN', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD'),
      'loan_principal_out', vibe_financial_report_private.metric('LOAN_PRINCIPAL_OUT', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD'),
      'loan_interest_out', vibe_financial_report_private.metric('LOAN_INTEREST_OUT', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD'),
      'vendor_out', vibe_financial_report_private.metric('VENDOR_OUT', null, 'NOT_IMPLEMENTED', 'No AP payment source', array[]::text[], 'PERIOD'),
      'tax_fee_out', vibe_financial_report_private.metric('TAX_FEE_OUT', null, 'NOT_IMPLEMENTED', 'No tax payment source', array[]::text[], 'PERIOD'),
      'capex_out', vibe_financial_report_private.metric('CAPEX_OUT', null, 'NOT_IMPLEMENTED', 'No capex source', array[]::text[], 'PERIOD'),
      'total_in_integrated', vibe_financial_report_private.metric('TOTAL_CASH_IN', total_in, 'AVAILABLE', 'Sum of AVAILABLE inflows only', array['payments'], 'PERIOD'),
      'total_out_integrated', vibe_financial_report_private.metric('TOTAL_CASH_OUT', total_out, 'AVAILABLE', 'Sum of AVAILABLE outflows only', array['payroll_disbursements','refunds'], 'PERIOD'),
      'net_integrated', vibe_financial_report_private.metric('NET_CASH', net_cash, 'AVAILABLE', 'Dòng tiền trên các nguồn đã tích hợp', array['payments','payroll_disbursements','refunds'], 'PERIOD'),
      'label', 'Dòng tiền trên các nguồn đã tích hợp'
    ),
    'receivables', jsonb_build_object(
      'current_tuition_receivable', vibe_financial_report_private.metric(
        'CURRENT_RECEIVABLE', current_ar, 'AVAILABLE', 'Công nợ hiện tại from ISSUED invoice_receivables', array['invoice_receivables'], 'LIVE'
      ),
      'opening_receivable_current', vibe_financial_report_private.metric(
        'OPENING_RECEIVABLE_CURRENT', opening_ar, 'AVAILABLE', 'Opening AR not reversed', array['opening_receivable_balances'], 'LIVE'
      ),
      'month_end_receivable', vibe_financial_report_private.metric(
        'MONTH_END_RECEIVABLE', null, 'NOT_IMPLEMENTED', 'No as-of reconstruction or snapshot', array[]::text[], 'SNAPSHOT'
      )
    ),
    'obligations', jsonb_build_object(
      'payroll_recognized_payable', vibe_financial_report_private.metric(
        'PAYROLL_PAYABLE', recognized_payable, 'AVAILABLE', 'Net obligation of APPROVED and FINALIZED payrolls', array['teacher_payrolls'], 'PERIOD'
      ),
      'payroll_disbursable_remaining', vibe_financial_report_private.metric(
        'PAYROLL_DISBURSABLE_REMAINING',
        case when remaining_disbursable < 0 then remaining_disbursable else remaining_disbursable end,
        case when integrity_warning then 'PARTIAL' else 'AVAILABLE' end,
        case
          when integrity_warning then 'Paid exceeds payable'
          when disbursable_payable = 0 then 'Không có bảng lương FINALIZED'
          when paid_amount = 0 then 'Có thể ghi nhận chi trả'
          when remaining_disbursable > 0 then 'Đã chi một phần'
          else 'Đã ghi nhận đủ chi trả'
        end,
        array['payroll_disbursements'],
        'PERIOD'
      ),
      'payroll_paid_amount', to_jsonb(paid_amount),
      'payroll_approved_not_disbursable_label', 'Đã ghi nhận, chưa được phép chi',
      'opex_payable', vibe_financial_report_private.metric('OPEX_PAYABLE', null, 'NOT_IMPLEMENTED', 'RECORDED is not a payable contract', array[]::text[], 'PERIOD'),
      'loan_balance', vibe_financial_report_private.metric('LOAN_BALANCE', null, 'NOT_IMPLEMENTED', 'Loan domain not implemented', array[]::text[], 'PERIOD'),
      'integrity_warning', integrity_warning
    ),
    'counts', jsonb_build_object(
      'tuition_terms', tuition_count,
      'unresolved_tuition_terms', revenue_unresolved,
      'opex_recorded', opex_record_count,
      'payments', payment_count,
      'refunds', refund_count,
      'disbursements', disbursement_count,
      'payrolls', payroll_count,
      'travel_actions', travel_action_count
    )
  );
end;
$fn$;


commit;
