-- =========================================================
-- LOCK TUITION DISCOUNT AFTER INVOICE CREATION
-- =========================================================
--
-- enrollment_tuition is the pricing source before invoicing.
--
-- Once an invoice exists, the invoice contains an immutable
-- financial snapshot. Tuition discount / final amount must
-- therefore stop changing.
--
-- Later post-invoice adjustments must use Credit / Refund
-- ledger entries instead of rewriting historical tuition.
-- =========================================================


create or replace function
public.guard_enrollment_tuition_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_discount_type text;
  v_discount_value numeric(14,2);
  v_discount_amount numeric(14,2);
  v_amount numeric(14,2);
  v_invoice_exists boolean;
begin

  -- -------------------------------------------------------
  -- Immutable historical identity / snapshots.
  -- -------------------------------------------------------

  if new.enrollment_id <>
       old.enrollment_id

     or new.tuition_plan_id <>
        old.tuition_plan_id

     or new.starts_on <>
        old.starts_on

     or new.base_ends_on <>
        old.base_ends_on

     or new.plan_code_snapshot <>
        old.plan_code_snapshot

     or new.plan_name_snapshot <>
        old.plan_name_snapshot

     or new.duration_months_snapshot <>
        old.duration_months_snapshot

     or new.branch_id_snapshot <>
        old.branch_id_snapshot

     or new.branch_code_snapshot <>
        old.branch_code_snapshot

     or new.branch_name_snapshot <>
        old.branch_name_snapshot

     or new.list_price <>
        old.list_price

     or new.currency <>
        old.currency
  then
    raise exception
      'Core tuition term snapshots are immutable';
  end if;


  -- -------------------------------------------------------
  -- Pause Engine may extend effective_ends_on.
  -- It may never shrink below contractual base_ends_on.
  -- -------------------------------------------------------

  if new.effective_ends_on <
     old.base_ends_on
  then
    raise exception
      'Effective tuition end cannot be earlier than the base tuition end';
  end if;


  -- -------------------------------------------------------
  -- Normalize requested discount.
  -- -------------------------------------------------------

  v_discount_type :=
    upper(
      coalesce(
        nullif(
          btrim(
            new.discount_type
          ),
          ''
        ),
        'NONE'
      )
    );


  v_discount_value :=
    coalesce(
      new.discount_value,
      0
    );


  if v_discount_type = 'NONE' then

    v_discount_value := 0;
    new.discount_name := null;

  elsif v_discount_type in (
    'PERCENT',
    'FIXED'
  ) then

    if new.discount_name is null
       or btrim(
         new.discount_name
       ) = ''
    then
      raise exception
        'Discount name is required when a discount is applied';
    end if;


    new.discount_name :=
      btrim(
        new.discount_name
      );

  else

    raise exception
      'Invalid tuition discount type: %',
      v_discount_type;

  end if;


  v_discount_amount :=
    public.calculate_tuition_discount_amount(
      old.list_price,
      v_discount_type,
      v_discount_value
    );


  v_amount :=
    round(
      old.list_price
      - v_discount_amount,
      2
    );


  -- -------------------------------------------------------
  -- Invoice snapshot boundary.
  --
  -- Once any invoice exists for this tuition term, pricing
  -- history is closed. Later financial corrections must use
  -- adjustment / credit / refund records.
  -- -------------------------------------------------------

  select exists (
    select 1
    from public.invoices
    where enrollment_tuition_id =
      old.id
  )
  into v_invoice_exists;


  if v_invoice_exists
     and (
       v_discount_type is distinct from
         old.discount_type

       or v_discount_value is distinct from
         old.discount_value

       or new.discount_name is distinct from
         old.discount_name

       or v_discount_amount is distinct from
         old.discount_amount

       or v_amount is distinct from
         old.amount
     )
  then
    raise exception
      'Tuition discount cannot change after invoice creation';
  end if;


  -- -------------------------------------------------------
  -- Apply normalized values.
  -- -------------------------------------------------------

  new.discount_type :=
    v_discount_type;

  new.discount_value :=
    v_discount_value;

  new.discount_amount :=
    v_discount_amount;

  new.amount :=
    v_amount;


  return new;

end;
$$;
