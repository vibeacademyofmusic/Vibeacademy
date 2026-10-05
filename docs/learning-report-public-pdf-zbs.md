# Báo cáo học tập → PDF xem ngay → ZBS

Trạng thái: **bản triển khai trên nhánh, chưa cài vào Mac/production và chưa gửi tin thật**.
Base: `codex/release-candidate-lint`, commit `4f921bea1a241453caf9b34c87eb71bd60303e5a`.
Phạm vi là báo cáo học tập; không sửa mẫu học phí, PayOS, thanh toán, hóa đơn hoặc ghi danh.

## Hành vi đã triển khai

1. Admin duyệt rồi phát hành qua RPC hiện có. Nội dung đã duyệt giữ nguyên.
2. Trong cùng giao dịch phát hành, tạo link ngẫu nhiên cho đúng báo cáo và bảo đảm outbox hiện có được ghi thành công. Hai emitter dùng cùng khóa chống trùng.
3. Sau phát hành, tạo PDF từ `public_report_snapshot` (loại ghi chú quản trị). Tệp nằm trong bucket **private** `learning-report-pdfs`, đường dẫn cố định theo báo cáo/phiên bản; lưu SHA-256. Worker bảo trì có thể tiếp tục công việc dang dở.
4. Khi đủ điều kiện, worker đọc credential hiện có và gửi mẫu báo cáo tới **UID phụ huynh đã kết nối Zalo**, có đồng ý nhận tin và quan hệ còn hiệu lực. Không tự dùng sự đồng ý nhắc học phí/đăng ký để gửi theo số điện thoại.
5. Phụ huynh bấm CTA và nhận PDF trực tiếp từ `/r/learning/<report_link_id>/pdf`, không đăng nhập/OTP. Thêm `?download=1` để yêu cầu tải xuống. Việc mở trong trình xem hoặc tải tệp cuối cùng phụ thuộc trình duyệt trên điện thoại.
6. Admin thấy trạng thái PDF, lịch sử gửi, lượt yêu cầu PDF và có thể thu hồi link. Ai có link đều xem được và chuyển tiếp được. Lượt yêu cầu có thể do bot xem trước, không chứng minh phụ huynh đã đọc.

Các báo cáo đã phát hành trước migration không tự được chia sẻ. Admin có thể chủ động tạo link cho từng báo cáo cũ; việc này không tự gửi lại tin. Thu hồi hiện là vĩnh viễn cho link đó; CREATE không mở lại link đã thu hồi.

## Mẫu cần tạo và duyệt trên Zalo

Tên đề nghị: **VIBE – Thông báo báo cáo học tập**. Tiêu đề: **Báo cáo học tập**.
Đề nghị nhóm chăm sóc khách hàng phù hợp thông báo học tập; Zalo quyết định phân loại/duyệt cuối cùng.

```text
Kính gửi Quý phụ huynh <customer_name>,

VIBE Academy đã phát hành báo cáo học tập của học viên <student_name>, mã học viên <student_code>.

Chương trình: <program_name>
Loại báo cáo: <report_type>
Kỳ báo cáo: <report_period>

Quý phụ huynh vui lòng chọn “Xem báo cáo PDF” để xem tiến độ, chuyên cần và nhận xét của giáo viên.
```

CTA chính: **Xem báo cáo PDF**, loại mở đường dẫn website của doanh nghiệp.
URL: `https://TEN-MIEN-DA-TRIEN-KHAI/r/learning/<report_link_id>/pdf`.
Đây là cấu trúc cấu hình, chưa phải một URL công khai đang hoạt động. Thay tên miền bằng origin thực tế đã triển khai và kiểm tra; không dùng localhost, link PayOS hoặc `/my-learning` cho CTA này.

Hợp đồng tham số có đúng bảy tên, theo thứ tự danh mục nội bộ:

| Tham số | Nguồn / giới hạn |
| --- | --- |
| `customer_name` | Tên hồ sơ phụ huynh được chọn, tối đa 30 ký tự |
| `student_name` | Tên trong snapshot đã duyệt, tối đa 30 ký tự |
| `student_code` | Mã trong snapshot đã duyệt, tối đa 30 ký tự |
| `program_name` | Chương trình trong snapshot đã duyệt, tối đa 30 ký tự |
| `report_type` | Báo cáo tháng / Báo cáo cuối kỳ, tối đa 30 ký tự |
| `report_period` | `DD/MM/YYYY-DD/MM/YYYY`, ví dụ `01/09/2026-30/09/2026` |
| `report_link_id` | 64 ký tự hex do hệ thống tạo; chỉ ở CTA, không nằm trong nội dung |

