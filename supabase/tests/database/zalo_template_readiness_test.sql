begin;
select plan(4);

insert into public.notification_jobs(
  id, channel, delivery_mode, template_key, payload, entity_type, entity_id, idempotency_key, status
) values (
  'e9600000-0000-4000-8000-000000000001', 'ZALO', 'LIVE', 'ZALO_REGISTRATION_CONFIRMED',
  '{"title":"preview"}'::jsonb, 'REGISTRATION_COMPLETED', 'e9600000-0000-4000-8000-000000000002',
  'zalo-readiness-accept', 'QUEUED'
);

select is(public.record_zalo_template_acceptance('e9600000-0000-4000-8000-000000000001', 'msg-preview-1'), 'ACCEPTED', 'acceptance is not delivery');
select is((select status from public.notification_jobs where id = 'e9600000-0000-4000-8000-000000000001'), 'SENT', 'accepted job is SENT');
select is((select delivered_at is null from public.notification_jobs where id = 'e9600000-0000-4000-8000-000000000001'), true, 'acceptance leaves delivery empty');
select is(public.record_zalo_template_delivery('msg-preview-1'), 'DELIVERED', 'delivery is a later state');

select * from finish();
rollback;
