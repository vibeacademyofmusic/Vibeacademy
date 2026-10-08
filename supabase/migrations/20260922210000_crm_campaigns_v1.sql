-- Sprint 4 campaigns and two separate funnels. No ad platform calls and no guessed spend.

insert into public.permissions(code, name, module)
values
  ('crm.campaign.view', 'View campaigns in an authorized branch', 'crm'),
  ('crm.campaign.manage', 'Create and update campaigns in an authorized branch', 'crm')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('crm.campaign.view', 'crm.campaign.manage')
where r.code = 'BRANCH_ADMIN'
on conflict do nothing;

create table public.crm_campaigns (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 200),
  platform text not null check (platform in ('FACEBOOK', 'GOOGLE', 'TIKTOK', 'ZALO', 'WEBSITE', 'REFERRAL', 'WALK_IN', 'OTHER')),
  channel text check (channel is null or char_length(channel) between 1 and 80),
  branch_id uuid references public.branches(id),
  starts_on date check (starts_on is null or isfinite(starts_on)),
  ends_on date check (ends_on is null or isfinite(ends_on)),
  budget_amount numeric check (budget_amount is null or (budget_amount >= 0 and budget_amount <= 1000000000000 and budget_amount = round(budget_amount, 2))),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'INACTIVE')),
  utm_source text check (utm_source is null or char_length(utm_source) between 1 and 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) between 1 and 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) between 1 and 120),
  utm_content text check (utm_content is null or char_length(utm_content) between 1 and 120),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check ((budget_amount is null) = (currency is null))
);

create index crm_campaigns_branch_idx on public.crm_campaigns(branch_id, status, name);

alter table public.crm_leads
  add column campaign_id uuid references public.crm_campaigns(id),
  add column external_source text check (external_source is null or char_length(external_source) between 1 and 80),
  add column external_lead_id text check (external_lead_id is null or char_length(external_lead_id) between 1 and 120),
  add column campaign_reference text check (campaign_reference is null or char_length(campaign_reference) between 1 and 120),
  add column received_at timestamptz;

create index crm_leads_campaign_idx on public.crm_leads(campaign_id) where campaign_id is not null;

create function public.guard_crm_campaign_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('crm.lead_write', true), '') <> 'on' then
    raise exception 'CRM_CAMPAIGN_DIRECT_WRITE_DENIED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger crm_campaigns_write_guard
before insert or update or delete on public.crm_campaigns
for each row execute function public.guard_crm_campaign_write();

alter table public.crm_campaigns enable row level security;

create policy crm_campaigns_select on public.crm_campaigns
for select to authenticated
using (
  public.account_is_active()
  and (
    public.has_role('SUPER_ADMIN')
    or (branch_id is not null and public.crm_can('crm.campaign.view', branch_id))
  )
);

revoke all on public.crm_campaigns from public, anon, authenticated, service_role;
grant select on public.crm_campaigns to authenticated;

