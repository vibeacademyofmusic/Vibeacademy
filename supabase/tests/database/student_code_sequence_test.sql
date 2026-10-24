begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.students(id, student_code, full_name)
values ('e4100000-0000-4000-8000-000000000001', '', 'Student sequence A'),
       ('e4100000-0000-4000-8000-000000000002', 'HV-abcdef12', 'Student sequence B');

select matches((select student_code from public.students where id = 'e4100000-0000-4000-8000-000000000001'), '^VIBE-[0-9]{6,}$', 'blank code receives a formatted number');
select isnt((select student_code from public.students where id = 'e4100000-0000-4000-8000-000000000001'), (select student_code from public.students where id = 'e4100000-0000-4000-8000-000000000002'), 'new numbers are distinct');

update public.students set student_code = 'CUSTOM', full_name = 'Student sequence A updated'
where id = 'e4100000-0000-4000-8000-000000000001';
select matches((select student_code from public.students where id = 'e4100000-0000-4000-8000-000000000001'), '^VIBE-[0-9]{6,}$', 'code remains immutable on update');

insert into public.students(id, student_code, full_name)
values ('e4100000-0000-4000-8000-000000000003', 'LEGACY-123', 'Historical import');
select is((select student_code from public.students where id = 'e4100000-0000-4000-8000-000000000003'), 'LEGACY-123', 'explicit historical import code preserved');

select * from finish();
rollback;
