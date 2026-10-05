# Nghiệm thu phản hồi ZBS nhắc học phí — 29/09/2026

**Chưa sẵn sàng production.** Bị chặn trước lượt thử thật: mẫu `ZALO_TUITION_REMINDER` vẫn là `DRAFT`, chưa có mã mẫu Zalo, và chưa có sự kiện `user_click_response_button`. Không gửi tin và không bấm nút trên Zalo trong đợt này.

## Đối chiếu webhook

Tài liệu hiện hành: [Sự kiện người dùng phản hồi template phản hồi nhanh](https://docs.zaloplatforms.com/docs/ZBS/quan-ly-template/template-webhook/su-kien-nguoi-dung-phan-hoi-template-phan-hoi-nhanh).

| Trường Zalo | Cách hệ thống dùng |
| --- | --- |
| `message.submit_time` | Thời điểm bấm, chuỗi millisecond. Đây là mốc trong khóa chống lặp. |
| `message.data` | Chỉ nhận đúng `Tiếp tục học` hoặc `Dừng học`. |
| `message.button_type` | Phải là `response`. |
| `message.tracking_id` | Tìm đúng một dòng `tuition_zalo_sends`. Không dùng số điện thoại. |
| `msg_id` | Đối chiếu với `provider_message_id` của lần gửi đó. |
| `app_id` | Phải trùng ứng dụng đã cấu hình, và nằm trong chuỗi chữ ký. |
| `oa_id` | Phải trùng OA đã cấu hình. Nếu lần gửi đã lưu OA thì phải trùng thêm OA đó. |
| `timestamp` | Thời điểm Zalo gửi sự kiện. Dùng cho chữ ký, không dùng cho khóa chống lặp. |
| `X-ZEvent-Signature` | `mac=` rồi 64 ký tự hex. Công thức `SHA256(appId + chuỗi JSON gốc + timestamp + khóa bí mật OA)`. Khóa OA không phải khóa ứng dụng. |

Khóa chống lặp là `tracking_id + submit_time + nội dung nút + msg_id`. Thời điểm webhook đến chỉ dùng khi hai lần bấm khác nhau có cùng thời điểm bấm. Webhook lặp cùng thời điểm bấm không tạo thêm dòng lịch sử.

## Lần gửi đang có

Một lần gửi cục bộ, không rời hệ thống:

- Mã lần gửi: `5f36166a…`
- `tracking_id`: `6bc7…25`
- `msg_id`: không có
- OA trên lần gửi: không có
- Thời điểm gửi: không có
- Trạng thái gửi: `FAILED` / `PROVIDER_NOT_CONFIGURED`
- Phản hồi: không có dòng nào. Cả hai nhắc học phí vẫn **Chưa phản hồi**.

Không có ảnh hay log bấm nút vì Zalo không gửi webhook.

## Cấu hình mẫu cần có trước lượt thử

Tạo trên ZBS Account, loại **Mẫu phản hồi nhanh**. Zalo chưa cho tạo loại này bằng API. Không dùng mẫu đăng ký `640377` và không gắn nút liên kết.

- Hai nút, nội dung cố định: `Tiếp tục học`, `Dừng học`.
- Tham số nội dung: `parent_name`, `student_name`, `student_code`, `branch_name`, `period_start`, `period_end`, `tuition_status`.
- Mã mẫu Zalo điền vào `notification_templates.provider_template_id` của khóa `ZALO_TUITION_REMINDER`. Hàm gán mã hiện chỉ nhận mẫu đăng ký, nên không dùng hàm đó cho mẫu học phí.
- Chỉ đặt trạng thái đã duyệt sau khi ZBS báo mẫu này đã được duyệt. Bản nháp không được coi là gửi được.
- Webhook: `POST /api/integrations/zalo/webhook` trên URL HTTPS đã khai trên ứng dụng Zalo.
- Quyền cần bật: **Nhận sự kiện quản lý Message Template**.

Kiểm tra mẫu đã duyệt khi ZBS trả mã mẫu, hai nút đúng chữ trên, và dòng `ZALO_TUITION_REMINDER` không còn `DRAFT` với mã mẫu trống. Hiện dòng đó vẫn là bản nháp, `enabled = false`, mã mẫu trống.

## Kiểm thử đã chạy lại

19 bài liên quan đều đạt, gồm chữ ký sai, webhook lặp, `tracking_id` sai, gửi lỗi, hai học viên cùng số, gửi lại cùng đợt và hai phản hồi trái nhau. Bài cơ sở dữ liệu chạy trong giao dịch rồi hoàn tác. Không có lượt gửi thật, không có webhook thật, không đổi dữ liệu học viên.
