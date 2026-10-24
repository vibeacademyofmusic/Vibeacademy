begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.branches(id, code, name) values
('e9400000-0000-4000-8000-000000000001', 'OTHER-T', 'VIBE Preview Other');
insert into auth.users(id) values ('e9400000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
('e9400000-0000-4000-8000-000000000002', 'Price Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'e9400000-0000-4000-8000-000000000002', id from public.roles where code = 'SUPER_ADMIN';
insert into public.curriculums(id, code, name, status) values
('e9400000-0000-4000-8000-000000000020', 'PRICE-C', 'Guitar Price', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values
('e9400000-0000-4000-8000-000000000021', 'e9400000-0000-4000-8000-000000000020', 'PRICE-L', 'Grade 1', 1, 'ACTIVE');
insert into public.curriculum_subjects(id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status) values
('e9400000-0000-4000-8000-000000000022', 'e9400000-0000-4000-8000-000000000021', 'TECHNIQUE', 'PRICE-S', 'Technique', 1, true, 'DIRECT_ASSESSMENT', 1, 'ACTIVE');

select set_config('request.jwt.claim.sub', 'e9400000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Synthetic historical quotes; never depend on preview demo registrations.
do $$
declare app uuid; n integer;
begin
 for n in 90..91 loop
  app := public.create_registration_application(gen_random_uuid(),
   (select id from public.branches where code='V01'), null, 'Historical Quote TEST '||n,
   '2014-01-01','Historical Parent TEST','0900000000','Piano','Piano',null,null);
  insert into public.registration_deposit_terms(application_id,branch_id,tuition_plan_id,price_id,
   tuition_amount,quoted_by,list_amount,discount_type,discount_value,discount_amount,payment_option,amount_due)
  select app, (select id from public.branches where code='V01'), price.tuition_plan_id,price.id,
   4500000,auth.uid(),4500000,'NONE',0,0,'DEPOSIT_50',2250000
  from public.tuition_plan_branch_prices price join public.tuition_plans plan on plan.id=price.tuition_plan_id
  where plan.code='VIBE_3_MONTHS' and price.status='ACTIVE' limit 1;
 end loop;
end $$;

create temporary table price_cases (
  n int primary key,
  branch uuid not null,
  plan uuid not null,
  payment text not null,
  list_amount bigint not null,
  due bigint not null
);
insert into price_cases(n, branch, plan, payment, list_amount, due)
select row_number() over (), branch, plan, payment, list_amount,
  case when payment = 'FULL' then list_amount else (list_amount + 1) / 2 end
from (values
  ((select id from public.branches where code = 'V01'), (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), 'DEPOSIT_50', 5500000::bigint),
  ((select id from public.branches where code = 'V01'), (select id from public.tuition_plans where code = 'VIBE_12_MONTHS'), 'DEPOSIT_50', 16500000::bigint),
  ((select id from public.branches where code = 'V01'), (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), 'FULL', 5500000::bigint),
  ((select id from public.branches where code = 'V01'), (select id from public.tuition_plans where code = 'VIBE_12_MONTHS'), 'FULL', 16500000::bigint),
  ('e9400000-0000-4000-8000-000000000001'::uuid, (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), 'DEPOSIT_50', 4500000::bigint),
  ('e9400000-0000-4000-8000-000000000001'::uuid, (select id from public.tuition_plans where code = 'VIBE_12_MONTHS'), 'DEPOSIT_50', 13500000::bigint),
  ('e9400000-0000-4000-8000-000000000001'::uuid, (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), 'FULL', 4500000::bigint),
  ('e9400000-0000-4000-8000-000000000001'::uuid, (select id from public.tuition_plans where code = 'VIBE_12_MONTHS'), 'FULL', 13500000::bigint)
) as cases(branch, plan, payment, list_amount);

do $$
declare row price_cases%rowtype;
  app uuid;
begin
  for row in select * from price_cases order by n loop
    app := public.create_registration_application_with_academics(
      gen_random_uuid(), row.branch, null, 'Price Student ' || row.n, '2014-02-02',
      'Price Parent', '090100009' || row.n,
      'e9400000-0000-4000-8000-000000000020',
      'e9400000-0000-4000-8000-000000000021',
      'e9400000-0000-4000-8000-000000000022',
      '2026-10-01', 'T7 15:00');
    perform public.transition_registration_application(gen_random_uuid(), app, 1, 'SUBMIT');
    perform public.transition_registration_application(gen_random_uuid(), app, 2, 'VERIFY');
    perform public.set_registration_deposit_quote(app, 3, row.plan, 'NONE', 0, null, row.payment);
  end loop;
end $$;

select is((select count(*) from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  join price_cases cases on cases.list_amount = terms.list_amount
    and cases.due = terms.amount_due and cases.payment = terms.payment_option
  where app.student_name like 'Price Student %'), 8::bigint, 'eight branch, duration, and payment combinations snapshot the authoritative price');

select is((select list_amount from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  join public.branches branch on branch.id = app.branch_id
  join public.tuition_plans plan on plan.id = terms.tuition_plan_id
  where branch.code = 'V01' and plan.code = 'VIBE_3_MONTHS' and terms.payment_option = 'DEPOSIT_50'
    and app.student_name = 'Price Student 1'), 5500000::bigint, 'Can Tho three-month quote is 5500000, not the 4500000 fallback');

select is((select amount_due from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  where app.student_name = 'Price Student 1'), 2750000::bigint, 'Can Tho three-month minimum deposit is 2750000');

select is((select amount_due from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  where app.student_name = 'Price Student 4'), 16500000::bigint, 'Can Tho annual full payment is due immediately');

select is((select amount_due from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  where app.student_name = 'Price Student 5'), 2250000::bigint, 'other branch three-month deposit is 2250000');

select set_config('registration.write', 'on', true);
select throws_ok($$update public.registration_applications
  set branch_id = 'e9400000-0000-4000-8000-000000000001'
  where student_name = 'Price Student 1'$$, 'P0001', 'REGISTRATION_BRANCH_LOCKED',
  'an agreed quote does not follow a silent branch change');
select set_config('registration.write', 'off', true);

select is((select list_amount from public.registration_applications app
  join public.registration_deposit_terms terms on terms.application_id = app.id
  where app.student_name = 'Historical Quote TEST 90'), 4500000::bigint,
  'the existing Can Tho mismatch is reported and not repriced');

select is((select count(*) from public.registration_momo_orders orders
  join public.registration_applications app on app.id = orders.application_id
  where app.student_name = 'Historical Quote TEST 90'), 0::bigint,
  'the existing application still has no payment order');

select lives_ok($$select public.correct_registration_commercial_terms(
  (select id from public.registration_applications where student_name = 'Price Student 1'),
  3,
  (select id from public.branches where code = 'V01'),
  (select id from public.tuition_plans where code = 'VIBE_12_MONTHS'),
  'NONE', 0, null, 'FULL')$$, 'explicit correction can replace an unpaid quote');

select is((select list_amount from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  where app.student_name = 'Price Student 1'), 16500000::bigint, 'corrected quote uses the annual Can Tho price');

select is((select count(*) from public.registration_application_events events
  join public.registration_applications app on app.id = events.application_id
  where app.student_name = 'Price Student 1' and events.event_type = 'QUOTE_CORRECTED'),
  1::bigint, 'correction writes an audit event');

select is((select count(*) from public.students where full_name like 'Price Student %'), 0::bigint,
  'quoting does not create a student');

select is((select payment_option from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  where app.student_name = 'Historical Quote TEST 91'), 'DEPOSIT_50',
  'older quotes stay on the minimum-deposit option');

select is((select amount_due from public.registration_deposit_terms terms
  join public.registration_applications app on app.id = terms.application_id
  where app.student_name = 'Historical Quote TEST 91'),
  (select deposit_due from public.registration_deposit_terms terms
   join public.registration_applications app on app.id = terms.application_id
   where app.student_name = 'Historical Quote TEST 91'),
  'older quotes keep their existing deposit as the amount due');

select * from finish();
rollback;
