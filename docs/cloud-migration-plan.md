# Safe Cloud Migration Plan

Ngày: 2026-09-15. Target production đã xác nhận: `qhznfywwrhmcwbkujclm`. Code `7f298ed`.
**PLAN ONLY — không có lệnh apply được thực hiện hoặc được phê duyệt bởi tài liệu này.**

Chi tiết 21 files, phân loại, dependencies và hashes: [Cloud Schema Audit](cloud-schema-audit.md).

## 1. Lựa chọn

- **A — apply tất cả 21 theo thứ tự ngay:** không chọn ở thời điểm này. Cloud có dữ liệu và app đang hoạt động; PASS fresh local không chứng minh upgrade an toàn.
- **B — subset trước:** không chọn. M14→M15 là chuỗi chức năng Attendance nhỏ nhất suy từ source trên baseline hiện có, nhưng không hoàn tất Security/Finance/Operations; M20 còn tham chiếu nhiều object trong toàn bộ chain. Chưa rehearsal subset, không được cherry-pick hay đánh dấu các file chưa chạy là đã apply.
- **C — staging riêng và rehearsal toàn bộ chain:** khuyến nghị. Sau khi hai đường rehearsal PASS, owner mới quyết định cấp phép production apply theo thứ tự M01→M21.

Không đổi timestamp, không sửa migration lịch sử, không chạy db reset hoặc db push lên production trong phase audit. Không dùng Preview hiện tại làm staging: Vercel hiện gán các biến Supabase cho cả Production và Preview.

## 2. Điều kiện đầu vào cần owner quyết định

1. Chấp thuận tạo staging riêng, chi phí/region/Postgres version phù hợp, người có quyền truy cập và thời gian lưu dữ liệu.
2. Chọn phương pháp backup/restore thực sự có trên gói Supabase hiện tại; chưa xác minh có PITR/restore-to-new-project khả dụng. Chốt RPO/RTO, maintenance window và người ra quyết định rollback.
3. Chấp thuận sao chép dữ liệu production vào staging hạn chế truy cập nếu cần. Ưu tiên dữ liệu đã giảm nhận diện nhưng phải bảo toàn relationships, dates, role statuses và edge cases để test upgrade. Không đưa backup/raw rows/credentials vào Git.
4. Quyết định residual security trong audit (inactive respondent/payroll self-read), chuẩn hóa role naming và teacher-branch membership. Không tự tạo quyền hoặc rate để qua test.
5. Có recovery operator dùng quyền quản trị platform/database độc lập với app; không tắt RLS hoặc grant toàn bộ để cứu login.

## 3. Hai đường rehearsal bắt buộc

### R1 — Fresh database reproducibility

1. Sau phê duyệt, tạo Supabase staging mới, ghi rõ hostname/ref khác production. Kiểm tra target trước mọi lệnh ghi. Dùng thư mục/cấu hình staging riêng, không thay link production trong checkout làm việc này một cách âm thầm.
2. Áp dụng **toàn bộ 49 migrations** trên database rỗng theo thứ tự; system roles thuộc migration, không seed auth user trong migration. Giữ file migration rỗng.
3. Provision tài khoản kiểm thử trên staging bằng cơ chế dành cho staging được duyệt. `local:bootstrap-admin` chỉ cho loopback, không dùng nó với staging, không bypass guard.
4. Tạo dữ liệu đại diện: nhiều branch, primary/substitute teachers, completed/cancelled sessions, active/inactive accounts, expired roles, parent links, tuition/pause, invoice/payment/refund, reminders, reports, payroll. Không gửi email/Zalo thật hoặc payout.
5. Chạy app bằng cấu hình staging cách ly; chỉ cấu hình Preview riêng nếu owner duyệt, không thay Production URL/key. Thiết lập redirect URLs/auth/email/storage/webhooks riêng.
6. Chạy regression tests ở môi trường được xác minh staging, browser desktop/mobile và negative authorization checks.

