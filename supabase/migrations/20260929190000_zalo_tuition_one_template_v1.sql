-- One shared tuition ZBS template contract.
-- Keeps the existing draft disabled. Does not assign a provider template id
-- and does not enable sending.

update public.notification_templates
set description = 'Thông báo kỳ học và học phí',
    parameter_schema = '["parent_name","student_name","student_code","branch_name","period_start","period_end","tuition_status"]'::jsonb
where template_key = 'ZALO_TUITION_REMINDER'
  and status = 'DRAFT'
  and enabled = false
  and provider_template_id is null;
