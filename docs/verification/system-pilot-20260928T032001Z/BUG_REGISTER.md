# Sổ lỗi — kết luận đợt local NO-GO

| ID | Mức | Hiện tượng / nguyên nhân | Sửa / bằng chứng | Trạng thái |
|---|---|---|---|---|
| BUG-001 | P0 | Fresh migration dừng tại 20260923040000 vì hàm registration_zalo_connection đã tồn tại với OUT type và tên tham số cũ | Thay chữ ký có drop rõ ràng trong transaction; raw/fresh-migrations-before-fix.log và fresh-migrations.json | 177 migration fresh đạt |
| BUG-002 | P1 | Enrollment hợp lệ ở branch A bị PLACEMENT_SCHEDULE_UNKNOWN do lịch thiếu cấu hình ở branch khác | Migration 20260928220000; 2 kiểm tra tái hiện FAIL trước sửa, 25/25 PASS sau sửa; kiểm tra xung đột thật giữ nguyên | Đã kiểm chứng MAIN |
| BUG-003 | P1 | UI gửi p_application nhưng MAIN giữ p_registration cho hàm Zalo | Migration 20260928221000 chuẩn hóa hợp đồng; 34 kiểm tra Zalo và catalogue grants | Đã kiểm chứng DB; UI Zalo chưa kiểm tra đủ |
| BUG-004 | P1 | Branch Admin thấy nút mở sổ nhưng bị đưa về trang đăng nhập | Cho phép đúng route UUID; kiểm tra can_access_session; chế độ chỉ xem giữ nguyên chính sách ghi; 22 focused tests | Đã retest 31 DB checks + desktop/390px: branch thấy đúng roster, chỉ đọc |
| BUG-005 | P1 | Full DB regression không chạy được nhiều kịch bản do fixture chưa đáp ứng academic scope và placement prerequisites; có legacy import và student ops failures | raw/db-baseline.log và raw/db-final.log; không bỏ assertion, không tắt trigger | OPEN — chặn technical acceptance |
| BUG-006 | P2 | Ba Node suites dùng cấu trúc navigation hoặc module loader đã lỗi thời | Bộ nạp phân giải tương đối; xác minh workspace tabs và quyền shell thay vì sidebar cũ | Đã sửa, full Node PASS |
| BUG-007 | P2 | Lint: CommonJS bị áp import rule; các any, state trong effect và clock trong render | Quy tắc theo đúng .cjs; khai báo kiểu dữ liệu, dọn state tại event, snapshot thời gian | Lint/typecheck PASS; QR và teacher UI đã xem; các trang HR khác chưa duyệt đủ |
| TEST-001 | — | Test scope-change đo raw student chưa có enrollment nên kỳ vọng sai với student_branch_permission | Kiểm tra quyền scope hiện hành và mất quyền scope cũ; giữ log FAIL đầu tiên, không thay production policy | 9/9 API security PASS |

| BUG-008 | P1 | Branch mở được session nhưng raw enrollment RLS trả 0, tạo empty roster sai | Narrow attendance_roster_read dùng canonical dated roster, account/role/can_access_session; không mở enrollment policy hoặc write grants; 31 DB checks, browser 1 học viên | Đã sửa local |
| BUG-009 | P1 | Portal chỉ đọc summary legacy, PDF có nhận xét V2 nhưng portal hiện Chưa có nhận xét | Dùng chung whitelist summary-labels; regression V2/legacy/internal-note, kiểm tra PDF và portal bản cuối | Đã sửa local |
| BUG-010 | P1 | Khung 4/37/188/1440 khác mục tiêu 4/37/184/2640; Piano Pre Step chưa ready | raw/academic-counts.json, mapping.json | OPEN — cần đối soát nội dung/mapping, không sinh nội dung tùy ý |
| BUG-011 | P1 | HR vẫn nhiều mục chính, không khớp yêu cầu một mục theo CRM | qr-stopped.png; chưa đổi cấu trúc navigation trong đợt này | OPEN |
| TEST-002 | — | Rehearsal runner có lỗi cú pháp trước khi gửi request | Đã sửa và node --check; chỉ chạy baseline 305 samples, chưa 60 phút | NOT_RUN cho stability |
| TEST-003 | — | Fresh migration runner bỏ dòng thành công cuối khi resume | Sửa giữ records trước resume filename, trả exit nonzero khi fail; rerun placement trên fresh ghi chứng cứ thật | Đã sửa hồ sơ, 177/177 |
| TEST-004 | — | Teacher workspace fixture tạo enrollment trước schedule, submit khi chưa COMPLETED | Đưa schedule lên trước; thêm assertion chặn submit SCHEDULED, hoàn thành buổi trước xét nội dung | 29/29 PASS, không bỏ assertion |
