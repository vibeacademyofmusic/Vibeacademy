# Báo cáo PDF công khai và ZBS — local 2026-10-06

Môi trường: ứng dụng `http://127.0.0.1:3000`, API `http://127.0.0.1:54321`, container `supabase_db_vibe-academy-system`. Không ghi production, không gửi Zalo.

Nhánh đang phục vụ cổng 3000: `codex/release-candidate-lint`, commit `4d2705e`, cộng phần tích hợp chưa commit. PR `#4` (`a83a37a`) không có sẵn trong cây này; chỉ ghép các file báo cáo, không lấy nhánh tuition/login.

## Kết quả

| Hạng mục | Kết quả |
| --- | --- |
| Migration local `20261006080000` | PASS. Bucket `learning-report-pdfs` private. Bốn báo cáo đã phát hành trước đó vẫn không có link. |
| Phát hành UI báo cáo `TEST Video báo cáo` | PASS. `PUBLISHED` phiên bản 8. Một job `SKIPPED_NO_CHANNEL`. Không có UID phụ huynh. |
| PDF ẩn danh, tải lại, tải xuống | PASS. 200, không cookie, cùng 17332 byte và cùng SHA-256. Tiếng Việt đọc được. Không có ghi chú quản trị hay link YouTube. |
| Thu hồi | PASS. UI thu hồi; lần mở sau trả 404 `Liên kết báo cáo không còn khả dụng.` Link lạ cũng 404. |
| Worker hai lần | PASS sau khi loader bảo trì hiểu đường dẫn `@/`. Cả hai lần `CHECKED`, `accepted: 0`, vẫn một job, không attempt gửi. |
| Mẫu ZBS và gửi thật | BLOCKED. Mẫu vẫn `DRAFT`, chưa có ID nhà cung cấp, chưa có origin HTTPS, cổng gửi báo cáo tắt. |
| Trình xem PDF trong tab tự động | Không đọc được nội dung trên ảnh chụp (khung xem PDF tối). Nội dung đã xác nhận bằng file tải về. |

PDF dành cho phụ huynh dùng `public_report_snapshot`, nên không kèm video bài học. Bản in quản trị vẫn hiện mục video.

Payload cho lượt gửi được phép sau này: `later-zbs-payload.json`. Chưa gửi.
