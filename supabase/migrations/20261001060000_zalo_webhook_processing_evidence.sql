-- Preserve failed correlation for replay; a receipt is never a tuition reply.
create table public.zalo_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default clock_timestamp(),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  event_type text,
  message_id text,
  tracking_id text,
  verified boolean not null,
  http_status integer not null check (http_status between 100 and 599),
  outcome text not null,
  console_test boolean not null
);
alter table public.zalo_webhook_receipts enable row level security;
revoke all on public.zalo_webhook_receipts from public, anon, authenticated, service_role;
grant select on public.zalo_webhook_receipts to authenticated;
create policy zalo_webhook_receipts_admin_read on public.zalo_webhook_receipts
  for select to authenticated using (public.has_role('SUPER_ADMIN'));

create function public.record_zalo_webhook_receipt(p_receipt jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.zalo_webhook_receipts(payload_digest,event_type,message_id,tracking_id,verified,http_status,outcome,console_test)
  values (p_receipt->>'payloadDigest',left(p_receipt->>'eventName',80),left(p_receipt->>'messageId',80),left(p_receipt->>'trackingId',80),
    (p_receipt->>'verified')::boolean,(p_receipt->>'httpStatus')::integer,left(p_receipt->>'outcome',80),(p_receipt->>'consoleTest')::boolean);
$$;
revoke all on function public.record_zalo_webhook_receipt(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_zalo_webhook_receipt(jsonb) to service_role;

create function public.process_tuition_zalo_webhook(p_event_id uuid, p_oa_id text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare event public.integration_webhook_events; applied text;
begin
  select * into event from public.integration_webhook_events
    where id=p_event_id and provider='ZALO' and event_type='user_click_response_button' and status='ACCEPTED'
    for update;
  if not found then return 'missing_event'; end if;
  if event.processed_at is not null then return 'duplicate'; end if;
  begin
    applied := public.apply_tuition_zalo_response(event.payload,p_oa_id);
    if applied in ('recorded','duplicate','conflict') then
      perform public.mark_zalo_webhook_processed(event.id,null);
    else
      perform public.mark_zalo_webhook_processed(event.id,upper(coalesce(applied,'APPLY_FAILED')));
    end if;
  exception when others then
    perform public.mark_zalo_webhook_processed(event.id,'APPLY_FAILED');
    return 'apply_failed';
  end;
  return applied;
end $$;
revoke all on function public.process_tuition_zalo_webhook(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.process_tuition_zalo_webhook(uuid,text) to service_role;

create or replace function public.replay_pending_tuition_zalo_clicks(p_oa_id text,p_limit integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare event record; applied text; replayed integer:=0;
begin
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' or p_limit is null or p_limit<1 or p_limit>20 then return 0; end if;
  for event in select id from public.integration_webhook_events
    where provider='ZALO' and event_type='user_click_response_button' and status='ACCEPTED'
      and processed_at is null and attempt_count<8 and received_at<clock_timestamp()-interval '15 seconds'
    order by received_at,id limit p_limit for update skip locked
  loop
    applied:=public.process_tuition_zalo_webhook(event.id,p_oa_id);
    if applied in ('recorded','duplicate','conflict') then replayed:=replayed+1; end if;
  end loop;
  return replayed;
end $$;