### R2 — Upgrade từ trạng thái production có dữ liệu (quan trọng hơn R1 cho rollout)

1. Phục hồi bản backup nhất quán của production vào staging riêng hoặc reset **staging được xác minh** về snapshot nguồn; không phục hồi đè production. Bảo toàn schema, data, auth references, roles/grants và migration ledger theo phương pháp backup đã được kiểm chứng.
2. Xác nhận ledger đúng 28 versions tới `20260914170000`, tồn tại dữ liệu đại diện trước migration. Không áp 49 migration lên bản đã restore baseline.
3. Chụp preflight: exact counts, admin ACTIVE/global, role mappings, tuition dates/amounts/currency, completed teachers, grants/policies/functions; so với audit và hash manifest. Tạo edge-case dữ liệu **trước upgrade** trên staging để kiểm chứng backfill, không chỉ seed sau apply.
4. Áp dụng 21 missing migrations M01→M21 bằng runner đã chọn; lưu kết quả từng version. Chặn app traffic trong các trạng thái trung gian để không lộ RPC chưa được harden.
5. Đo duration, lock waits và lỗi với dữ liệu tương đương. Không giả định 21 files là một transaction: kiểm chứng transaction boundary và ledger behavior của runner/CLI dùng trong rehearsal. Không retry mù CREATE TABLE/function/index sau lỗi.
6. Chụp catalog sau mỗi checkpoint và thực hiện kiểm tra nội bộ bằng quyền phù hợp; chỉ mở app thử sau M21. Checkpoints phục vụ quan sát, không cho phép mở traffic giữa chuỗi:
   - M03: Academic date/tuition trigger definitions.
   - M10: Finance views và nguyên vẹn tuition.
   - M15: actual-teacher backfill/feedback/report contracts.
   - M17: Payroll history guards.
   - M21: toàn bộ ACL, RLS, auth và API smoke.
7. Diễn tập khôi phục từ backup; đo thời gian thực. Re-run comparison để chứng minh restore bao gồm dữ liệu và identity, không chỉ schema.

## 4. Smoke tests và reconciliation

- **Login:** SUPER_ADMIN ACTIVE còn dùng được; inactive/missing-profile admin bị từ chối đúng. Test bằng phiên authenticated thật, không chỉ service-role.
- **Attendance:** hôm nay VN, branch/class filters, empty state hợp lệ, ngày có sessions; primary/substitute đúng người; completed snapshot không drift. Trường hợp primary 0 hoặc >1 phải báo unresolved và chặn payroll, không đoán giáo viên.
- **Finance:** đọc views và tạo/issue/pay/allocate/void/refund trên fixture staging; sum theo từng currency. Invoice total/tuition amount không tự đổi do upgrade; outstanding = billed trừ posted allocation cộng refund theo engine; cash ledger khớp payment/refund, không đồng nhất cash với revenue.
- **Payroll:** MONTHLY full-period coverage; thiếu/gap rate fail; substitute B được giờ, A không nhận giờ đó; cancelled không tính; generate không duplicate; adjustment riêng; APPROVED/FINALIZED không regenerate hoặc sửa earning. Xác minh teacher read và account-disabled residual.
- **Reports:** generate→READY→APPROVED, snapshot giữ nguyên sau source đổi, print; không rewrite Academic/Attendance.
- **Feedback:** valid/invalid respondent, cross-student, inactive profile/link, duplicate, actual teacher và privacy. Không gửi khảo sát thật.
- **Operations:** branch admin chỉ branch được gán; teacher chỉ relationship hợp lệ, substitute chỉ buổi liên quan; không lộ contact/internal notes; parent/student không tự có scope Attendance rộng.
- **Tuition/Reminder:** preview pricing khớp insert, discount khóa sau invoice, pause effective end đúng; generate idempotent, skip/cancel; không gửi notification thật.
- **Migration reconciliation:** không mất ID/rows trước upgrade ngoài biến đổi được mô tả; M15 snapshot count = số COMPLETED ở cutover; attribution unresolved đã được owner xét; tuition không bị bulk recompute; role activation/mapping diff chỉ gồm dự kiến. Các bảng mới bắt đầu 0 trước fixture/action, không import tiền/lương ngầm.
- Chạy build, relevant ESLint, toàn bộ app/bootstrap tests và pgTAP trên local/staging cách ly. Baseline hiện có: 103 tests app/bootstrap; pgTAP 33 files/548 tests. Mọi thay đổi count phải giải thích. Không chạy pgTAP trên production.

