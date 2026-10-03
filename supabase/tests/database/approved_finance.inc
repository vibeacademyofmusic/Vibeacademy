-- Test-only compatibility helpers: old ledger assertions now go through the approved public workflow.
-- SECURITY INVOKER, transaction-local pg_temp; no production helper and no permission bypass.
create function pg_temp.create_refund(p_payment_id uuid,p_amount numeric,p_refunded_at timestamptz,p_reason text,p_notes text default null)
returns uuid language plpgsql as $$ declare r uuid; begin
 r:=public.request_financial_action('REFUND',p_payment_id,jsonb_build_object('amount',p_amount,'refunded_at',p_refunded_at,'notes',p_notes),p_reason,gen_random_uuid());
 return public.approve_financial_action(r,'Ledger regression test','MAKER_CHECKER_EMERGENCY','Explicit local test override');
end $$;
create function pg_temp.allocate_refund_to_payment_allocation(p_refund_id uuid,p_payment_allocation_id uuid,p_amount numeric)
returns uuid language plpgsql as $$ declare r uuid; begin
 r:=public.request_financial_action('ALLOCATE_REFUND',p_refund_id,jsonb_build_object('amount',p_amount,'payment_allocation_id',p_payment_allocation_id),'Ledger allocation test',gen_random_uuid());
 return public.approve_financial_action(r,'Ledger regression test','MAKER_CHECKER_EMERGENCY','Explicit local test override');
end $$;
create function pg_temp.void_payment(p_payment_id uuid,p_reason text) returns void language plpgsql as $$ declare r uuid; begin
 r:=public.request_financial_action('VOID_PAYMENT',p_payment_id,'{}',p_reason,gen_random_uuid());
 perform public.approve_financial_action(r,'Ledger regression test','MAKER_CHECKER_EMERGENCY','Explicit local test override');
end $$;
create function pg_temp.void_refund(p_refund_id uuid,p_reason text) returns void language plpgsql as $$ declare r uuid; begin
 r:=public.request_financial_action('VOID_REFUND',p_refund_id,'{}',p_reason,gen_random_uuid());
 perform public.approve_financial_action(r,'Ledger regression test','MAKER_CHECKER_EMERGENCY','Explicit local test override');
end $$;
create function pg_temp.cancel_invoice(p_invoice_id uuid,p_reason text) returns void language plpgsql as $$ declare r uuid;begin
 if exists(select 1 from public.invoices where id=p_invoice_id and status='DRAFT') then perform public.cancel_invoice(p_invoice_id,p_reason);return;end if;
 r:=public.request_financial_action('CANCEL_INVOICE',p_invoice_id,'{}',p_reason,gen_random_uuid());
 perform public.approve_financial_action(r,'Ledger cancellation test','MAKER_CHECKER_EMERGENCY','Explicit local test override');
end $$;