create function public.create_crm_campaign(
  p_request uuid, p_name text, p_platform text, p_channel text, p_branch uuid,
  p_starts_on date, p_ends_on date, p_budget numeric, p_currency text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid;
  name text := public.crm_text(p_name, 200);
  platform text := nullif(upper(btrim(coalesce(p_platform, ''))), '');
  existing public.crm_campaigns%rowtype;
begin
  if p_request is null or name is null or platform is null or platform not in ('FACEBOOK', 'GOOGLE', 'TIKTOK', 'ZALO', 'WEBSITE', 'REFERRAL', 'WALK_IN', 'OTHER') then
    raise exception 'CRM_CAMPAIGN_INVALID';
  end if;
  if p_branch is null then
    if auth.uid() is null or not public.account_is_active() or not public.has_role('SUPER_ADMIN') then
      raise exception 'CRM_CAMPAIGN_UNAUTHORIZED';
    end if;
    actor := auth.uid();
  else
    actor := public.crm_actor('crm.campaign.manage', p_branch);
  end if;
  if (p_budget is null) <> (p_currency is null) or (p_budget is not null and p_budget < 0) then
    raise exception 'CRM_CAMPAIGN_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-campaign:' || p_request::text, 0));
  select * into existing from public.crm_campaigns where id = p_request;
  if found then
    if existing.created_by is distinct from actor or existing.name is distinct from name or existing.branch_id is distinct from p_branch then
      raise exception 'CRM_CAMPAIGN_REQUEST_MISMATCH';
    end if;
    return existing.id;
  end if;
  perform set_config('crm.lead_write', 'on', true);
  insert into public.crm_campaigns(id, name, platform, channel, branch_id, starts_on, ends_on, budget_amount, currency, utm_source, utm_medium, utm_campaign, utm_content, created_by)
  values (p_request, name, platform, public.crm_text(p_channel, 80), p_branch, p_starts_on, p_ends_on, p_budget, nullif(upper(btrim(coalesce(p_currency, ''))), ''), public.crm_text(p_utm_source, 120), public.crm_text(p_utm_medium, 120), public.crm_text(p_utm_campaign, 120), public.crm_text(p_utm_content, 120), actor);
  perform set_config('crm.lead_write', 'off', true);
  return p_request;
end $$;

