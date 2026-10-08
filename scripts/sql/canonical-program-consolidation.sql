-- Local consolidation of instrument catalogs. Refuses to run unless the caller
-- has already proven the connection is the local database. Idempotent.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('vibe:canonical-programs:20261005', 0));

create temp table canon_report(payload jsonb) on commit drop;

do $canon$
declare
  piano uuid := 'd650ee06-2567-4694-a792-9d47722cf6af';
  guitar uuid := '11ff51d3-6adf-4532-85c7-c58c279bafc3';
  violin uuid := '91b978e6-bad6-4384-bc6a-9aeec445d1bb';
  drums uuid := '9c408855-ccd2-48fc-a4c7-19ad340f7623';
  payos uuid := 'ab940000-0000-4000-8000-000000000020';
  moved int := 0;
  deleted_programs int := 0;
  renamed int := 0;
  archived int := 0;
  delta int := 0;
  before_programs jsonb;
  after_programs jsonb;
  progress_names text[] := array[
    'student_curriculum_enrollments','student_level_progress','student_subject_progress',
    'student_component_progress','student_component_item_progress'
  ];
  tbl text;
  before_hash text;
  after_hash text;
  finance_before jsonb;
  finance_after jsonb;
begin
  if not exists(select 1 from public.curriculums where id = piano)
    and not exists(select 1 from public.curriculums where id = guitar and code = 'GUITAR') then
    raise exception 'Expected local curriculum identities are not present.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'code', c.code, 'name', c.name, 'status', c.status,
    'levels', (select count(*) from public.curriculum_levels l where l.curriculum_id = c.id),
    'subjects', (select count(*) from public.curriculum_subjects s join public.curriculum_levels l on l.id = s.level_id where l.curriculum_id = c.id),
    'components', (select count(*) from public.curriculum_subject_components comp join public.curriculum_subjects s on s.id = comp.subject_id join public.curriculum_levels l on l.id = s.level_id where l.curriculum_id = c.id),
    'lessons', (select count(*) from public.curriculum_component_items i join public.curriculum_subject_components comp on comp.id = i.component_id join public.curriculum_subjects s on s.id = comp.subject_id join public.curriculum_levels l on l.id = s.level_id where l.curriculum_id = c.id)
  ) order by c.code), '[]'::jsonb) into before_programs from public.curriculums c;

  select jsonb_build_object(
    'payments', (select count(*) from public.payments),
    'payment_amount', (select coalesce(sum(amount), 0) from public.payments),
    'invoices', (select count(*) from public.invoices),
    'invoice_amount', (select coalesce(sum(total_amount), 0) from public.invoices),
    'payos_orders', (select count(*) from public.registration_payos_orders),
    'payos_webhooks', (select count(*) from public.registration_payos_webhook_events),
    'tuition_orders', (select count(*) from public.tuition_payos_orders)
  ) into finance_before;

  foreach tbl in array progress_names loop
    execute format('select md5(coalesce(string_agg(t.id::text, '','' order by t.id), '''')) from public.%I t', tbl) into before_hash;
    perform set_config('canon.hash.' || tbl, before_hash, true);
  end loop;

  -- Move draft components only onto the same instrument, level and subject when the
  -- surviving subject has no component yet. Existing lessons and progress stay put.
  with pairs(donor_code, survivor_id) as (
    values ('PIANO', piano), ('VIOLIN', violin)
  ), donor_subject as (
    select s.id as donor_id, target.id as target_id
    from pairs p
    join public.curriculums donor on donor.code = p.donor_code and donor.id <> p.survivor_id
    join public.curriculum_levels dl on dl.curriculum_id = donor.id
    join public.curriculum_subjects s on s.level_id = dl.id
    join public.curriculum_levels tl on tl.curriculum_id = p.survivor_id
      and (
        tl.code = dl.code
        or (dl.code = 'G1' and tl.code = 'GRADE_1')
        or (dl.code = 'G2' and tl.code = 'GRADE_2')
        or (dl.code = 'G3' and tl.code = 'GRADE_3')
        or (dl.code = 'G4' and tl.code = 'GRADE_4')
        or (dl.code = 'G5' and tl.code = 'GRADE_5')
        or (dl.code = 'G6' and tl.code = 'GRADE_6')
        or (dl.code = 'G7' and tl.code = 'GRADE_7')
        or (dl.code = 'G8' and tl.code = 'GRADE_8')
      )
    join public.curriculum_subjects target on target.level_id = tl.id
      and (
        target.code = s.code
        or (s.code = 'SIGHT_READING' and target.code = 'SIGHTREADING')
      )
    where not exists (
      select 1 from public.curriculum_subject_components existing where existing.subject_id = target.id
    )
  )
  update public.curriculum_subject_components comp
  set subject_id = donor_subject.target_id
  from donor_subject
  where comp.subject_id = donor_subject.donor_id;
  get diagnostics moved = row_count;

  if exists (
    select 1
    from public.student_component_item_progress progress
    join public.curriculum_component_items item on item.id = progress.item_id
    join public.curriculum_subject_components comp on comp.id = item.component_id
    join public.curriculum_subjects subject on subject.id = comp.subject_id
    join public.curriculum_levels level on level.id = subject.level_id
    join public.curriculums program on program.id = level.curriculum_id
    where program.code in ('PIANO', 'VIOLIN') and program.id not in (piano, violin)
  ) then
    raise exception 'Draft catalog still owns student lesson progress.';
  end if;

  delete from public.curriculums program
  where program.code in ('PIANO', 'VIOLIN')
    and program.id not in (piano, violin)
    and not exists (select 1 from public.student_curriculum_enrollments e where e.curriculum_id = program.id)
    and not exists (select 1 from public.courses course where course.curriculum_id = program.id)
    and not exists (select 1 from public.registration_applications r where r.curriculum_id = program.id)
    and not exists (select 1 from public.student_placement_cases placement where placement.curriculum_id = program.id)
    and not exists (select 1 from public.staff_teaching_assignments assignment where assignment.curriculum_id = program.id);
  get diagnostics deleted_programs = row_count;

  update public.curriculums set code = 'PIANO', name = 'Piano', status = 'ACTIVE' where id = piano and (code, name, status) is distinct from ('PIANO', 'Piano', 'ACTIVE');
  get diagnostics delta = row_count; renamed := renamed + delta;
  update public.curriculums set code = 'GUITAR', name = 'Guitar', status = 'ACTIVE' where id = guitar and (code, name, status) is distinct from ('GUITAR', 'Guitar', 'ACTIVE');
  get diagnostics delta = row_count; renamed := renamed + delta;
  update public.curriculums set code = 'VIOLIN', name = 'Violin', status = 'ACTIVE' where id = violin and (code, name, status) is distinct from ('VIOLIN', 'Violin', 'ACTIVE');
  get diagnostics delta = row_count; renamed := renamed + delta;
  update public.curriculums set code = 'DRUMS', name = 'Trống', status = 'ACTIVE' where id = drums and (code, name, status) is distinct from ('DRUMS', 'Trống', 'ACTIVE');
  get diagnostics delta = row_count; renamed := renamed + delta;

  update public.curriculums
  set status = 'INACTIVE',
      description = 'Hồ sơ học phí Guitar PayOS. Giữ nguyên để đối chiếu đăng ký và thanh toán. Không dùng cho vận hành chương trình.'
  where id = payos
    and (status is distinct from 'INACTIVE'
      or description is distinct from 'Hồ sơ học phí Guitar PayOS. Giữ nguyên để đối chiếu đăng ký và thanh toán. Không dùng cho vận hành chương trình.');
  get diagnostics archived = row_count;

  foreach tbl in array progress_names loop
    execute format('select md5(coalesce(string_agg(t.id::text, '','' order by t.id), '''')) from public.%I t', tbl) into after_hash;
    if after_hash is distinct from current_setting('canon.hash.' || tbl) then
      raise exception 'Student progress identities changed: %', tbl;
    end if;
  end loop;

  select jsonb_build_object(
    'payments', (select count(*) from public.payments),
    'payment_amount', (select coalesce(sum(amount), 0) from public.payments),
    'invoices', (select count(*) from public.invoices),
    'invoice_amount', (select coalesce(sum(total_amount), 0) from public.invoices),
    'payos_orders', (select count(*) from public.registration_payos_orders),
    'payos_webhooks', (select count(*) from public.registration_payos_webhook_events),
    'tuition_orders', (select count(*) from public.tuition_payos_orders)
  ) into finance_after;
  if finance_before is distinct from finance_after then
    raise exception 'Financial totals changed.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'code', c.code, 'name', c.name, 'status', c.status,
    'levels', (select count(*) from public.curriculum_levels l where l.curriculum_id = c.id),
    'subjects', (select count(*) from public.curriculum_subjects s join public.curriculum_levels l on l.id = s.level_id where l.curriculum_id = c.id),
    'components', (select count(*) from public.curriculum_subject_components comp join public.curriculum_subjects s on s.id = comp.subject_id join public.curriculum_levels l on l.id = s.level_id where l.curriculum_id = c.id),
    'lessons', (select count(*) from public.curriculum_component_items i join public.curriculum_subject_components comp on comp.id = i.component_id join public.curriculum_subjects s on s.id = comp.subject_id join public.curriculum_levels l on l.id = s.level_id where l.curriculum_id = c.id)
  ) order by c.code), '[]'::jsonb) into after_programs from public.curriculums c;

  if (select count(*) from public.curriculums where public.curriculum_is_operational(code, status)) <> 4 then
    raise exception 'Operational programs must be exactly four.';
  end if;

  insert into canon_report values (jsonb_build_object(
    'moved_components', moved,
    'deleted_draft_programs', deleted_programs,
    'renamed', renamed,
    'archived', archived,
    'changes', moved + deleted_programs + renamed + archived,
    'before', before_programs,
    'after', after_programs,
    'finance', finance_after
  ));
end $canon$;

select payload from canon_report;
commit;
