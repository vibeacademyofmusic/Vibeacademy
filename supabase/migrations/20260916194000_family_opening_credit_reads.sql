-- Display canonical balances only; no recalculation, allocation or refund access.
create function public.student_opening_balances(p_student uuid,p_offset integer default 0)
returns table(receivable_id uuid,opening_as_of_date date,currency text,outstanding_balance numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 select b.id,b.opening_as_of_date,b.currency,b.outstanding_balance from opening_receivable_balances b
 where b.student_id=p_student and public.can_read_student_history(p_student,b.branch_id,'tuition')
 order by b.opening_as_of_date desc,b.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
create function public.student_customer_credits(p_student uuid,p_offset integer default 0)
returns table(credit_id uuid,created_at timestamptz,currency text,original_amount numeric,applied_amount numeric,refunded_amount numeric,remaining_credit numeric,voided_amount numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 select c.id,c.created_at,c.currency,c.amount,c.applied_amount,c.refunded_amount,c.remaining_credit,c.voided_amount
 from customer_credit_balances c where c.student_id=p_student and public.can_read_student_history(p_student,c.branch_id,'tuition')
 order by c.created_at desc,c.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
revoke all on function public.student_opening_balances(uuid,integer),public.student_customer_credits(uuid,integer) from public,anon,authenticated;
grant execute on function public.student_opening_balances(uuid,integer),public.student_customer_credits(uuid,integer) to authenticated;
