-- One durable request key per actual receipt entry. Allocation remains separate.
create table public.payment_entry_requests (
 request_id uuid primary key,
 created_by uuid not null references auth.users(id),
 payload jsonb not null,
 payment_id uuid not null unique references public.payments(id),
 created_at timestamptz not null default now()
);
alter table public.payment_entry_requests enable row level security;
revoke all on public.payment_entry_requests from public, anon, authenticated;
create function public.create_payment_once(
 p_idempotency_key uuid, p_student_id uuid, p_branch_id uuid, p_amount numeric,
 p_currency text, p_payment_method text, p_paid_at timestamptz,
 p_reference text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare request public.payment_entry_requests; payload jsonb; payment uuid;
begin
 if not coalesce(public.has_role('SUPER_ADMIN'),false) or auth.uid() is null then raise exception 'SUPER_ADMIN role required'; end if;
 if p_idempotency_key is null then raise exception 'Payment request key required'; end if;
 payload := jsonb_build_object('student',p_student_id,'branch',p_branch_id,'amount',p_amount,
  'currency',upper(trim(p_currency)),'method',upper(trim(p_payment_method)),
  'paid_at',extract(epoch from p_paid_at),'reference',nullif(trim(p_reference),''),'notes',nullif(trim(p_notes),''));
 -- Serialize identical keys before creating cash; transaction rollback releases both.
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
 select * into request from public.payment_entry_requests where request_id=p_idempotency_key;
 if found then
  if request.created_by is distinct from auth.uid() or request.payload is distinct from payload then
   raise exception 'Payment request key reused with different input';
  end if;
  return request.payment_id;
 end if;
 payment := public.create_payment(p_student_id,p_branch_id,p_amount,p_currency,p_payment_method,p_paid_at,p_reference,p_notes);
 insert into public.payment_entry_requests(request_id,created_by,payload,payment_id)
 values(p_idempotency_key,auth.uid(),payload,payment);
 return payment;
end $$;
revoke all on function public.create_payment_once(uuid,uuid,uuid,numeric,text,text,timestamptz,text,text) from public,anon;
grant execute on function public.create_payment_once(uuid,uuid,uuid,numeric,text,text,timestamptz,text,text) to authenticated;
