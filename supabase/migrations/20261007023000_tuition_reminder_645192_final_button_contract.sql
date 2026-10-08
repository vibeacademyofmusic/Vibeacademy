-- Final live contract for ZBS 645192.
-- New sends use exactly: "Tiếp tục học" and "Liên hệ".
-- Historical 643118 sends are not rewritten; old labels remain parser-only compatibility.

update public.notification_templates
set description = 'VIBE - Xác nhận tiếp tục học V2. Mẫu ZBS 645192 (ENABLE). Nút phản hồi chính thức: Tiếp tục học, Liên hệ. Tham số: student_name, student_code, days_left (số), period, amount (số), due_date (số).',
    updated_at = clock_timestamp()
where template_key = 'ZALO_TUITION_REMINDER'
  and provider = 'ZALO'
  and provider_template_id = '645192';

create or replace function public.tuition_zalo_canonical_button(p_button text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_button
    when 'Tiếp tục học' then 'Tiếp tục học'
    when 'Liên hệ' then 'Yêu cầu khác'
    -- Parser-only compatibility for previously prepared/legacy payloads.
    when 'Tiếp Tục Học' then 'Tiếp tục học'
    when 'Liên Hệ' then 'Yêu cầu khác'
    else p_button
  end
$$;
