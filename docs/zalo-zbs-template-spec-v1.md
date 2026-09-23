# Zalo ZBS template specification V1

These templates are not approved by Zalo. `provider_template_id` is empty and every template is disabled. No message has been sent.

Portal links always point at the signed-in family portal `/my-learning`. The message does not include the report body, invoice line items, or a Zalo user id.

## ZALO_REGISTRATION_CONFIRMED

- Purpose: tell the family that registration is complete.
- Trigger: `registration_applications.status` becomes `COMPLETED`.
- Recipient: active Zalo link on that registration, its parent, or its student.
- Parameters: `student_display_name`, `program_name`, `branch_name`, `portal_url`.
- Example: "VIBE Academy đã hoàn tất đăng ký của {student_display_name} cho {program_name} tại {branch_name}. Xem chi tiết trên cổng thông tin."
- CTA: Mở cổng thông tin.
- Sensitivity: display name and program only.
- Expected ZBS class: transaction confirmation. Not submitted.

## ZALO_PAYMENT_CONFIRMED

- Purpose: tell the family that a posted payment has settled an issued invoice.
- Trigger: a posted payment allocation leaves `invoice_receivables.receivable_status = PAID`.
- Recipient: active Zalo link on the student or parent.
- Parameters: `student_display_name`, `amount_display`, `payment_reference`, `portal_url`.
- Example: "VIBE Academy đã ghi nhận thanh toán {amount_display}, mã {payment_reference}, cho {student_display_name}. Chi tiết nằm trên cổng thông tin."
- CTA: Xem thanh toán.
- Sensitivity: amount and reference only. No bank payload.
- Expected ZBS class: payment confirmation. Not submitted.

## ZALO_CLASS_ASSIGNED

- Purpose: tell the family that a waiting placement is now scheduled.
- Trigger: committed `CLASS_ASSIGNED` placement event.
- Recipient: active Zalo link on the registration, parent, or student.
- Parameters: `student_display_name`, `class_name`, `teacher_display_name`, `start_date`, `schedule_display`, `portal_url`.
- Example: "{student_display_name} đã được xếp vào lớp {class_name}. Ngày bắt đầu {start_date}. Lịch: {schedule_display}."
- CTA: Xem lịch học.
- Sensitivity: class and start date. A future start date is allowed.
- Expected ZBS class: class assignment notice. Not submitted.

## ZALO_LEARNING_REPORT_PUBLISHED

- Purpose: tell the family that an approved report is published.
- Trigger: learning report status becomes `PUBLISHED` after approval. An end-of-course report uses the same template.
- Recipient: active Zalo link on the student or parent.
- Parameters: `student_display_name`, `report_period`, `secure_report_url`.
- Example: "Báo cáo học tập của {student_display_name} cho kỳ {report_period} đã được phát hành. Mở báo cáo trên cổng thông tin."
- CTA: Xem báo cáo.
- Sensitivity: period label and portal link. No teacher comments or scores in the message.
- Expected ZBS class: learning report notice. Not submitted.

## ZALO_TUITION_REMINDER

- Purpose: remind the family about an open tuition window.
- Trigger: not automatic in this foundation. The catalogue is ready for the existing tuition reminder row.
- Recipient: active Zalo link on the student or a parent who can view finance.
- Parameters: `student_display_name`, `due_date`, `amount_due_display`, `secure_payment_url`.
- Example: "Học phí của {student_display_name} đến hạn {due_date}, số tiền {amount_due_display}. Thanh toán trên cổng thông tin."
- CTA: Xem học phí.
- Sensitivity: due date and amount only.
- Expected ZBS class: payment reminder. Not submitted.

## ZALO_COURSE_EXPIRING

- Purpose: tell the family a course is nearing its end.
- Trigger: not automatic in this foundation.
- Recipient: active Zalo link on the student or parent.
- Parameters: `student_display_name`, `remaining_sessions` or an expiry date, `portal_url`.
- Example: "Khóa học của {student_display_name} sắp kết thúc. Xem số buổi còn lại trên cổng thông tin."
- CTA: Xem khóa học.
- Sensitivity: remaining sessions or one date. No grade detail.
- Expected ZBS class: course progress notice. Not submitted.
