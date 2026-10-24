-- Bind the verified Zalo payment-request template. Sending stays off.
-- Registration 640377, reminder 643118, and the learning-report row are not changed.

update public.notification_templates
set provider_template_id = '645028',
    status = 'APPROVED',
    enabled = false,
    description = 'TUITION_PAYMENT_REQUEST. Mẫu Zalo 645028, trạng thái ENABLE, thẻ TRANSACTION. Nút Thanh toán học phí mở https://pay.payos.vn/web/<payment_link_id>. Gửi đang tắt.'
where template_key = 'ZALO_TUITION_PAYMENT'
  and provider = 'ZALO'
  and enabled = false
  and status in ('PENDING', 'APPROVED')
  and (provider_template_id is null or provider_template_id = '645028');