## 5. Backup và recovery

**Trước production apply trong phase sau:**

- Tạo recovery point nhất quán với ledger/schema/data; lưu thời gian UTC và VN, database ref, code SHA, CLI/Postgres versions, hashes migration, backup ID và nơi lưu mã hóa ngoài repository.
- Schema backup: tables, views, functions, triggers, policies, ACL/default privileges, sequences, extensions và migration ledger. Schema-only dump không đủ phục hồi.
- Data backup: public business data, auth identity liên quan, role/mapping rows, sequence values; kiểm tra phương pháp được chọn có bao gồm auth và ledger. Giữ reference integrity, không giả định dump mặc định chứa mọi schema.
- Sao lưu/lập inventory riêng cấu hình Auth, redirect/SMTP/OAuth, secrets quản lý an toàn, storage files nếu có, jobs/webhooks/Edge Functions. Database backup không chứa byte của Storage objects. [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups).
- Nếu dùng restore-to-new-project, xác minh eligibility và những thành phần cần cấu hình lại; không giả định clone app/deployment/integrations cùng database. [Supabase Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).
- Chứng minh restore trên staging trước khi gọi backup là usable. Không tạo data dump production trong phase audit này.

**Tiêu chí dừng/restore:** migration fail, ledger/catalog lệch, mất admin access, exposed cross-branch data, unexpected tuition change, wrong completed teacher attribution, Finance mismatch, payroll overwrite hoặc downtime vượt window đã duyệt. Dừng ghi mới, lưu log không secrets; không tiếp tục khi chưa biết migration nào đã commit.

**Khi rollback còn an toàn:** transaction chưa commit thì runner rollback transaction đó; khi đã commit nhưng app vẫn chặn ghi và có backup nhất quán thì restore checkpoint đã diễn tập theo quyết định owner. Không assume `ROLLBACK` hoàn tác các files trước đã commit hoặc sequence changes.

**Sau khi đã có ghi mới:** restore cũ có thể mất payment, report, feedback hoặc payroll hợp lệ. Giữ nguyên evidence, sao lưu trạng thái lỗi, ưu tiên forward-fix được review và reconciliation. Chỉ restore khi owner chấp nhận data-loss/replay plan theo RPO. Không viết down SQL DROP ledger; không mở immutability guards để sửa trực tiếp. Finalized payroll V1 chưa có general reversal workflow sau chốt, nên correction cần quyết định riêng, không giả định engine đã hỗ trợ.

App rollback trên Vercel không rollback database. Nếu cần phục hồi app phải chọn code tương thích schema thực tế; đó là thao tác riêng cần phê duyệt, không thực hiện trong audit.

## 6. Production apply phase sau (chưa được phép)

Sau owner sign-off, rehearsal PASS và backup restore PASS: quiesce app writes/jobs, recheck target+ledger+hashes+preflight, apply manifest đúng thứ tự với checkpoint, xác minh authenticated admin/RLS/contracts rồi mới mở traffic. Refresh schema cache nếu cần bằng phương án được duyệt. Dùng smoke chỉ đọc production trước; mọi write-test production cần phê duyệt riêng. Không tự chạy SQL grant/repair/recalculate để vượt lỗi.
