-- CRM reads Zalo as an explicit channel link. Phone numbers are not identity.

create function public.crm_lead_channel_state(p_lead uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  lead public.crm_leads%rowtype;
  state text;
begin
  if p_lead is null or auth.uid() is null then
    return null;
  end if;
  select * into lead from public.crm_leads where id = p_lead;
  if not found or not public.crm_can('crm.view', lead.branch_id) then
    return null;
  end if;
  select case link.status
    when 'ACTIVE' then 'VERIFIED'
    when 'PENDING' then 'LINKED'
    when 'REVOKED' then 'REVOKED'
    else 'NONE'
  end
  into state
  from public.customer_channel_links link
  where link.provider = 'ZALO'
    and (
      (lead.converted_student_id is not null and link.student_id = lead.converted_student_id)
      or (lead.converted_parent_id is not null and link.parent_id = lead.converted_parent_id)
      or exists (
        select 1 from public.registration_applications app
        where app.id = link.registration_application_id
          and app.crm_lead_id = lead.id
      )
    )
  order by case link.status when 'ACTIVE' then 0 when 'PENDING' then 1 when 'REVOKED' then 2 else 3 end,
    link.created_at desc
  limit 1;
  return coalesce(state, 'NONE');
end;
$$;

revoke all on function public.crm_lead_channel_state(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_lead_channel_state(uuid) to authenticated;
