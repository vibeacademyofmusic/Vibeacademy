# Đào tạo và xếp ca — kiểm chứng local 28/09/2026

## Môi trường
- Repo thực phục vụ: `/Users/macbookair/vibe-academy-system`.
- Nhánh `feature/learning-report-v2`, HEAD `45822a4d9dd56317324f9c554df76b42f55c1199`, giữ nguyên các thay đổi chưa commit.
- PID Next trước sửa 27073; bản cuối: PID 42678 (supervisor 42664). Cổng 3000.
- Database duy nhất áp dụng: container `supabase_db_vibe-academy-system`, API `127.0.0.1:54321`.
- Migration `20260928190000_training_placement_integrity.sql` đã áp dụng và ghi vào sổ migration local. Không reset, không production, không push.
- Backup các file ban đầu và RPC: `.backups/training-consolidation-20260928/`.

## Đã thực hiện
- Một thanh Đào tạo từ cấu hình navigation và component WorkspaceTabs trong layout; bỏ hai thanh trùng ở student workspace. Phòng học vẫn thuộc workspace Học viên/Đào tạo, không thêm sidebar riêng.
- Bỏ thêm thanh Chương trình/Khóa học trùng và dropdown đổi module của Phòng học; bộ lọc q/status vẫn giữ khi đổi chương trình/khóa học. Giữ Programs, Courses, Rooms, Attendance/Retention, Reports và Feedback. Query `tab=feedback`/reports giữ nội dung và trạng thái selected; bộ lọc của nội dung nhúng tiếp tục giữ tab.
- Trạng thái học viên là bộ lọc. Ca dạy/tổng quan ca dạy là chế độ xem; phục hồi đường vào tổng quan và hàng đợi công việc. Các trang đang mở mới tải dữ liệu tương ứng.
- Tab mobile cuộn ngang, active tự vào vùng nhìn thấy; liên kết hỗ trợ bàn phím và aria-current. Không có tràn chiều ngang ở viewport 390px.
- Nhãn Ca dạy/Xếp ca/Đổi ca dùng đối tượng classes hiện hữu. Không tạo entity mới.
- Trigger chung bảo vệ INSERT/reactivation/đổi ca qua RPC, import và ghi trực tiếp: khóa ca và học viên, kiểm tra sĩ số và trùng ghi danh trong transaction. Không sửa class_id của enrollment đã bắt đầu hoặc có lịch sử.
- Xếp/đổi ca kiểm tra chương trình, chi nhánh, cấp độ bằng hàm tương thích sẵn có. Phân công giáo viên theo ngày hiệu lực; phân công không rõ không được coi là hợp lệ.
- Lịch kiểm tra dùng lịch lặp theo ngày hiệu lực, thay thế bởi buổi thực tế khi đổi/hủy lịch; giữ override/snapshot giáo viên, roster học bù và bảo lưu. Hai khoảng liền nhau không xung đột. Thiếu dữ liệu trả lỗi, không coi là CLEAR.
- Request ID ổn định trong form xếp/đổi ca; replay cùng thao tác không thêm enrollment/event; stale version và request ID dùng lại khác mục đích bị từ chối.
- Sĩ số trong list_placement_class_options được aggregate một lần, không ba correlated counts. Gom ca theo chi nhánh/chương trình, batch tương thích cho trang hồ sơ; không tải options khi xem active/paused.
- Form tạo ca/đồng bộ buổi học chỉ hiện khi có quyền quản trị; server authorization vẫn được giữ.

