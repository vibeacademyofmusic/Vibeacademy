-- Emergency pause; retains every posted receipt, invoice and allocation.
begin;
revoke execute on function public.record_counter_cash(uuid,text,uuid,numeric,numeric,boolean,date,text) from authenticated;
revoke execute on function public.begin_tuition_cash_renewal(uuid,text,text,date,date,text) from authenticated;
commit;