Tên/chương trình quá dài hoặc thiếu sẽ chặn gửi; không tự cắt tên hay thay nội dung đã duyệt.
Đối chiếu [API UID chính thức](https://docs.zaloplatforms.com/docs/ZBS/gui-tin-template-qua-uid/api-gui-tin-qua-uid), [tham số CTA](https://zalo.solutions/blog/cap-nhat-tinh-nang-zns-cho-phep-truyen-tham-so-param-vao-nut-thao-tac-cta-/w0unrzg8f47exp61k8a26j2m), [định dạng tham số](https://zalo.solutions/blog/cac-dinh-dang-du-lieu-khi-truyen-vao-tham-so-tren-noi-dung-zns/hd5soyjh3gv18ophwzdn49ty).

## Đưa vào môi trường VIBE

Thực hiện theo thứ tự; không reset database, không ghi đè thay đổi chưa commit ở Mac.

1. Xem diff nhánh, đối chiếu `AGENTS.md`, nhánh đang chạy và thay đổi chưa commit tại `/Users/macbookair/vibe-academy-system`. Hợp nhất có kiểm soát hoặc dùng worktree; không dùng `git reset --hard`.
2. Xác minh ứng dụng cổng 3000 đang dùng đúng **database local**. Đối chiếu migration ledger và áp dụng duy nhất migration mới `20261006031000_learning_report_public_pdf_zbs.sql` cùng các phụ thuộc thực sự còn thiếu theo quy trình của repo. Không chạy migration vào remote/production theo suy đoán.
3. Giữ `ZALO_LEARNING_REPORT_SEND_ENABLED=false`. Khởi động lại ứng dụng. Với một báo cáo thử đã duyệt, phát hành và mở **Xem PDF như phụ huynh** trong cửa sổ ẩn danh; kiểm tra tên, kỳ, nhận xét, tiếng Việt, không ghi chú quản trị, không login. Reload phải trả cùng PDF. Kiểm tra desktop/mobile thật.
4. Triển khai route và private storage trên hạ tầng công khai phù hợp. Đặt `LEARNING_REPORT_PUBLIC_ORIGIN` thành HTTPS origin, không kèm path. Origin phải trùng domain trong CTA đã duyệt. Bật đường dẫn này qua reverse proxy, không chặn bằng đăng nhập/deployment protection. Che token trong access log/APM ở hạ tầng; ứng dụng không log token và tắt dev request logging cho đường dẫn này.
5. Sau khi mẫu **báo cáo** được Zalo duyệt cho đúng OA/app, đối soát ID, đủ bảy tham số, CTA và một link PDF thử công khai. Cấu hình danh mục `ZALO_LEARNING_REPORT_PUBLISHED` với ID/version/schema chính xác, trạng thái APPROVED. Migration này không điền một ID giả và không tự bật mẫu.
6. Chọn đúng phụ huynh thử có UID của OA hiện tại, liên kết ACTIVE, đồng ý nhận tin còn hiệu lực; không lấy số điện thoại rồi suy ra UID. Nếu cần gửi báo cáo theo số điện thoại, cần luồng và sự đồng ý riêng phù hợp; bản này chưa triển khai kênh đó.
7. Chỉ sau khi chốt một lượt gửi thử, bật mẫu và `ZALO_LEARNING_REPORT_SEND_ENABLED=true`; cổng chung `ZALO_PILOT_OUTBOUND=enabled` cũng phải đã được phép. Kiểm tra hàng đợi trước khi bật: worker xử lý tối đa năm job mỗi lượt, nên bật gate không có nghĩa chỉ gửi một tin nếu tồn tại nhiều job hợp lệ. Giữ các báo cáo ngoài pilot chưa phát hành hoặc hủy rõ các job chưa gửi không thuộc pilot theo nghiệp vụ.
8. Worker đã được nối vào `scripts/zalo-maintenance.cjs`. Phải chạy trên runtime được giám sát, cùng database/storage/origin. Scheduler Mac hiện tại chạy theo `ZALO_RENEWAL_CHECK_SECONDS` (mặc định 600 giây); mã mới không tự cài cron hoặc chuyển ownership refresh token. Mac ngủ/tắt thì worker và endpoint local phụ thuộc Mac vẫn dừng. Muốn nhân viên dùng liên tục cần runtime luôn sẵn sàng.
9. Nghiệm thu tin thật: Zalo trả mã tin và đúng UID → phụ huynh nhận tin → bấm CTA → PDF đúng báo cáo → mở lại → admin tải lại thấy lượt yêu cầu. Thu hồi link thử phải trả 404 và dừng các lượt gửi chưa bắt đầu. Chỉ ghi nhận đạt đầu cuối khi đã làm trên môi trường thật.

## Trạng thái và khôi phục

- `SENT`: Zalo chấp nhận yêu cầu và trả message ID + UID khớp; chưa chứng minh phát đến máy hoặc người nhận đã xem.
- API trả lỗi rõ ràng: ghi REJECTED, thử lại sau 30 phút, tối đa năm lần; mỗi lần vẫn kiểm tra lại mẫu/người nhận/gate.
- Timeout, HTTP bất thường, phản hồi sai/thiếu UID hoặc crash: khóa attempt, ghi UNKNOWN sau tối đa năm phút **khi worker chạy lại**; không tự gửi lại. Cần đối soát bằng bằng chứng của provider.
- Ghi acknowledgement database có thể lặp an toàn; không gọi lại Zalo khi acknowledgement lỗi.
- Không tạo webhook giả, không tự nâng thành DELIVERED, không sửa callback học phí. Luồng xem PDF qua URL không phụ thuộc `user_click_response_button`.
- Tắt riêng `ZALO_LEARNING_REPORT_SEND_ENABLED` để ngừng gửi báo cáo. Giữ nguyên lịch sử; thu hồi link nếu cần dừng truy cập. Không xóa bảng/bucket lịch sử để rollback.

## Kiểm chứng trong phiên triển khai

- 9 kiểm tra PDF/worker với transport giả: PDF thật có font tiếng Việt, reload cùng bytes, private cache headers, không cookie/login, HEAD không tăng lượt mở, thu hồi, tệp hỏng bị chặn, crash recovery, gates, chống gửi trùng, timeout và lỗi provider.
- 7 kết quả test PostgreSQL cô lập (1 nhóm + 6 trường hợp): migration mới cùng các hàm outbox/snapshot thật trích từ repo; transaction phát hành, grant service-only, SUPER_ADMIN, quan hệ/chi nhánh/credential, idempotency và thu hồi. PGlite dùng schema phụ thuộc tối thiểu; đây không phải rehearsal toàn bộ Supabase migrations trên database Mac.
- 49 kiểm tra hồi quy báo cáo/cổng gia đình đạt sau khi cập nhật kỳ vọng UI cho hành vi mới.
- Typecheck sau `next typegen`, targeted ESLint và `git diff --check` đạt.
- HTTP Next.js thật trên cổng 3130 trong môi trường cô lập, Supabase HTTP mô phỏng: GET 200, reload 200 và cùng bytes, HEAD 200, thu hồi 404; 0 lần gọi auth, 2 lượt yêu cầu PDF, 1 lần upload, PDF 14.793 bytes. `pdftotext` đọc đúng tiếng Việt và không có ghi chú nội bộ.
- **Kiểm chứng trực quan desktop/mobile chưa đạt:** browser CLI không khởi động được vì sandbox chặn socket; cloud browser từ chối trang data URL theo chính sách. Đã dừng thử đường dẫn đó. SSR được kiểm tra nhưng không thay thế kiểm tra thiết kế trong trình duyệt thật, theo AGENTS.md.
- Không truy cập được Mac/cổng 3000/database thật; không tạo/cập nhật mẫu trong console Zalo; không gửi ZBS thật; không đổi production/credential/hạ tầng trả phí.

Chạy lại kiểm tra mã:

```sh
npx next typegen
npm run typecheck
node --test tests/learning-report-public-pdf.test.cjs tests/learning-report-zbs-worker.test.cjs tests/learning-reports.test.cjs tests/family-portal.test.cjs
```

Kiểm tra SQL cô lập cần module `@electric-sql/pglite` (đã kiểm với 0.5.8) cài ở thư mục công cụ riêng; trỏ `REPORT_TEST_PGLITE_MODULE` tới đường dẫn tuyệt đối của module rồi chạy `node --test tests/learning-report-sql.test.cjs`. Nếu không khai báo, test SQL sẽ báo SKIP, không được tính là đạt.
