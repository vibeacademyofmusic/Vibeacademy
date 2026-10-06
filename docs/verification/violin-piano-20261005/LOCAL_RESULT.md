# Áp dụng giáo trình Violin/Piano vào local 3000 — 2026-10-05

Đã áp dụng vào database đang phục vụ cổng 3000. Node PID 807 chạy tại /Users/macbookair/vibe-academy-system; API Supabase http://127.0.0.1:54321; PostgreSQL local 54322 trong supabase_db_vibe-academy-system. Không ghi staging/production, không reset, migrate schema, thay quyền, gửi thông báo hay triển khai.

## Kết quả nhập thực tế

Thêm 2 chương trình chính thức (VIOLIN, PIANO), 11 level, 53 môn, 53 nhóm lưu trữ dự thảo, 530 Lesson. Violin Pre–Grade 8: 9 level, 45 môn, 450 bài. Piano Pre Step và Pre: 2 level, 8 môn, 80 bài. Mỗi môn đúng 10 bài; mọi bài mới INACTIVE, không bắt buộc. Đây là khung biên soạn, chưa phải giáo án hoàn chỉnh hay chương trình đã được duyệt.

Local trước nhập chỉ có TEST_VIOLIN/TEST_PIANO và các chương trình khác; không đổi các cây TEST. Không có Piano chính thức Grade 1–8 để kế thừa, nên không tuyên bố đã xây đủ Piano Grade 1–8. Level Piano được kiểm tra thứ tự Pre Step (1) → Pre (2). Violin Pre (1) → Grade 8 (9). Không có dịch số thứ tự hay nội dung cũ hơn 10 bài trong cây mục tiêu mới.

Cả lần chạy thử, lần ghi và lần chạy lại đều kiểm tra checksum 5 bảng enrollment/progress trong transaction khóa bảng; progress_unchanged=true. Chạy thử cuối changes=[] (không trùng). Đọc SQL độc lập xác nhận 53 môn đều đúng 10 bài, mọi bài INACTIVE/optional. Tên bài thử đã khôi phục Lesson 01, INACTIVE, is_required=false.

## Mã nguồn và kiểm tra

Áp dụng patch cho các file mới; không áp dụng phần package.json/package-lock.json vì PGlite 0.5.8 đã có sẵn trong thay đổi local. Không downgrade hay ghi đè công việc khác. HEAD giữ nguyên c843cc6; không checkout, commit, push hoặc deploy.

Importer/plan/SQL/test mới được kiểm tra trước chạy. 21/21 kiểm thử importer/matrix đạt (PGlite PostgreSQL cô lập), 29/29 regression workspace/lesson CRUD đạt; ESLint các file mới và git diff --check đạt. Không thay UI/TypeScript hay schema nên không tuyên bố build hoặc migration mới.

## Sao lưu và bằng chứng

Catalog backup: /var/folders/gl/_pjb8wqs24n1rnjn3s03ypqm0000gn/T/vibe-curriculum-20261005-S9cLPJ/catalog-before.dump
Report gốc: /var/folders/gl/_pjb8wqs24n1rnjn3s03ypqm0000gn/T/vibe-curriculum-20261005-S9cLPJ/import-report.json
Bản sao bằng chứng: local-import-report.json, local-idempotence.json.

Backup custom-format có quyền file 0600/thư mục 0700; pg_restore --list đọc được 59 dòng TOC. Chưa thực hiện restore. Backup chỉ có 5 bảng danh mục, --no-owner/--no-acl; không phải bản phục hồi toàn hệ thống hay quyền/Auth/Storage object bytes. Không restore đè lên dữ liệu mới.

## Trình duyệt

Safari dùng phiên SUPER_ADMIN đã có tại 127.0.0.1:3000. /admin/programs hiển thị đúng VIOLIN/PIANO chính thức, tách mã TEST. Violin Pre/Methode Book hiển thị 10 bài INACTIVE/optional; đã sửa nhãn Lesson 01, lưu, reload xác nhận UI và SQL, rồi lưu lại tên gốc. Screenshot local-violin-pre.png ghi giao diện thật với thẻ trắng, chữ navy và điểm nhấn vàng hiện có. Nhãn Đủ nội dung Lesson của giao diện hiện tại không có nghĩa giáo án đã duyệt.

Đã mở và xác nhận mỗi môn đại diện Violin Grade 1, Grade 4, Grade 8 và Piano Pre Step/Pre đều hiển thị 10 Lesson trên đúng cổng 3000. Bằng chứng: browser-local-checks.txt. Kiểm tra viewport 390px chưa thực hiện; không tuyên bố mobile PASS. Không còn blocker nhập dữ liệu local; giáo án chi tiết và phê duyệt nội dung chưa nằm trong gói khung này.

Mở /admin/programs → Mọi trạng thái → mã VIOLIN hoặc PIANO → Level → Môn → Hiển thị Lesson ngừng sử dụng. Đường dẫn từng môn có ?lessons=all trong local-import-report.json.
