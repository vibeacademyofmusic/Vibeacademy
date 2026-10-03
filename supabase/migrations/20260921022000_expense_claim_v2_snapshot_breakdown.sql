-- Corrective follow-up: expose database-calculated exact category subtotals and trip context.
-- The preceding migration is already applied locally and is intentionally not edited.

begin;

create or replace function vibe_expense_private.snapshot(p_claim uuid)
returns jsonb language sql volatile security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'claim', to_jsonb(c) - 'submitted_snapshot',
    'trip', case when c.trip_id is null then null else
      (select jsonb_build_object('id',t.id,'starts_on',t.starts_on,'ends_on',t.ends_on,
        'reason',t.reason,'destination_unit',t.destination_unit)
       from public.employee_trips t where t.id=c.trip_id) end,
    'lines', case when c.claim_model='LEGACY_TRIP_SUMMARY' then
      coalesce((select jsonb_agg(to_jsonb(l) order by l.id)
        from public.employee_expense_claim_lines l where l.claim_id=c.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'items', case when c.claim_model='ITEMIZED_V2' then
      coalesce((select jsonb_agg(to_jsonb(i) order by i.expense_date,i.id)
        from public.employee_expense_claim_items_v2 i where i.claim_id=c.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'category_breakdown', case when c.claim_model='ITEMIZED_V2' then
      coalesce((select jsonb_agg(jsonb_build_object('category_name',x.category_name,'amount',x.amount) order by x.category_name)
        from (select i.category_name,sum(i.amount) amount from public.employee_expense_claim_items_v2 i
          where i.claim_id=c.id group by i.category_name) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'total_amount', case when c.claim_model='ITEMIZED_V2' then
      coalesce((select sum(i.amount) from public.employee_expense_claim_items_v2 i where i.claim_id=c.id),0)
      else coalesce((select sum(l.total_amount) from public.employee_expense_claim_lines l where l.claim_id=c.id),0) end,
    'payroll_posting', coalesce((select jsonb_build_object(
        'action_id',a.id,'period_id',a.period_id,'status',a.status,'created_at',a.created_at
      ) from public.payroll_period_actions_v2 a
      where a.source_expense_claim_id=c.id and a.status='ACTIVE'
      order by a.created_at desc limit 1), jsonb_build_object('status','NOT_POSTED')),
    'payment_status','NO_AUTHORITATIVE_PAYMENT_EVIDENCE'
  ) from public.employee_expense_claims c where c.id=p_claim;
$fn$;

commit;