create function public.set_crm_campaign_status(p_request uuid, p_campaign uuid, p_version integer, p_status text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_campaigns%rowtype;
  next_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
begin
  if next_status is null or next_status not in ('DRAFT', 'ACTIVE', 'INACTIVE') or p_request is null then
    raise exception 'CRM_CAMPAIGN_INVALID';
  end if;
  select * into row from public.crm_campaigns where id = p_campaign for update;
  if not found then raise exception 'CRM_CAMPAIGN_UNAUTHORIZED'; end if;
  if row.branch_id is null then
    if not public.has_role('SUPER_ADMIN') then raise exception 'CRM_CAMPAIGN_UNAUTHORIZED'; end if;
  else
    perform public.crm_actor('crm.campaign.manage', row.branch_id);
  end if;
  if row.version is distinct from p_version then raise exception 'CRM_CAMPAIGN_STALE'; end if;
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_campaigns set status = next_status, version = version + 1, updated_at = clock_timestamp() where id = row.id;
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

create function public.set_crm_lead_campaign(
  p_request uuid, p_lead uuid, p_version integer, p_campaign uuid,
  p_external_source text, p_external_lead_id text, p_campaign_reference text, p_received_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
  campaign public.crm_campaigns%rowtype;
  actor uuid := auth.uid();
  meta jsonb;
begin
  if actor is null or not public.account_is_active() or p_request is null then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if p_campaign is not null then
    select * into campaign from public.crm_campaigns where id = p_campaign;
    if not found or campaign.status = 'INACTIVE' then raise exception 'CRM_CAMPAIGN_INVALID'; end if;
  end if;
  meta := jsonb_build_object('campaign_id', p_campaign, 'external_lead_id', public.crm_text(p_external_lead_id, 120));
  if public.crm_lead_replay(p_request, p_lead, 'UPDATED', actor, null, null, meta, 'crm.lead.update') then
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.update');
  if p_campaign is not null and campaign.branch_id is not null and campaign.branch_id is distinct from row.branch_id then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set
    campaign_id = p_campaign,
    external_source = public.crm_text(p_external_source, 80),
    external_lead_id = public.crm_text(p_external_lead_id, 120),
    campaign_reference = public.crm_text(p_campaign_reference, 120),
    received_at = p_received_at,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, metadata)
  values (p_request, row.id, 'UPDATED', row.status, row.status, actor, meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

create function public.crm_cohort_funnel(p_from date, p_to date, p_branch uuid, p_campaign uuid, p_source text, p_owner uuid, p_program text)
returns table (metric text, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.account_is_active() or p_from is null or p_to is null or p_to < p_from then
    raise exception 'CRM_REPORT_UNAUTHORIZED';
  end if;
  return query
  with visible as (
    select lead.id, lead.created_at, lead.first_contact_at
    from public.crm_leads lead
    where (lead.created_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and public.crm_can('crm.view', lead.branch_id)
      and (p_branch is null or lead.branch_id = p_branch)
      and (p_campaign is null or lead.campaign_id = p_campaign)
      and (p_source is null or lead.source_type = p_source)
      and (p_owner is null or lead.owner_user_id = p_owner)
      and (p_program is null or lead.program_interest = p_program)
  ), ranked as (
    select visible.id, visible.created_at, visible.first_contact_at,
      coalesce(max(case event.to_status
        when 'CONTACTED' then 2 when 'QUALIFIED' then 3 when 'TRIAL_BOOKED' then 4
        when 'TRIAL_COMPLETED' then 5 when 'PROPOSAL_SENT' then 6 when 'NEGOTIATING' then 7
        when 'WON' then 8 else null end), 1) as reached,
      bool_or(event.to_status = 'LOST') as lost,
      min(event.created_at) filter (where event.to_status = 'WON') as won_at
    from visible
    left join public.crm_lead_events event on event.lead_id = visible.id
    group by visible.id, visible.created_at, visible.first_contact_at
  )
  select * from (values
    ('new', (select count(*)::numeric from ranked)),
    ('contacted', (select count(*)::numeric from ranked where reached >= 2)),
    ('qualified', (select count(*)::numeric from ranked where reached >= 3)),
    ('trial_booked', (select count(*)::numeric from ranked where reached >= 4)),
    ('trial_completed', (select count(*)::numeric from ranked where reached >= 5)),
    ('proposal', (select count(*)::numeric from ranked where reached >= 6)),
    ('negotiating', (select count(*)::numeric from ranked where reached >= 7)),
    ('won', (select count(*)::numeric from ranked where reached >= 8)),
    ('lost', (select count(*)::numeric from ranked where lost))
  ) metrics(metric, value)
  union all
  select 'hours_to_first_contact', round(avg(extract(epoch from (first_contact_at - created_at)) / 3600.0)::numeric, 2) from ranked where first_contact_at is not null
  union all
  select 'days_to_close', round(avg(extract(epoch from (won_at - created_at)) / 86400.0)::numeric, 2) from ranked where won_at is not null;
end $$;

create function public.crm_activity_funnel(p_from date, p_to date, p_branch uuid, p_campaign uuid, p_source text, p_owner uuid, p_program text)
returns table (metric text, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.account_is_active() or p_from is null or p_to is null or p_to < p_from then
    raise exception 'CRM_REPORT_UNAUTHORIZED';
  end if;
  return query
  with hits as (
    select event.event_type
    from public.crm_lead_events event
    join public.crm_leads lead on lead.id = event.lead_id
    where (event.created_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and public.crm_can('crm.view', lead.branch_id)
      and (p_branch is null or lead.branch_id = p_branch)
      and (p_campaign is null or lead.campaign_id = p_campaign)
      and (p_source is null or lead.source_type = p_source)
      and (p_owner is null or lead.owner_user_id = p_owner)
      and (p_program is null or lead.program_interest = p_program)
      and event.event_type in ('CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATION_UPDATED', 'WON', 'LOST')
  )
  select * from (values
    ('contacted', (select count(*)::numeric from hits where event_type = 'CONTACTED')),
    ('qualified', (select count(*)::numeric from hits where event_type = 'QUALIFIED')),
    ('trial_booked', (select count(*)::numeric from hits where event_type = 'TRIAL_BOOKED')),
    ('trial_completed', (select count(*)::numeric from hits where event_type = 'TRIAL_COMPLETED')),
    ('proposal', (select count(*)::numeric from hits where event_type = 'PROPOSAL_SENT')),
    ('negotiating', (select count(*)::numeric from hits where event_type = 'NEGOTIATION_UPDATED')),
    ('won', (select count(*)::numeric from hits where event_type = 'WON')),
    ('lost', (select count(*)::numeric from hits where event_type = 'LOST'))
  ) metrics(metric, value);
end $$;

create function public.crm_campaign_summary()
returns table (campaign_id uuid, leads bigint, qualified bigint, won bigint, lost bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with visible as (
    select lead.campaign_id,
      coalesce(max(case event.to_status
        when 'QUALIFIED' then 3 when 'TRIAL_BOOKED' then 4 when 'TRIAL_COMPLETED' then 5
        when 'PROPOSAL_SENT' then 6 when 'NEGOTIATING' then 7 when 'WON' then 8 else null end), 1) as reached,
      bool_or(event.to_status = 'LOST') as lost
    from public.crm_leads lead
    left join public.crm_lead_events event on event.lead_id = lead.id
    where lead.campaign_id is not null
      and public.crm_can('crm.campaign.view', lead.branch_id)
    group by lead.id, lead.campaign_id
  )
  select visible.campaign_id, count(*)::bigint,
    count(*) filter (where visible.reached >= 3)::bigint,
    count(*) filter (where visible.reached >= 8)::bigint,
    count(*) filter (where visible.lost)::bigint
  from visible
  group by visible.campaign_id
$$;

revoke all on function
  public.guard_crm_campaign_write(),
  public.create_crm_campaign(uuid, text, text, text, uuid, date, date, numeric, text, text, text, text, text),
  public.set_crm_campaign_status(uuid, uuid, integer, text),
  public.set_crm_lead_campaign(uuid, uuid, integer, uuid, text, text, text, timestamptz),
  public.crm_cohort_funnel(date, date, uuid, uuid, text, uuid, text),
  public.crm_activity_funnel(date, date, uuid, uuid, text, uuid, text),
  public.crm_campaign_summary()
from public, anon, authenticated, service_role;

grant execute on function public.create_crm_campaign(uuid, text, text, text, uuid, date, date, numeric, text, text, text, text, text) to authenticated;
grant execute on function public.set_crm_campaign_status(uuid, uuid, integer, text) to authenticated;
grant execute on function public.set_crm_lead_campaign(uuid, uuid, integer, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.crm_cohort_funnel(date, date, uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.crm_activity_funnel(date, date, uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.crm_campaign_summary() to authenticated;

create function public.update_crm_campaign(
  p_campaign uuid, p_version integer, p_name text, p_channel text,
  p_starts_on date, p_ends_on date, p_budget numeric, p_currency text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_campaigns%rowtype;
  next_name text := public.crm_text(p_name, 200);
begin
  if next_name is null or (p_budget is null) <> (p_currency is null) or (p_budget is not null and p_budget < 0) then
    raise exception 'CRM_CAMPAIGN_INVALID';
  end if;
  select * into row from public.crm_campaigns where id = p_campaign for update;
  if not found then raise exception 'CRM_CAMPAIGN_UNAUTHORIZED'; end if;
  if row.branch_id is null then
    if not public.has_role('SUPER_ADMIN') then raise exception 'CRM_CAMPAIGN_UNAUTHORIZED'; end if;
  elsif not coalesce(public.crm_can('crm.campaign.manage', row.branch_id), false) then
    raise exception 'CRM_CAMPAIGN_UNAUTHORIZED';
  end if;
  if row.version is distinct from p_version then raise exception 'CRM_CAMPAIGN_STALE'; end if;
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_campaigns set
    name = next_name,
    channel = public.crm_text(p_channel, 80),
    starts_on = p_starts_on,
    ends_on = p_ends_on,
    budget_amount = p_budget,
    currency = nullif(upper(btrim(coalesce(p_currency, ''))), ''),
    utm_source = public.crm_text(p_utm_source, 120),
    utm_medium = public.crm_text(p_utm_medium, 120),
    utm_campaign = public.crm_text(p_utm_campaign, 120),
    utm_content = public.crm_text(p_utm_content, 120),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

revoke all on function public.update_crm_campaign(uuid, integer, text, text, date, date, numeric, text, text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.update_crm_campaign(uuid, integer, text, text, date, date, numeric, text, text, text, text, text) to authenticated;
