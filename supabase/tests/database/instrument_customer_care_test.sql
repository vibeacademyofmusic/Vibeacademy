begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('c7100000-0000-4000-8000-000000000001'),
  ('c7100000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c7100000-0000-4000-8000-000000000001', 'Instrument Super', 'ACTIVE'),
  ('c7100000-0000-4000-8000-000000000002', 'Instrument Admin B', 'ACTIVE');
insert into public.branches(id, code, name) values
  ('c7200000-0000-4000-8000-000000000001', 'CRM-INST-A', 'Instrument Care A'),
  ('c7200000-0000-4000-8000-000000000002', 'CRM-INST-B', 'Instrument Care B');
insert into public.user_roles(user_id, role_id)
select 'c7100000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c7100000-0000-4000-8000-000000000002', id, 'c7200000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';

select set_config('request.jwt.claim.sub', 'c7100000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.create_instrument_model('CRM-PIANO', 'CRM Piano', 'Piano', 'Vibe', 'Care Model')$$, 'catalogue model');
select lives_ok($$select public.receive_instrument('c7300000-0000-4000-8000-000000000001', item_id, 'CRM-SERIAL-1', 'c7200000-0000-4000-8000-000000000001', 'Supplier', 100, 150, 'VND', 'Receipt') from public.instrument_catalogue c join public.inventory_items i on i.id = c.item_id where i.code = 'CRM-PIANO'$$, 'receive unit');
select lives_ok($$select public.move_instrument('c7300000-0000-4000-8000-000000000002', id, 'SALE', null, 140, 'VND', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 20), 'Customer sale') from public.instrument_units where serial = 'CRM-SERIAL-1'$$, 'sale remains the stock authority');
reset role;

select lives_ok($$select public.link_instrument_sale_customer('c7400000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', null, null, 'Buyer An', '0901111222')$$, 'link buyer without creating a student');
select lives_ok($$select public.link_instrument_sale_customer('c7400000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', null, null, 'Buyer An', '0901111222')$$, 'link replay');
select throws_ok($$select public.link_instrument_sale_customer('c7400000-0000-4000-8000-000000000003', 'c7300000-0000-4000-8000-000000000002', null, null, 'Other Buyer', '0901111222')$$, 'P0001', 'INSTRUMENT_CUSTOMER_ALREADY_LINKED', 'one customer link per sale');
select is((select count(*) from public.instrument_units where serial = 'CRM-SERIAL-1'), 1::bigint, 'serial is not copied into a second unit');
select is((select acquisition_cost from public.instrument_commercial_details d join public.instrument_units u on u.id = d.unit_id where u.serial = 'CRM-SERIAL-1'), 100::numeric, 'acquisition cost stays on the commercial record');
select is((select count(*) from public.instrument_sale_customer_links), 1::bigint, 'one link row');
select is((select serial from public.list_instrument_customer_care('c7200000-0000-4000-8000-000000000001', 'ACTIVE')), 'CRM-SERIAL-1', 'warranty list reads the unit serial');
select is((select warranty_until from public.list_instrument_customer_care('c7200000-0000-4000-8000-000000000001', null)), ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 20), 'warranty date comes from the sale');
select is((select sale_price from public.list_instrument_customer_care('c7200000-0000-4000-8000-000000000001', null)), 140::numeric, 'sale price comes from the sale');
select ok(position('acquisition_cost' in pg_get_functiondef('public.list_instrument_customer_care(uuid,text)'::regprocedure)) = 0, 'care list does not read acquisition cost');
select ok(position('invoice' in lower(pg_get_functiondef('public.list_instrument_customer_care(uuid,text)'::regprocedure))) = 0, 'care list has no invoice dependency');

select lives_ok($$select public.open_instrument_warranty_case('c7500000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', 'Key sticks')$$, 'open warranty case');
select lives_ok($$select public.transition_instrument_warranty('c7500000-0000-4000-8000-000000000002', 'c7500000-0000-4000-8000-000000000001', 1, 'WAITING_PART', 'Wait for key')$$, 'waiting part');
select is((select case_status from public.list_instrument_customer_care(null, 'WAITING_PART')), 'WAITING_PART', 'waiting-part filter');
select lives_ok($$select public.add_instrument_customer_followup('c7600000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', 'PHONE', 'REPURCHASED', 'Bought a stand', null)$$, 'repurchase follow-up');
select is((select outcome from public.list_instrument_customer_care(null, null)), 'REPURCHASED', 'latest follow-up outcome');
select throws_ok($$update public.instrument_warranty_events set note = 'changed'$$, 'P0001', 'INSTRUMENT_WARRANTY_EVENT_IMMUTABLE', 'warranty history cannot be edited');
select throws_ok($$update public.instrument_customer_followups set note = 'changed'$$, 'P0001', 'INSTRUMENT_FOLLOWUP_IMMUTABLE', 'follow-up history cannot be edited');

select set_config('request.jwt.claim.sub', 'c7100000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.list_instrument_customer_care('c7200000-0000-4000-8000-000000000001', null)), 0::bigint, 'other branch care list is empty');
select throws_ok($$select public.add_instrument_customer_followup('c7600000-0000-4000-8000-000000000002', 'c7300000-0000-4000-8000-000000000002', 'PHONE', 'KEEP_IN_TOUCH', null, null)$$, 'P0001', 'INSTRUMENT_CUSTOMER_UNAUTHORIZED', 'other branch cannot add a follow-up');
set local role authenticated;
select throws_ok($$insert into public.instrument_sale_customer_links(id, sale_event_id, contact_name, created_by) values ('c7400000-0000-4000-8000-000000000009', 'c7300000-0000-4000-8000-000000000002', 'Forged', 'c7100000-0000-4000-8000-000000000002')$$, '42501', 'permission denied for table instrument_sale_customer_links', 'direct link insert denied');
reset role;

select * from finish();
rollback;
