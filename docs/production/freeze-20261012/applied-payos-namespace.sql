-- Keep the shared registration/tuition namespace ahead of historical provider orders.
-- Never reduce the sequence or change any existing order's identity.
select pg_advisory_xact_lock(hashtextextended('payos-order-namespace',0));
select setval('public.registration_payos_order_code_seq',greatest(
 (select last_value from public.registration_payos_order_code_seq),
 coalesce((select max(order_code) from public.registration_payos_orders),0),
 coalesce((select max(order_code) from public.tuition_payos_orders),0),
 floor(extract(epoch from clock_timestamp())*1000)::bigint
),true);
