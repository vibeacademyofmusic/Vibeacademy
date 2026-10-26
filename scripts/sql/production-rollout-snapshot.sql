-- Read-only input for the guarded rollout planner. Contains private student data.
select jsonb_build_object(
  'observed_at', now(),
  'database_user', current_user,
  'ledger_count', (select count(*) from supabase_migrations.schema_migrations),
  'branches', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.branches b where b.code = 'CT01'),
  'opening_batches', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.legacy_student_opening_batches b where b.import_batch_id = 'b52d8476-7446-5130-abf8-04f0a67c992c'),
  'opening_rows', (select coalesce(jsonb_agg(to_jsonb(r) order by r.source_excel_row), '[]') from public.legacy_student_opening_rows r where r.import_batch_id = 'b52d8476-7446-5130-abf8-04f0a67c992c'),
  'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.students s join public.branches b on b.id=s.default_branch_id where b.code='CT01'),
  'curriculums', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.curriculums c where c.code in ('PIANO','GUITAR','VIOLIN','DRUMS','VOCAL','CELLO')),
  'levels', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.curriculum_levels l join public.curriculums c on c.id=l.curriculum_id where c.code in ('PIANO','GUITAR','VIOLIN','DRUMS','VOCAL','CELLO')),
  'academic_enrollments', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.student_curriculum_enrollments e join public.students s on s.id=e.student_id join public.branches b on b.id=s.default_branch_id where b.code='CT01'),
  'tuition', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.enrollment_tuition t join public.enrollments e on e.id=t.enrollment_id join public.students s on s.id=e.student_id join public.branches b on b.id=s.default_branch_id where b.code='CT01'),
  'rooms', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.rooms r join public.branches b on b.id=r.branch_id where b.code='CT01'),
  'classes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.classes c join public.branches b on b.id=c.branch_id where b.code='CT01'),
  'class_teachers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.class_teachers t join public.classes c on c.id=t.class_id join public.branches b on b.id=c.branch_id where b.code='CT01'),
  'enrollments', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.enrollments e join public.students s on s.id=e.student_id join public.branches b on b.id=s.default_branch_id where b.code='CT01'),
  'schedules', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.schedules s join public.classes c on c.id=s.class_id join public.branches b on b.id=c.branch_id where b.code='CT01'),
  'side_effect_counts', jsonb_build_object(
    'student_curriculum_enrollments', (select count(*) from public.student_curriculum_enrollments),
    'enrollments', (select count(*) from public.enrollments),
    'enrollment_tuition', (select count(*) from public.enrollment_tuition),
    'session_occurrences', (select count(*) from public.session_occurrences),
    'attendance_records', (select count(*) from public.attendance_records),
    'invoices', (select count(*) from public.invoices),
    'notification_jobs', (select count(*) from public.notification_jobs),
    'notification_events', (select count(*) from public.notification_events),
    'zalo_notification_attempts', (select count(*) from public.zalo_notification_attempts)
  )
) as snapshot;
