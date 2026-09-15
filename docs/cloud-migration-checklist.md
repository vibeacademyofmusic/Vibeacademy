# Cloud Migration Checklist

Ngày audit: 2026-09-15. **Chỉ audit đã hoàn thành; staging và production apply chưa được cấp phép.**

## Audit đã thực hiện

- [x] Chủ dự án xác nhận Vercel Production hostname `qhznfywwrhmcwbkujclm.supabase.co`.
- [x] CLI linked project cùng ref; Vercel Production `7f298ed` Ready đã quan sát.
- [x] Ghi nhận Production/Preview cùng phạm vi biến Supabase; không đọc khóa.
- [x] Đọc ledger: local 49, cloud 28, thiếu 21; lập danh mục/hashes M01–M21.
- [x] Đọc source migration, dependencies, top-level DML so với DML trong RPC.
- [x] SELECT READ ONLY counts, SUPER_ADMIN/profile, teacher resolution và object presence.
- [x] Cloud có dữ liệu; admin ACTIVE/global hiện hợp lệ; teacher_branches=0.
- [x] Xác định view Attendance thiếu; minimal functional chain M14→M15 chưa được rehearsal subset.
- [x] Lập route map, security/data risks, backup/recovery và staging plan.
- [x] Không apply migration, sửa data/roles, tạo staging hoặc deploy.

## Gates còn mở — owner và operator phải hoàn thành trước production

- [ ] Owner duyệt Option C, staging region/version/cost/access/retention.
- [ ] Xác nhận staging ref riêng; cấu hình Preview không trỏ production; secrets tách biệt.
- [ ] Owner duyệt sao chép dữ liệu và cấu hình non-production không gửi thông báo/payout.
- [ ] Xác minh backup/PITR/restore capability thực tế, RPO/RTO và recovery operator.
- [ ] Hoàn tất backup schema+data+auth+ledger+sequences; storage files/config riêng nếu có.
- [ ] Restore thử thành công và đo thời gian, lưu bằng chứng ngoài Git.
- [ ] R1: 49 migrations fresh staging + representative fixtures PASS.
- [ ] R2: restore 28-version production-like baseline, tạo edge cases trước upgrade, chạy M01→M21 PASS.
- [ ] Xác nhận mỗi file transaction/ledger behavior và xử lý partial failure; không assume toàn chain atomic.
- [ ] Preflight lại objects, constraints, policies và migration hashes; không CREATE trùng object drift.
- [ ] Tất cả admin cần dùng có profile ACTIVE/global role phù hợp; login authenticated PASS.
- [ ] Review existing role codes/mappings và active defaults; không tự đổi role legacy.
- [ ] Owner giải quyết hoặc chấp nhận có ghi nhận residual inactive feedback/payroll self-read; kiểm chứng API trực tiếp trên staging.
- [ ] Primary teacher theo ngày, substitute history và mọi completed unresolved được review trước snapshot.
- [ ] Membership teacher_branches được owner chuẩn bị cho vận hành; không tự seed rate/role.
- [ ] Tuition/pauses trước upgrade được reconcile; không recalculate production ngầm.
- [ ] Constraints/grants/search_path/RLS final catalog đạt yêu cầu; scripts dùng direct Finance DML được inventory.
- [ ] Login, Attendance, Finance, Payroll, Reports, Feedback, Operations, Tuition/Reminder desktop/mobile PASS.
- [ ] Cross-branch, inactive profile, expired role, parent link và substitute isolation negative tests PASS.
- [ ] Financial totals theo currency, immutable snapshots, no duplicate/no unexpected rewrite PASS.
- [ ] Build/ESLint/all app/bootstrap/pgTAP PASS trên môi trường test, count không giảm bất thường.
- [ ] Owner phê duyệt manifest production cụ thể, window, write freeze, restore criteria, rollback authority.
- [ ] Recheck cloud ngay trước apply (audit counts không thay thế preflight mới).

## Bằng chứng cần ghi trong phase được duyệt sau

- [ ] Ref production và staging; code SHA; SHA-256 từng migration không thay đổi.
- [ ] Backup ID/time, location/access, restore test log và RPO/RTO đã chốt.
- [ ] Pre/post ledger và catalog, exact aggregate counts, security smoke identity/role (không mật khẩu).
- [ ] Mỗi checkpoint: start/end, committed versions, errors/lock duration, operator.
- [ ] Trạng thái app writes, jobs/integrations, compatibility và decision khi failure.
- [ ] Production read-only smoke sau apply; không chạy test fixtures/pgTAP trên production.
- [ ] Owner xác nhận mở traffic và đóng migration window.

Liên quan: [Audit](cloud-schema-audit.md), [Migration plan](cloud-migration-plan.md).
