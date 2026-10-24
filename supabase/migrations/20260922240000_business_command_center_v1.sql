-- Sprint 7 reads the authoritative CRM, reactivation, campaign, and instrument tables.

create function public.crm_business_snapshot(p_branch uuid)
returns table (metric text, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  month_start date := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'CRM_REPORT_UNAUTHORIZED';
  end if;
  return query
  with leads as (
    select lead.id, lead.status, lead.created_at, lead.next_follow_up_on, lead.campaign_id
    from public.crm_leads lead
    where public.crm_can('crm.view', lead.branch_id)
      and (p_branch is null or lead.branch_id = p_branch)
  ), month_cohort as (
    select leads.id,
      coalesce(max(case event.to_status when 'WON' then 8 else null end), 1) as reached
    from leads
    left join public.crm_lead_events event on event.lead_id = leads.id
    where (leads.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= month_start
    group by leads.id
  ), cases as (
    select item.id, item.status, item.opened_at, item.returned_at
    from public.crm_reactivation_cases item
    where public.crm_can('crm.reactivation.view', item.branch_id)
      and (p_branch is null or item.branch_id = p_branch)
  ), sales as (
    select sale.movement_id, sale.warranty_until
    from public.instrument_events sale
    where sale.kind = 'SALE'
      and public.crm_can('instrument_customer.view', sale.branch_id)
      and (p_branch is null or sale.branch_id = p_branch)
  )
  select * from (values
    ('leads_created_month', (select count(*)::numeric from month_cohort)),
    ('uncontacted', (select count(*)::numeric from leads where status = 'NEW')),
    ('follow_up_today', (select count(*)::numeric from leads where next_follow_up_on = today and status not in ('WON', 'LOST'))),
    ('follow_up_overdue', (select count(*)::numeric from leads where next_follow_up_on < today and status not in ('WON', 'LOST'))),
    ('qualified_now', (select count(*)::numeric from leads where status = 'QUALIFIED')),
    ('negotiating_now', (select count(*)::numeric from leads where status = 'NEGOTIATING')),
    ('trial_today', (select count(*)::numeric from leads where status = 'TRIAL_BOOKED' and next_follow_up_on = today)),
    ('won_cohort_month', (select count(*)::numeric from month_cohort where reached >= 8)),
    ('reactivation_open', (select count(*)::numeric from cases where status not in ('RETURNED', 'NOT_INTERESTED', 'LOST'))),
    ('reactivation_need_contact', (select count(*)::numeric from cases where status = 'NEW_REACTIVATION')),
    ('reactivation_interested', (select count(*)::numeric from cases where status = 'INTERESTED')),
    ('reactivation_returned_month', (select count(*)::numeric from cases where returned_at is not null and (returned_at at time zone 'Asia/Ho_Chi_Minh')::date >= month_start)),
    ('reactivation_opened_month', (select count(*)::numeric from cases where (opened_at at time zone 'Asia/Ho_Chi_Minh')::date >= month_start)),
    ('warranty_active', (select count(*)::numeric from sales where warranty_until >= today)),
    ('warranty_expiring', (select count(*)::numeric from sales where warranty_until between today and today + 30)),
    ('warranty_open', (
      select count(*)::numeric from public.instrument_warranty_cases item
      join sales on sales.movement_id = item.sale_event_id
      where item.status in ('OPEN', 'INSPECTING', 'WAITING_PART', 'IN_REPAIR')
    )),
    ('after_sales_follow_up', (
      select count(*)::numeric from sales
      join lateral (
        select followup.next_follow_up_on, followup.outcome
        from public.instrument_customer_followups followup
        where followup.sale_event_id = sales.movement_id
        order by followup.created_at desc
        limit 1
      ) latest on true
      where latest.next_follow_up_on is not null and latest.next_follow_up_on <= today
    )),
    ('upgrade_opportunities', (
      select count(*)::numeric from sales
      where exists (
        select 1 from public.instrument_customer_followups followup
        where followup.sale_event_id = sales.movement_id and followup.outcome = 'UPGRADE_OPPORTUNITY'
      )
    )),
    ('repurchased', (
      select count(*)::numeric from sales
      where exists (
        select 1 from public.instrument_customer_followups followup
        where followup.sale_event_id = sales.movement_id and followup.outcome = 'REPURCHASED'
      )
    )),
    ('campaigns_active', (
      select count(*)::numeric from public.crm_campaigns campaign
      where campaign.status = 'ACTIVE'
        and (p_branch is null or campaign.branch_id is null or campaign.branch_id = p_branch)
        and (campaign.branch_id is null and public.has_role('SUPER_ADMIN') or campaign.branch_id is not null and public.crm_can('crm.campaign.view', campaign.branch_id))
    ))
  ) metrics(metric, value);
end $$;

revoke all on function public.crm_business_snapshot(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_business_snapshot(uuid) to authenticated;
