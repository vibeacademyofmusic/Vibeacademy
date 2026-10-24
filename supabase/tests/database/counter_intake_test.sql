begin;

insert into auth.users(id) values ('aa930000-0000-4000-8000-000000000002');
insert into profiles(id, full_name, status) values ('aa930000-0000-4000-8000-000000000002', 'Synthetic Intake Admin', 'ACTIVE');
insert into user_roles(user_id, role_id) select 'aa930000-0000-4000-8000-000000000002', id from roles where code = 'SUPER_ADMIN';
select set_config('registration.write', 'on', true);
select set_config('request.jwt.claim.role', 'service_role', true);
insert into branches(id, code, name) values ('aa930000-0000-4000-8000-000000000011', 'IN-TAKE', 'Intake branch');
insert into public.curriculums(id, code, name, status) values ('aa930000-0000-4000-8000-000000000020', 'INTAKE-C', 'Intake program', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values ('aa930000-0000-4000-8000-000000000021', 'aa930000-0000-4000-8000-000000000020', 'INTAKE-L', 'Intake level', 1, 'ACTIVE');
select set_config('request.jwt.claim.sub', 'aa930000-0000-4000-8000-000000000002', true);

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is(registration_is_over_18((registration_vietnam_today() - interval '18 years')::date), false, 'the 18th birthday itself is not over 18');
select is(registration_is_over_18((registration_vietnam_today() - interval '18 years' - interval '1 day')::date), true, 'the day after the 18th birthday is over 18');

select throws_ok(
  format($q$select create_registration_with_zalo_consent('aa930000-0000-4000-8000-000000000101','aa930000-0000-4000-8000-000000000011',null,'Intake Blank Address',%L::date,null,null,'aa930000-0000-4000-8000-000000000020','aa930000-0000-4000-8000-000000000021',null,null,'',false,'',true,'0900000001','   ')$q$, (registration_vietnam_today() - interval '20 years')::date),
  'P0001', 'ADDRESS_REQUIRED', 'whitespace address is rejected');
select is((select count(*)::int from registration_applications where student_name = 'Intake Blank Address'), 0, 'rejected address leaves no draft');

select throws_ok(
  format($q$select create_registration_with_zalo_consent('aa930000-0000-4000-8000-000000000102','aa930000-0000-4000-8000-000000000011',null,'Intake Letter Phone',%L::date,null,null,'aa930000-0000-4000-8000-000000000020','aa930000-0000-4000-8000-000000000021',null,null,'',false,'',true,'09ab000001','12 Duong Thu')$q$, (registration_vietnam_today() - interval '20 years')::date),
  'P0001', 'PHONE_INVALID', 'a phone containing letters is rejected');
select is((select count(*)::int from registration_applications where student_name = 'Intake Letter Phone'), 0, 'rejected phone leaves no draft');

select throws_ok(
  format($q$select create_registration_with_zalo_consent('aa930000-0000-4000-8000-000000000103','aa930000-0000-4000-8000-000000000011',null,'Intake Minor',%L::date,null,null,'aa930000-0000-4000-8000-000000000020','aa930000-0000-4000-8000-000000000021',null,null,'',false,'',false,'0900000001','12 Duong Thu')$q$, (registration_vietnam_today() - interval '10 years')::date),
  'P0001', 'PARENT_REQUIRED', 'a minor cannot skip the parent');

select throws_ok(
  format($q$select create_registration_with_zalo_consent('aa930000-0000-4000-8000-000000000104','aa930000-0000-4000-8000-000000000011',null,'Intake Exact Birthday',%L::date,null,null,'aa930000-0000-4000-8000-000000000020','aa930000-0000-4000-8000-000000000021',null,null,'',false,'',true,'0900000001','12 Duong Thu')$q$, (registration_vietnam_today() - interval '18 years')::date),
  'P0001', 'REGISTRATION_AGE_MISMATCH', 'checking over 18 on the birthday itself is rejected');

select create_registration_with_zalo_consent(
  'aa930000-0000-4000-8000-000000000105', 'aa930000-0000-4000-8000-000000000011', null, 'Intake Adult',
  (registration_vietnam_today() - interval '20 years')::date, null, null,
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null,
  null, '', false, '', true, '0900 000 001', '  12   Duong   Thu '
);
select is((select subject_id is null and student_over_18 and parent_name is null and home_address = '12 Duong Thu' and zalo_phone = '84900000001' from registration_applications where id = 'aa930000-0000-4000-8000-000000000105'), true, 'adult intake stores no subject, collapsed address and normalized Zalo number');
select is((select count(*)::int from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000105'), 0, 'unchecked consent creates no consent row');
select is((select count(*)::int from notification_jobs where entity_id = 'aa930000-0000-4000-8000-000000000105'), 0, 'unchecked consent creates no Zalo job');
select create_registration_with_zalo_consent(
  'aa930000-0000-4000-8000-000000000105', 'aa930000-0000-4000-8000-000000000011', null, 'Intake Adult Replay',
  (registration_vietnam_today() - interval '20 years')::date, 'Should Not Replace', '0900000009',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null,
  null, '', true, 'IN_PERSON', true, '0900000009', 'Khac dia chi'
);
select is((select count(*)::int from registration_applications where id = 'aa930000-0000-4000-8000-000000000105'), 1, 'replaying the request does not create a second draft');
select is((select student_name = 'Intake Adult' and zalo_phone = '84900000001' and parent_name is null from registration_applications where id = 'aa930000-0000-4000-8000-000000000105'), true, 'replay does not overwrite the saved intake');
select is((select count(*)::int from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000105'), 0, 'replay cannot add consent the first request did not record');

select create_registration_with_zalo_consent(
  'aa930000-0000-4000-8000-000000000106', 'aa930000-0000-4000-8000-000000000011', null, 'Intake Adult Consent',
  (registration_vietnam_today() - interval '20 years')::date, 'Optional Parent', '0900000002',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null,
  null, '', true, 'IN_PERSON', true, '+84 900 000 001', '12 Duong Thu'
);
select is((select source = 'REGISTRATION_FORM' and confirmation_method = 'IN_PERSON' and consenter_role = 'STUDENT' and actor_id = 'aa930000-0000-4000-8000-000000000002'::uuid and normalized_phone = '84900000001' and consented_at is not null from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000106' and revoked_at is null), true, 'adult consent is the student, recorded by staff, for the Zalo number');
select create_registration_with_zalo_consent(
  'aa930000-0000-4000-8000-000000000106', 'aa930000-0000-4000-8000-000000000011', null, 'Intake Adult Consent',
  (registration_vietnam_today() - interval '20 years')::date, 'Optional Parent', '0900000002',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null,
  null, '', true, 'IN_PERSON', true, '+84 900 000 001', '12 Duong Thu'
);
select is((select count(*)::int from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000106'), 1, 'replaying a consented request does not insert another consent');

select create_registration_with_zalo_consent(
  'aa930000-0000-4000-8000-000000000107', 'aa930000-0000-4000-8000-000000000011', null, 'Intake Shared Phone',
  (registration_vietnam_today() - interval '8 years')::date, 'Shared Parent', '0900000001',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null,
  null, '', false, '', false, '84900000001', '34 Duong Khac'
);
select is((select count(*)::int from registration_applications where zalo_phone = '84900000001'), 3, 'the same Zalo number can belong to more than one student');

select create_registration_with_zalo_consent(
  'aa930000-0000-4000-8000-000000000108', 'aa930000-0000-4000-8000-000000000011', null, 'Intake Keep Parent',
  (registration_vietnam_today() - interval '10 years')::date, 'Kept Parent', '0900000003',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null,
  null, '', true, 'IN_PERSON', false, '0900000004', '56 Duong Cu'
);
select is((select consenter_role = 'PARENT' and normalized_phone = '84900000004' from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000108' and revoked_at is null), true, 'minor consent belongs to the parent phone');
select update_registration_intake(
  'aa930000-0000-4000-8000-000000000108', 1, 'aa930000-0000-4000-8000-000000000118', 'aa930000-0000-4000-8000-000000000011', null,
  'Intake Keep Parent', (registration_vietnam_today() - interval '20 years')::date, '', '',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null, null, '',
  false, '', true, '0900000004', '56 Duong Cu'
);
select is((select parent_name = 'Kept Parent' and parent_phone = '84900000003' and student_over_18 from registration_applications where id = 'aa930000-0000-4000-8000-000000000108'), true, 'turning on over 18 with blank parent fields keeps the stored parent');
select is((select count(*)::int from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000108' and revoked_at is null), 0, 'changing the consenter revokes the old consent');
select update_registration_intake(
  'aa930000-0000-4000-8000-000000000108', 1, 'aa930000-0000-4000-8000-000000000118', 'aa930000-0000-4000-8000-000000000011', null,
  'Intake Keep Parent', (registration_vietnam_today() - interval '20 years')::date, '', '',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null, null, '',
  true, 'IN_PERSON', true, '0900000008', '99 Duong Khac'
);
select is((select version = 2 and home_address = '56 Duong Cu' from registration_applications where id = 'aa930000-0000-4000-8000-000000000108'), true, 'replaying the update does not apply a second payload');

select update_registration_intake(
  'aa930000-0000-4000-8000-000000000108', 2, 'aa930000-0000-4000-8000-000000000128', 'aa930000-0000-4000-8000-000000000011', null,
  'Intake Keep Parent', (registration_vietnam_today() - interval '20 years')::date, '', '',
  'aa930000-0000-4000-8000-000000000020', 'aa930000-0000-4000-8000-000000000021', null, null, '',
  true, 'IN_PERSON', true, '0900000008', '56 Duong Cu'
);
select is((select normalized_phone = '84900000008' and consenter_role = 'STUDENT' and revoked_at is null from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000108' and revoked_at is null), true, 'a new number requires a new consent and does not keep the old one active');
select is((select count(*)::int from registration_zalo_phone_consents where application_id = 'aa930000-0000-4000-8000-000000000108' and normalized_phone = '84900000004' and revoked_at is null), 0, 'the previous number has no active consent');

select set_config('registration.write', 'on', true);
insert into students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status, address, phone)
values ('aa930000-0000-4000-8000-000000000201', null, 'Copied Adult', date '2004-01-01', 'aa930000-0000-4000-8000-000000000011', registration_vietnam_today(), 'ACTIVE', 'Dia chi cu', '84999999999');
insert into registration_applications(id, application_code, branch_id, student_name, student_date_of_birth, student_over_18, zalo_phone, home_address, status, created_by)
values ('aa930000-0000-4000-8000-000000000110', 'DK-INTAKE-COPY', 'aa930000-0000-4000-8000-000000000011', 'Copied Adult', date '2004-01-01', true, '84900000001', '12 Duong Thu', 'PAID', 'aa930000-0000-4000-8000-000000000002');
update registration_applications set linked_student_id = 'aa930000-0000-4000-8000-000000000201', status = 'COMPLETED', completed_at = clock_timestamp()
where id = 'aa930000-0000-4000-8000-000000000110';
select is((select address = '12 Duong Thu' and phone = '84900000001' and declares_over_18 is true from students where id = 'aa930000-0000-4000-8000-000000000201'), true, 'completion copies address, Zalo number and age flag onto the student');

insert into parents(id, parent_code, status) values ('aa930000-0000-4000-8000-000000000202', 'PH-INTAKE', 'ACTIVE');
insert into students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status, address, phone)
values ('aa930000-0000-4000-8000-000000000203', null, 'Old Student', date '2012-01-01', 'aa930000-0000-4000-8000-000000000011', registration_vietnam_today(), 'ACTIVE', 'Giu dia chi', '84888888888');
insert into registration_applications(id, application_code, branch_id, student_name, student_date_of_birth, status, created_by)
values ('aa930000-0000-4000-8000-000000000109', 'DK-INTAKE-OLD', 'aa930000-0000-4000-8000-000000000011', 'Old Student', date '2012-01-01', 'PAID', 'aa930000-0000-4000-8000-000000000002');
update registration_applications set linked_student_id = 'aa930000-0000-4000-8000-000000000203', linked_parent_id = 'aa930000-0000-4000-8000-000000000202', status = 'COMPLETED', completed_at = clock_timestamp()
where id = 'aa930000-0000-4000-8000-000000000109';
select is((select address = 'Giu dia chi' and phone = '84888888888' and declares_over_18 is false from students where id = 'aa930000-0000-4000-8000-000000000203'), true, 'an empty old intake does not wipe the student address or phone');

select * from finish();
rollback;
