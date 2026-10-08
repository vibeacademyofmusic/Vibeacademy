-- Local fixture quarantine only. Default is DRY RUN; no business/audit rows deleted.
-- Requires an explicit fresh review before applying. Do not run against cloud.
-- Review modified accounts individually; this script does not claim comprehensive cleanup.
\if :{?apply}
\else
\set apply false
\endif
begin;
create temporary table pilot_cleanup_targets(id uuid,email text,full_name text) on commit drop;
insert into pilot_cleanup_targets values
('41e005e5-a38d-4e65-a1da-3957383139d3'::uuid,'vibe.pilot032001.admin.20260928@example.test','TEST VIBE ADMIN VIBE-PILOT-20260928T032001Z'),
('dfbc0d62-743f-4296-bb13-cb6c0efccec4'::uuid,'vibe.pilot032001.ba.20260928@example.test','TEST VIBE BA VIBE-PILOT-20260928T032001Z'),
('49130d02-df4a-4295-9cd7-2899f5dea528'::uuid,'vibe.pilot032001.bb.20260928@example.test','TEST VIBE BB VIBE-PILOT-20260928T032001Z'),
('5fe7feba-35a6-4002-830a-f3812b2f6b83'::uuid,'vibe.pilot032001.aca.20260928@example.test','TEST VIBE ACA VIBE-PILOT-20260928T032001Z'),
('92c873a8-64b3-4319-a8fa-9d869a36ac28'::uuid,'vibe.pilot032001.fin.20260928@example.test','TEST VIBE FIN VIBE-PILOT-20260928T032001Z'),
('c1d37710-5824-47a1-8c05-da62157f4ba3'::uuid,'vibe.pilot032001.t1.20260928@example.test','TEST VIBE T1 VIBE-PILOT-20260928T032001Z'),
('1d3bcfe4-9f0e-4481-9a2c-0dfbede73ced'::uuid,'vibe.pilot032001.t2.20260928@example.test','TEST VIBE T2 VIBE-PILOT-20260928T032001Z'),
('b29b0632-1992-4c5e-87fd-ebb1fe113f0d'::uuid,'vibe.pilot032001.t3.20260928@example.test','TEST VIBE T3 VIBE-PILOT-20260928T032001Z'),
('cfbf6fe7-4857-4fa6-9823-4c991ef56f65'::uuid,'vibe.pilot032001.s1.20260928@example.test','TEST VIBE S1 VIBE-PILOT-20260928T032001Z'),
('9672b0c4-0640-416d-ade9-49e023ea09e4'::uuid,'vibe.pilot032001.s2.20260928@example.test','TEST VIBE S2 VIBE-PILOT-20260928T032001Z'),
('d8860a4e-2484-49b2-93e6-c5b0c81bb880'::uuid,'vibe.pilot032001.s3.20260928@example.test','TEST VIBE S3 VIBE-PILOT-20260928T032001Z'),
('3d6d1132-2f98-4fd7-9ff5-2addb3cecbb8'::uuid,'vibe.pilot032001.s4.20260928@example.test','TEST VIBE S4 VIBE-PILOT-20260928T032001Z'),
('19564438-0940-4f1d-8233-4ee0e59f192d'::uuid,'vibe.pilot032001.s5.20260928@example.test','TEST VIBE S5 VIBE-PILOT-20260928T032001Z'),
('f11abbcd-7988-4734-a5eb-7ca358687e6c'::uuid,'vibe.pilot032001.p1.20260928@example.test','TEST VIBE P1 VIBE-PILOT-20260928T032001Z'),
('a6d4666a-b484-41d9-952a-805807b443e0'::uuid,'vibe.pilot032001.p2.20260928@example.test','TEST VIBE P2 VIBE-PILOT-20260928T032001Z'),
('d61a2acc-866a-4dc6-b5ab-789168071e9d'::uuid,'vibe.pilot032001.p3.20260928@example.test','TEST VIBE P3 VIBE-PILOT-20260928T032001Z'),
('88963e5c-fe20-48a7-9475-3d164fb1f7cf'::uuid,'vibe.pilot032001.p4.20260928@example.test','TEST VIBE P4 VIBE-PILOT-20260928T032001Z');
-- Exact identity/name/namespace guard. Review these rows before opt-in execution.
select t.id,t.email,p.status,p.updated_at from pilot_cleanup_targets t
join auth.users u on u.id=t.id and u.email=t.email
join public.profiles p on p.id=t.id and p.full_name=t.full_name;
\if :apply
-- Stop if anyone changed an actor after this acceptance checkpoint.
do $$ begin
 if exists(select 1 from pilot_cleanup_targets t join public.profiles p on p.id=t.id
 where p.updated_at > timestamptz '2026-09-28 04:42:00+00') then
 raise exception 'Fixture changed after review checkpoint; review before cleanup'; end if;
end $$;
update public.profiles p set status='INACTIVE'
from pilot_cleanup_targets t join auth.users u on u.id=t.id and u.email=t.email
where p.id=t.id and p.full_name=t.full_name and p.status='ACTIVE';
commit;
\else
rollback;
\endif