## Kết quả kiểm tra
- 40/40 tests ứng dụng: điều hướng, phân quyền shell, registration placement, mixed-level và work queue.
- 123/123 pgTAP registration placement (fixture bổ sung lịch/phòng hợp lệ).
- 23/23 pgTAP mới: 1–1, nhóm đủ chỗ, liền giờ/trùng học viên/phòng/giáo viên, thiếu lịch, ngày hiệu lực, bảo lưu giữ chỗ, khóa lịch sử, buổi đổi lịch, học bù có/không tham gia.
- Hai kết nối DB đồng thời tranh chỗ cuối: một commit, một PLACEMENT_CLASS_FULL; chỉ một enrollment. Fixture TEST-TP đã dọn, xác nhận còn 0 branch/0 class fixture.
- TypeScript PASS; lint file ảnh hưởng PASS; build webpack PASS. Server dev chạy lại sau build.
- Browser thực: 10 điểm đến, mỗi điểm một training nav và đúng active; không Application error. Kiểm tra refresh, Back/Forward với feedback; keyboard Tab/Shift+Tab; desktop và mobile 390x844. Ảnh chụp được đính trong phiên kiểm tra.
- Browser đăng nhập Local Developer Admin. Các quyền hạn chế được xác minh bằng tests/RPC, chưa đăng nhập từng vai trò trên browser.

## Hiệu năng và giới hạn
- Benchmark RPC thực, 3 ca TEST, cùng database, 5 lượt x 100 calls, rollback toàn bộ fixture: Lượt cuối chạy gần thời điểm khởi động dev: median BEFORE 2.728740 ms/call, AFTER 7.550020 ms/call (AFTER dao động 2.961020–9.823720 ms). Lượt trước ít biến động hơn: 2.495620 / 2.777860 ms. Các số này chưa cho thấy cải thiện thời gian RPC ổn định. Không kết luận nhanh hơn; dataset nhỏ không đại diện quy mô lớn.
- Đã đo thời gian thao tác browser (trước khoảng 5.98s, sau 0.54s) nhưng gồm công cụ, compile/cache và thao tác trên tab; không dùng làm bằng chứng tốc độ server.
- Số 30 SQL ban đầu là bộ đếm vai trò authenticator, không tương đương số truy vấn của riêng request. Các lần đối chứng sau bị HMR/thao tác tab ảnh hưởng; không công bố tỷ lệ giảm query từ các số không so sánh được.
- EXPLAIN ANALYZE trên cùng 3 ca TEST: trước có 3 scans bảng enrollments, mỗi scan 3 loops (9 lượt); sau có 1 scan, 1 loop. Thời gian câu SELECT trong lần này: 2.614 ms trước / 2.437 ms sau. Đây là đo nhỏ, không suy rộng thành tốc độ toàn hệ thống.
- Không thêm index, không thêm cache dùng chung quyền/chi nhánh.
- Danh sách chọn ca có phân trang 100 ca/trang, giữ bộ lọc và trang học viên. RPC không còn cắt ngầm 100 ca. Đã kiểm thử 108 ca trong transaction rollback: cả 8 ca ở trang thứ hai vẫn truy cập được. Danh sách học viên/ca chính giữ phân trang hiện hữu.
- Đổi ca sau khi đã học: chặn sửa trực tiếp enrollment để bảo toàn lịch sử; chưa có workflow chuyển ca sau bắt đầu hoàn chỉnh. Không tuyên bố đã nghiệm thu workflow đó.
- Projection lịch hiện hỗ trợ timezone Asia/Ho_Chi_Minh. Gặp lịch timezone khác trả chưa đủ thông tin, không bỏ qua xung đột.
- Chưa kiểm chứng tải lớn, thời gian dài nhiều năm hoặc thay lịch đồng thời với enrollment. Không chỉnh hồ sơ học viên, thanh toán hay token Zalo thật.

## File ảnh hưởng của lượt này
- app/admin/navigation.ts, WorkspaceSectionTabs.tsx
- app/admin/_components/WorkspaceTabs.tsx, workspace-tabs.module.css
- app/admin/students/ops-shell.tsx, page.tsx, placement-actions.ts, hub.tsx, [id]/ClassEnrollments.tsx
- app/admin/classes/page.tsx, [id]/page.tsx, _ops/Workspace.tsx, _ops/data.ts
- app/admin/feedback/page.tsx; app/admin/reports/learning/page.tsx; app/admin/programs/page.tsx
- supabase/migrations/20260928190000_training_placement_integrity.sql
- supabase/tests/database/training_placement_integrity_test.sql, registration_placement_test.sql
- tests/admin-navigation.test.cjs, admin-shell-access.test.cjs, mixed-level-class-ops.test.cjs, mixed-level-work-queue.test.cjs
- scripts/local-training-placement-race.cjs
