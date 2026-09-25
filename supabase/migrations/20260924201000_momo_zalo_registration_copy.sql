-- Template 640377 was approved for deposit registration copy. Sending remains disabled
-- until the OA application, recipient eligibility and merchant sandbox are verified.
update public.notification_templates
set provider_template_id = '640377', status = 'APPROVED', enabled = false,
    parameter_schema = '["customer_name","registration_code","student_name","program_name","branch_name","order_code","payment_status"]'::jsonb,
    description = 'Xác nhận đăng ký khi đã nhận cọc 50% qua MoMo'
where template_key = 'ZALO_REGISTRATION_CONFIRMED' and provider = 'ZALO';

create or replace function notification_private.domain_notice_source(p_event text, p_entity uuid)
returns table(
  student_id uuid,
  parent_id uuid,
  registration_id uuid,
  branch_id uuid,
  template_key text,
  title text,
  href text,
  parameters jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_event = 'PAYMENT_CONFIRMED' then
    return query
    select
      payment.student_id_snapshot,
      (
        select relation.parent_id
        from public.student_parents relation
        where relation.student_id = payment.student_id_snapshot
          and relation.is_active
        order by relation.is_primary desc
        limit 1
      ),
      null::uuid,
      payment.branch_id_snapshot,
      'ZALO_PAYMENT_CONFIRMED'::text,
      'Thanh toán đã được xác nhận'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(student.full_name, 'Học viên'), 80),
        'amount_display', trim(to_char(payment.amount, 'FM999999999990')) || ' VND',
        'payment_reference', left(payment.payment_number, 40),
        'portal_url', '/my-learning'
      )
    from public.payments payment
    join public.students student on student.id = payment.student_id_snapshot
    where payment.id = p_entity
      and payment.status = 'POSTED'
      and exists (
        select 1
        from public.payment_allocations allocation
        join public.invoice_receivables receivable on receivable.invoice_id = allocation.invoice_id
        where allocation.payment_id = payment.id
          and receivable.invoice_status = 'ISSUED'
          and receivable.receivable_status = 'PAID'
      );
  elsif p_event = 'REGISTRATION_COMPLETED' then
    return query
    select
      app.linked_student_id,
      app.linked_parent_id,
      app.id,
      app.branch_id,
      'ZALO_REGISTRATION_CONFIRMED'::text,
      'Xác nhận đăng ký tại VIBE Academy'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'customer_name', left(coalesce(app.parent_name, 'Phụ huynh'), 80),
        'registration_code', app.application_code,
        'student_name', left(coalesce(app.student_name, 'Học viên'), 80),
        'program_name', left(coalesce(app.program_interest, 'Chương trình đã đăng ký'), 80),
        'branch_name', left(branch.name, 80),
        'order_code', app.application_code,
        'payment_status', 'Đã nhận cọc 50%'
      )
    from public.registration_applications app
    join public.branches branch on branch.id = app.branch_id
    where app.id = p_entity
      and app.status = 'COMPLETED'
      and app.deposit_confirmed_at is not null;
  elsif p_event = 'CLASS_ASSIGNED' then
    return query
    select
      placement.student_id,
      app.linked_parent_id,
      app.id,
      placement.branch_id,
      'ZALO_CLASS_ASSIGNED'::text,
      'Học viên đã được xếp lớp'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(student.full_name, 'Học viên'), 80),
        'class_name', left(class_row.name, 80),
        'teacher_display_name', left(coalesce(teacher.full_name, 'Sẽ thông báo'), 80),
        'start_date', to_char(placement.scheduled_start_date, 'YYYY-MM-DD'),
        'schedule_display', left(coalesce(nullif(btrim(placement.preferred_schedule), ''), 'Xem lịch trên cổng học viên'), 120),
        'portal_url', '/my-learning'
      )
    from public.student_placement_events event
    join public.student_placement_cases placement on placement.id = event.placement_id
    join public.registration_applications app on app.id = placement.registration_application_id
    join public.classes class_row on class_row.id = placement.assigned_class_id
    join public.students student on student.id = placement.student_id
    left join public.teachers teacher on teacher.id = placement.assigned_teacher_id
    where event.id = p_entity
      and event.event_type = 'CLASS_ASSIGNED'
      and placement.status = 'SCHEDULED';
  elsif p_event in ('LEARNING_REPORT_PUBLISHED', 'END_OF_COURSE_REPORT_PUBLISHED') then
    return query
    select
      report.student_id,
      (
        select relation.parent_id
        from public.student_parents relation
        where relation.student_id = report.student_id
          and relation.is_active
        order by relation.is_primary desc
        limit 1
      ),
      null::uuid,
      report.branch_id,
      'ZALO_LEARNING_REPORT_PUBLISHED'::text,
      'Báo cáo học tập đã phát hành'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(student.full_name, 'Học viên'), 80),
        'report_period', to_char(report.period_start, 'YYYY-MM-DD') || ' - ' || to_char(report.period_end, 'YYYY-MM-DD'),
        'secure_report_url', '/my-learning'
      )
    from public.learning_reports report
    join public.students student on student.id = report.student_id
    where report.id = p_entity
      and report.status = 'PUBLISHED'
      and report.approved_at is not null
      and report.approved_by is not null
      and (
        (p_event = 'LEARNING_REPORT_PUBLISHED' and report.report_type = 'MONTHLY')
        or (p_event = 'END_OF_COURSE_REPORT_PUBLISHED' and report.report_type = 'END_OF_COURSE')
      );
  end if;
end $$;
