# Thu tiền mặt tại quầy

Nguồn: production commit `024f282edb7f09fb25adc806fc77b2a4c6ea8751`, nhánh phát triển `codex/counter-cash-20261029`.

## Hành vi

- Hồ sơ đăng ký đã xác minh và chốt học phí có mục **Thu tiền mặt tại quầy**. Nhập tiền thực nhận, hạn thanh toán hết học phí và xác nhận đã nhận tiền.
- Gia hạn chọn **Tiền mặt tại quầy**, chuẩn bị hóa đơn rồi xác nhận tiền thực nhận. Không gọi payOS cho lựa chọn này.
- Cọc tối thiểu theo thỏa thuận 50% hoặc đủ 100%; cho phép thu nốt sau đó. Phiếu thu, phân bổ công nợ và cập nhật hồ sơ nằm trong một giao dịch database.
- Đăng ký đủ điều kiện chuyển sang hàng chờ xếp ca. Thu tiền không tự xếp ca, đổi ngày bắt đầu học hoặc tạo điểm danh.
- Thu cọc và thu nốt dùng chung hóa đơn. Khi tạo kỳ học phí cho ghi danh sau đó, hóa đơn đăng ký được gắn lại qua hồ sơ xếp ca đã xác nhận, không phát sinh hóa đơn thứ hai.
- Quyền thu tiền mặt và quyền hoàn tất đăng ký/chuẩn bị gia hạn được kiểm tra theo chi nhánh tại database. Không cấp thêm quyền cho nhân viên.
- Gửi lại cùng yêu cầu trả phiếu cũ. Gửi yêu cầu mới trên công nợ đã thay đổi bị từ chối. Đơn QR mở/chưa rõ kết quả chặn tiền mặt; chuyển khoản đến sau hủy QR được lưu để đối soát, không tự ghi thêm tiền vào công nợ.
- Chứng từ nội bộ, lịch sử tài chính và các quy trình duyệt hoàn/hủy hiện hữu được giữ. Không sửa giá chi nhánh hoặc bật gửi Zalo.

## Migration có phạm vi cụ thể

1. `20261026211910_restore_rollout_audit_prerequisite.sql`: đưa DDL của bảng audit riêng đã có trên production vào nguồn. Bản cũ `20261026211911` tham chiếu bảng này nhưng thiếu migration tạo bảng; thứ tự này sửa clean replay. Đối chiếu cột, ràng buộc, RLS, ACL và index từ catalog production ngày 29/10. Không chứa dữ liệu học viên; không sửa migration đã phát hành.
2. `20261029015011_counter_cash_receipts.sql`: bảng yêu cầu thu bất biến, liên kết hóa đơn với đăng ký trước xếp ca, các hàm thu/đọc, bảo vệ khoản QR đến muộn và dùng lại hóa đơn.

Hàm `operational_admin()` có trên production nhưng không có trong lịch sử migration. Quyền của wrapper tạo hóa đơn dùng cùng điều kiện đã xác minh (`SUPER_ADMIN` hoặc `OPERATIONS_LEAD` toàn cục đang hoạt động), không thêm role hay quyền vào dữ liệu thật.

## Kiểm chứng và giới hạn

- Replay toàn bộ migration trong PostgreSQL PGlite cô lập; dữ liệu giả, không kết nối production. Dịch vụ Auth/Storage/Vault được mô phỏng cho môi trường thử; đây không phải bản phục hồi production.
- `node --test tests/counter-cash-database.test.cjs tests/counter-cash-actions.test.cjs`: thu cọc/nốt, idempotency, rollback lỗi giữa chừng, quyền chi nhánh/anonymous, QR trước tiền mặt, QR đến muộn, tái sử dụng hóa đơn, kiểm tra server action.
- `node scripts/test-counter-cash-browser.cjs`: thành phần giao diện thật + server action thật + SQL thật trong harness cô lập; kiểm tra màn hình 1440px/390px, xác nhận nhận tiền, thu cọc/nốt và tải lại. Không thay cho kiểm tra phiên đăng nhập Next trên deployment thật. Ảnh thử nằm ngoài Git trong `.backups/counter-cash-browser`.
- `node scripts/test-counter-cash-concurrency.cjs`: ba tình huống hai kết nối PostgreSQL thực, chỉ chạy trong GitHub Actions với database dùng riêng rồi hủy. Chưa coi đạt cho đến khi job hoàn tất.
- Build, typecheck, lint và kiểm thử nghiệp vụ hiện hữu được chạy cùng bản thay đổi; kết quả CI phải gắn đúng commit trước phát hành.

## Phát hành và tắt tính năng

Chưa áp database hay triển khai production trong bước xây dựng này. Auto-deploy Git được tắt riêng cho nhánh phát triển. Không dùng `supabase db push` để đẩy cả lịch sử.

Trước phát hành: khóa đúng commit đã qua CI; kiểm lại domain/project; sao lưu mới dữ liệu và định nghĩa các đối tượng chịu tác động, xác minh phục hồi; đối chiếu schema thực với giả định của hai migration. Sau đó áp đúng tệp chọn lọc và triển khai cùng commit trước khi chuyển domain. Smoke test production chỉ đọc; không tạo phiếu thu tiền thật giả để kiểm thử.

Nếu thu tiền gặp sự cố: dùng `scripts/sql/disable-counter-cash-20261029.sql` để dừng hai RPC ghi mới; giữ bảng phiếu thu, allocations, invoices và hàm đọc. Không xóa tiền/phiếu đã ghi. Sau khi đã có phiếu tiền mặt, không dùng giao diện cũ vốn chỉ đếm QR để kết luận số đã thu; dùng sổ phiếu thu/công nợ hoặc bản sửa tiếp theo. Việc bật lại quyền cần đi kèm bản đã sửa và kiểm chứng.

Phạm vi chưa có: mở/đóng két, đối chiếu bàn giao quỹ cuối ca, phần cứng máy in/POS và tự gửi biên nhận qua Zalo.
