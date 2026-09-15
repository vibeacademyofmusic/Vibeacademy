# Cloud Schema Audit

Ngày audit: 2026-09-15 (Asia/Ho_Chi_Minh). Code checkpoint: `7f298ed` trên `main`.
**Kết luận: audit chỉ đọc hoàn tất; HOLD production apply. Khuyến nghị Option C.**

## 1. Target và bằng chứng

- Vercel project `vibeacademy` thuộc team `vibeacademyofmusic`; domain `vibeacademy-pink.vercel.app`, môi trường **Production**, deployment `7f298ed` Ready đã thấy trong dashboard.
- Chủ dự án xác nhận `NEXT_PUBLIC_SUPABASE_URL` = `https://qhznfywwrhmcwbkujclm.supabase.co`. CLI linked ref cũng `qhznfywwrhmcwbkujclm`: **MATCH**.
- Dashboard cho thấy `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` áp dụng Production và Preview, loại Secret/write-only. Giá trị hostname xác nhận bởi chủ dự án, không được giải mã/đọc lại từ Vercel. Không mở khóa truy cập.
- Chưa xác định staging độc lập. Preview hiện cùng phạm vi biến với Production; không dùng Preview làm staging trước khi cấu hình tách biệt được duyệt.
- Lượt này đọc lại `supabase migration list --linked`: local 49 / remote 28, thiếu đúng **21**, không có remote-only timestamp. Cần Thơ `20260909100000` đã có trên ledger. Migration rỗng `20260910201008` giữ nguyên, đã có ledger, superseded bởi `20260910202237`.
- Đã dùng `inspect db table-stats --linked` (ước lượng), sau đó transaction `READ ONLY` với SELECT aggregate và catalog để lấy số đếm chính xác. Không lấy tên, email, mật khẩu hoặc nội dung học tập.
- Ledger xác nhận version, không chứng minh checksum của toàn bộ migration lịch sử hay rằng mọi object cloud giống hoàn toàn local. Chưa diễn tập upgrade/restore trong phase này.

## 2. Danh mục migration còn thiếu

M01–M21 là mã tham chiếu của tài liệu, không thay đổi filename/timestamp. Dependency bên dưới phân biệt nguồn engine trực tiếp và chuỗi triển khai khuyến nghị; **không phải manifest cho phép cherry-pick**.

A = SCHEMA-ONLY (DDL: table/view/index/function); B = SECURITY; C = DATA TRANSFORM lúc apply; D = BUSINESS ENGINE; E = POTENTIALLY DESTRUCTIVE (thay trigger, siết constraint/quyền/guard). Một migration có nhiều nhãn; A không có nghĩa là migration đó chỉ chứa DDL hoặc ít rủi ro. UPDATE/DELETE trong thân RPC chỉ chạy khi được gọi, không được tính nhầm thành backfill lúc apply.

| MIGRATION | PURPOSE | CATEGORY | DEPENDENCIES | RISK | REVERSIBLE? | REQUIRES DATA CHECK? | REQUIRED FOR CURRENT ONLINE FEATURES? |
|---|---|---|---|---|---|---|---|
| M01 `20260914201223_future_academic_start_scheduling.sql` | Cho phép ngày học tương lai; chặn sửa progress trước ngày bắt đầu | A,B,D,E | Academic hardening đã áp dụng | Cao: thay semantics ngày và trigger | Chỉ trước phát sinh lịch tương lai | Có: ngày/grade/progress hiện hữu | Academic scheduling |
| M02 `20260915050000_edit_academic_program_start_date.sql` | RPC sửa ngày bắt đầu, đồng bộ enrollment/grade | A,B,D | M01 + Academic baseline | Cao: bản đầu thiếu kiểm tra SUPER_ADMIN trong thân RPC; cần M18 trước mở traffic | Khôi phục định nghĩa; không tự hoàn tác ngày đã sửa | Có: progress đã bắt đầu/completed | Student Academic edit |
| M03 `20260915060000_pause_tuition_effective_end.sql` | Tính effective end từ các pause tới điểm cố định | A,B,D,E | Tuition/pauses baseline | Cao: trigger mới đổi kết quả các lần ghi sau | Không tự khôi phục các ngày đã recalculated | Có: pauses, tuition và giới hạn vòng lặp 1000 | Tuition/pause/forecast |
| M04 `20260915070000_invoice_engine_v1.sql` | Invoices/items, sequence và RPC phát hành/hủy | A,B,D | Tuition pricing baseline; M03 cho ngày hiệu lực đúng | Cao: snapshot tài chính, FK/unique | Chỉ khi chưa có chứng từ; sau đó restore/forward-fix | Có: kỳ học phí, branch snapshot, currency | Invoices/Finance |
| M05 `20260915080000_payment_engine_v1.sql` | Payments/allocations và hủy thanh toán | A,B,D | M04 | Cao: phân bổ/void tiền | Không drop sau có ledger | Có: invoice và khoản phân bổ | Payments/Finance |
| M06 `20260915090000_debt_engine_v1.sql` | Views công nợ từ invoices và posted allocations | A,B,D | M04–M05 | Vừa: thay cách đọc công nợ | Có thể khôi phục views khi chưa có downstream | Có: reconcile theo currency | Receivables/Finance |
| M07 `20260915100000_lock_tuition_discount_after_invoice.sql` | Khóa discount khi đã có invoice | A,D,E | M04 + tuition guard baseline | Cao: siết ghi trên bảng tuition hiện hữu | Không nên tháo khóa lịch sử sau phát hành | Có: tuition/invoice consistency | Tuition discount lock |
| M08 `20260915110000_refund_engine_v1.sql` | Refund ledger; thay invoice_receivables tính refund | A,B,D | M04–M06 | Cao: đổi số dư derived; thêm ledger | Không drop sau phát sinh refund | Có: refund/payment/allocation reconciliation | Refunds/Finance |
| M09 `20260915120000_finance_engine_v1.sql` | Cash ledger, daily/monthly/branch Finance views | A,B,D | M04–M06,M08 | Vừa: số tiền tổng hợp đọc trực tiếp | Khôi phục views có kiểm tra downstream | Có: tổng tiền từng currency | Finance dashboard |
| M10 `20260915130000_revenue_forecast_v1.sql` | Dự báo renewal và công nợ hai tháng VN | A,B,D | M06,M08; tuition baseline/M03 | Vừa: không phải doanh thu chắc chắn | Khôi phục views | Có: end dates và công nợ | Finance forecast |
| M11 `20260915140000_tuition_operations_rpc.sql` | Preview/create tuition, preview/update discount RPC | A,B,D | M04,M07; tuition pricing, M03 | Cao: RPC ghi giá và kiểm tra khóa hóa đơn | Không hoàn tác dữ liệu phát sinh bằng drop RPC | Có: pricing ưu tiên chi nhánh, invoice lock | Tuition Operations |
| M12 `20260915141000_tuition_reminder_engine_v1.sql` | Reminder engine, windows, KPI, invalidation triggers | A,B,D | Tuition/enrollment baseline; M03 cho effective end | Vừa: tạo/hủy reminder khi gọi hoặc cập nhật status | Không xóa lịch sử sau tạo reminder | Có: eligibility, dates, idempotency | Tuition Reminder |
| M13 `20260915150000_learning_reports_v1.sql` | Learning reports, snapshot, events, source/list views | A,B,D | Academic/session/attendance/journal/pause baseline | Cao: khóa snapshot khi approve | Không drop khi đã approve | Có: historical context, report periods | /admin/reports/learning |
| M14 `20260915160000_lesson_feedback_v1.sql` | Feedback, events, aggregates, relationship RPC | A,B,D | Session/class teacher/student/parent/attendance baseline | Cao: dữ liệu nhận xét nhạy cảm và quyền respondent | Không drop sau có lịch sử | Có: relationships/ratings/teacher attribution | Feedback; prerequisite M15 |
| M15 `20260915170000_session_teacher_assignment_v1.sql` | Actual teacher view, overrides và historical snapshots | A,B,C,D,E | M14 cho feedback RPC đầy đủ; session/journal baseline | Cao: backfill khóa giáo viên kể cả unresolved | Không tự suy ra down migration an toàn sau snapshot | Có: tất cả COMPLETED và teacher history | Attendance/Session assignment/Payroll |
| M16 `20260915180000_teacher_payroll_v1.sql` | Payroll periods/rules/earning/adjustment/events | A,B,D | M15 + teachers/teacher_branches baseline | Cao: dữ liệu lương và immutability | Không drop sau approve/finalize | Có: teacher membership/rates/coverage | Payroll |
| M17 `20260915181000_payroll_history_guards.sql` | Guard payroll identity, adjustments và audit | A,B,D,E | M16 | Cao: siết ghi/delete kể cả privileged | Không gỡ guard để sửa finalized | Có: payroll identities/states nếu tồn tại | Payroll integrity |
| M18 `20260915190000_security_rpc_surface.sql` | Thu hồi internal RPC; thêm auth vào edit Academic date | A,B | M02,M03 + is_enrollment_paused_on baseline | Cao: đóng lỗ quyền ở giai đoạn trung gian | Không rollback mở lại RPC không được bảo vệ | Có: callers/grants/authenticated smoke | Security cho các engine |
| M19 `20260915191000_authorization_foundation.sql` | Validity user_roles; ACTIVE account; roles/permissions | A,B,C,E | M18 trong chuỗi khuyến nghị; bảng identity baseline | Cao: has_role toàn hệ thống đổi điều kiện | Không rollback tự động mappings/identity semantics | Có: active global SUPER_ADMIN bắt buộc | Auth mọi route; nền /operations |
| M20 `20260915192000_security_unused_grants.sql` | Trusted search_path, revoke EXECUTE/TRUNCATE/finance DML | A,B,E | M01–M19: ALTER FUNCTION/REVOKE tham chiếu nhiều module | Cao: client cũ/direct DML bị từ chối | Không khôi phục blanket grants | Có: function ACL + external scripts | Security toàn bộ app |
| M21 `20260915200000_branch_relationship_scope.sql` | Branch/teacher scope, parent activation, policies/RPC | A,B,C,E | M19,M15; M20 trước mở traffic; baseline policies | Cao: mở quyền theo role mapping, thu hẹp metadata | Không tháo policy mù; cần security restore đã review | Có: assignments, branches, dates, parent links | /operations và scoped RLS |

## 3. Cloud data: SELECT chính xác tại thời điểm audit

| Bảng / điều kiện | Rows |
|---|---:|
| profiles / user_roles | 1 / 1 |
| roles / role_permissions | 8 / 10 |
| students / enrollments / student_curriculum_enrollments | 2 / 2 / 2 |
| enrollment_tuition (noncancelled) | 1 (1) |
| enrollment_pauses / ACTIVE pauses | 0 / 0 |
| session_occurrences / COMPLETED sessions | 0 / 0 |
| attendance_records / learning_journals | 0 / 0 |
| student_parents / teacher_branches | 0 / 0 |
| SUPER_ADMIN assignments / global / ACTIVE-profile | 1 / 1 / 1 |
| SUPER_ADMIN missing/inactive profile | 0 |
| Tuition bad date order | 0 |
| Completed session unresolved/ambiguous primary teacher | 0 (không có completed session) |

Catalog kiểm tra 39 tên table/view/sequence do chuỗi pending khai báo: tất cả chưa tồn tại, chưa thấy name collision ở tập relation này (chưa bao gồm mọi function/index/policy). Policy identity cloud vẫn là self-profile/own-role + SUPER_ADMIN; M19 bổ sung status guard để self-update không tự kích hoạt lại account.

Các bảng invoices, invoice_items, payments, payment_allocations, refunds, refund_allocations, tuition_reminders, learning_reports, lesson_feedback, teacher_compensation_rules, payroll_periods và các bảng/view session teacher **chưa tồn tại**; không gọi đây là bảng rỗng. Role assignments khác SUPER_ADMIN đều bằng 0. Các số này không được dùng thay preflight ngay trước apply.

## 4. Online dependency map

| Route thật | Contract đang dùng | Migration thiếu / ảnh hưởng |
|---|---|---|
| `/admin/attendance` | session_actual_teachers + attendance_records, schedules/classes/branches/rooms/teachers | M15 tạo view; M14 hoàn chỉnh dependency feedback; M19–M21 đổi auth/RLS |
| `/admin/attendance/[id]` | session/attendance/makeup/pauses và SessionTeacher UI | baseline + M15; giữ quyền admin/RPC hiện có |
| `/admin/session-teachers` | actual teacher, assignments, set_session_teacher | M14–M15 + security rollout |
| `/admin/finance` | finance_cash_ledger, branch_monthly_cash_summary, branch_finance_summary, forecasts | M04–M06,M08–M10; M03 cho entitlement chính xác; M20 ACL |
| `/admin/finance/invoices`, `/payments`, `/receivables`, `/refunds` dưới `/admin/finance` | ledger/receivable views và RPC | M04–M08, M20 |
| `/admin/payroll` và detail | payroll_period_summary, rules, payrolls/lines/adjustments/events, payroll RPC | M15–M17; M19–M20 |
| `/admin/reports/learning` và detail/print | learning_report_list, reports/events, generate/update RPC | M13 + baseline source data, M19–M20 |
| `/admin/reports` | Không có page standalone | Không tạo route giả; route báo cáo thật ở dòng trên |
| `/admin/feedback` và detail | lesson_feedback, aggregates/events, resolve RPC | M14–M15, M19–M20 |
| `/operations` | scoped_students, student_branch_permission, scoped classes/session reads | M19–M21 + M15 để giải quyết teacher scope |
| `/admin/tuition` và reminders | preview/create/update pricing, invoice link, reminder_operations/KPI | M03–M04,M07,M11–M12, M18–M20 |
| Student Academic UI | scheduled starts/edit start date | M01–M02, M18–M20 |

Attendance không lỗi do danh sách trống: thiếu relation `session_actual_teachers` khiến truy vấn không hợp lệ, còn branches/classes baseline tồn tại nên dropdown vẫn tải. Không kết luận đây là lỗi duy nhất của mọi route cloud; các Finance/Payroll/Reports contracts cũng thiếu.

### Minimal Attendance chain

- Về truy vấn list thuần: object mới cần trực tiếp là view trong **M15** trên session/class/teacher baseline đã tồn tại.
- Về migration file đầy đủ và chức năng: **M14 → M15**, trên 28 migration cloud hiện có. M15 thay `submit_lesson_feedback`, dùng `lesson_feedback_low_threshold`, bảng feedback và tạo `learning_journal_teachers`; không nên chạy tách vài câu CREATE VIEW. M13 không phải dependency trực tiếp của M15: không thấy M15 thay learning_report_source.
- Đây là dependency tối thiểu suy từ source, **chưa diễn tập subset và không khuyến nghị áp dụng production subset này**. M20 hardening tham chiếu functions/tables của toàn chuỗi; M21 cần M19 và M15. Dừng ở M15 sẽ để lại security rollout và nhiều online contracts chưa hoàn chỉnh.
- Chọn C: diễn tập đủ M01→M21 trước; không tự repair ledger để bỏ qua migrations finance/payroll.

## 5. Data impact và constraint review

- **M01/M02:** không backfill Academic tự động. Thay hàm và guard; future dates được phép có chủ đích sau hardening cũ. Guard UPDATE sẽ chặn cả notes nếu grade chưa đến ngày hoặc thiếu started_at. Cần kiểm tra các progress hiện hữu và thao tác sửa ngày trên staging. M18 là định nghĩa cuối bổ sung authorization cho M02; M20 chỉ siết ACL/search_path, không đảo logic ngày.
- **M03:** không có vòng UPDATE toàn bộ tuition khi apply. Trigger chỉ chạy khi pause INSERT/status UPDATE hoặc tuition INSERT. Với dữ liệu hiện tại không có pause, không có backfill ngày phát sinh. Nếu trước ngày apply xuất hiện pause cũ, effective_end có thể chưa đồng bộ cho đến lần ghi sau; phải đối chiếu source, không tự gọi hàm recalculate trên production trong audit. Hàm fixed-point deterministic với cùng nguồn, giới hạn 1000 vòng; thay đổi effective_end có thể chạm guard hiện hữu.
- **M04/M05/M08:** tạo bảng/sequence/constraints mới, không tự tạo invoice/payment/refund từ tuition hiện có. FK và unique/check áp dụng lên bảng mới; future writes có thể fail nếu nguồn snapshot thiếu hoặc currency/amount không hợp lệ. M08 đổi view công nợ; không rewrite số tiền gốc. M07 khóa discount khi có invoice, không chạy UPDATE lịch sử khi apply.
- **M06/M09/M10:** views tính live, không materialized/backfill tiền. Số dư/dự báo có thể khác sau thay view hoặc theo ngày VN; reconcile riêng từng tiền tệ, cash không phải lợi nhuận.
- **M11/M12/M13/M14:** không chạy generate hay tạo báo cáo/reminder/feedback khi apply. Trigger M12 hủy pending reminder khi status enrollment/tuition thay đổi. Các snapshot/history mới sẽ bị guard sau phát sinh. Reports dùng progress as-of generation, không tái dựng progress lịch sử.
- **M15:** backfill duy nhất từ session lịch sử: INSERT snapshot mọi COMPLETED. Chỉ đúng một primary hợp lệ theo occurrence_date mới được chọn; 0 hoặc nhiều hơn 1 sẽ đóng băng teacher_id NULL. Deterministic attribution với cùng dữ liệu nguồn, nhưng captured_at lấy now(); không đảm bảo teacher thực tế lịch sử nếu dữ liệu primary sai. Snapshot không cho UPDATE/DELETE; phải owner-review trước khóa. Hiện completed=0 nên backfill dự kiến 0, cần đếm lại lúc apply.
- **M16/M17:** apply không generate/recompute payroll. DELETE/INSERT earning nằm trong RPC generate DRAFT, không phải thao tác migration. Monthly cần một rule phủ trọn kỳ; hourly dựa scheduled duration của COMPLETED actual teacher. Cancelled không tính; không fallback thiếu rate. teacher_branches=0 sẽ chặn tạo compensation rule và explicit assignment theo điều kiện engine; cần setup nghiệp vụ riêng được duyệt. Không tự seed lương.
- **M19:** thêm is_active=true cho mọi user_roles hiện có, valid dates NULL; CHECK mới thỏa với mặc định. Seed role/permission theo code, không cấp user role; collision code giữ metadata cũ. Không chuyển BRANCH_MANAGER thành BRANCH_ADMIN, ACCOUNTANT thành FINANCE. Existing rows có thể được coi active mặc dù owner không muốn; hiện chỉ 1 assignment SUPER_ADMIN.
- **M21:** student_parents cũ mặc định active=true (hiện 0); seed role_permissions mở scope cho assignments role đã có. Audit tất cả historical parent links/role mappings trước apply. Hai ALTER POLICY yêu cầu đúng policy baseline; object drift có thể làm apply fail.
- Không thấy DROP TABLE, DROP COLUMN, RENAME hay đổi kiểu column trong 21 file. Có DROP/CREATE trigger (M01/M03), constraints mới và guard/grant/policy tightening; vì vậy không được gọi toàn bộ chain là reversible/schema-only.

## 6. Security review

- SUPER_ADMIN hiện có profile ACTIVE và role global: tương thích điều kiện M19 tại snapshot này. Cần login và RLS smoke bằng JWT authenticated sau staging migration; kiểm tra bằng postgres/service_role không chứng minh admin hoạt động. Một admin duy nhất là single point of recovery; chưa tạo thêm tài khoản.
- `has_role` cuối chuỗi cần active account + assignment active/valid. `has_permission` cho bypass SUPER_ADMIN toàn hệ thống chỉ khi branch_id NULL; `has_role('SUPER_ADMIN')` legacy không tự giới hạn branch. Audit không giả định branch-scoped SUPER_ADMIN được hỗ trợ an toàn.
- M18 khóa internal tuition RPC và thêm check SUPER_ADMIN cho edit-start RPC. Không mở traffic giữa M02 và M18/M20: bản trung gian M02 thiếu auth trong body; PUBLIC EXECUTE mặc định có thể làm revoke riêng anon không đủ.
- M20 thu hồi TRUNCATE trên các bảng public và direct INSERT/UPDATE/DELETE ledger Finance; giữ public RPC có check quyền, giữ DML Attendance theo baseline. Không được re-grant blanket privileges khi thấy caller cũ fail. Các external scripts/direct-DML integrations chưa được inventory đầy đủ.
- M20 đặt search_path public,pg_temp cho các definers thuộc rollout; M19/M21 định nghĩa helpers với cùng path. Catalog cloud hiện anon/authenticated không có CREATE trên public. Cần xác nhận owner/ACL/search_path sau apply; không dùng search_path như thay thế checks quyền.
- Views Finance/Reports/Feedback/Payroll/session_actual_teachers dùng security_invoker, cần SELECT trên bảng nguồn và RLS thỏa; chỉ GRANT view không đủ. M21 thêm scoped SELECT policy, giữ admin policies; thu hẹp own student và branch metadata. Permissive policies cộng bằng OR, nên phải kiểm tra toàn bộ policy thực tế, không chỉ policy mới.
- Helpers SECURITY DEFINER dùng auth.uid() thay user ID caller truyền vào và kết thúc recursion bằng owner reads; test cross-branch, substitute-only, parent inactive và expired roles trên staging.
- **Residual security review items cần quyết định trước production:** final `submit_lesson_feedback` kiểm tra auth.uid/relationship nhưng không gọi account_is_active và parent link is_active; payroll teacher self-read trong can_read_payroll_period/payroll_read dựa teachers.user_id + APPROVED/FINALIZED, không áp điều kiện account ACTIVE cho nhánh self-read. Vì vậy không tuyên bố account disable đã chặn mọi API. Hiện role assignments chỉ SUPER_ADMIN; vẫn cần kiểm chứng JWT trực tiếp trên staging, đánh giá phạm vi exposure và owner sign-off hoặc hardening riêng. Không sửa business/security code trong audit này.
- Local baseline đã báo PASS 103 app/bootstrap và 33 files/548 pgTAP; authorization tests có legacy admin, inactive/missing profile, trusted search_path, TRUNCATE và branch scope. Không coi baseline đó là chứng nhận production upgrade hoặc coverage mọi residual nêu trên. Không chạy pgTAP lên production.

## 7. Quyết định

**Không phê duyệt migrate trực tiếp hiện tại.** Không thấy blocker dữ liệu rõ cho backfill zero-row hoặc ACTIVE admin, nhưng chưa có restore rehearsal, schema drift đầy đủ, ACL smoke, backup phục hồi được, thời gian khóa và quyết định residual security. Lập kế hoạch Option C ở tài liệu đi kèm. Không apply, không sửa data/roles, không tạo staging, không deploy, không commit/push trong phase này.

## 8. Migration manifest SHA-256

Chụp hash local để phát hiện thay đổi trước rehearsal/apply; không phải checksum so sánh migration lịch sử cloud.

- M01: `0f85704d1c03d372686672d8ce78a29cb7bab6b7cecc7c3dfa9bf1144616e2b3`
- M02: `f79cafb6931a87d06767f48643a0256b11d096730f89ae9eab865badcfe6b4e7`
- M03: `50b7116f1e6d138b2d53e1a597bbf9034858a8f001db2824cf44bc9e58fb30c6`
- M04: `680bea089b9b20c9d2f98119c546063e3e3155beee70ca2426a2a800efddfb20`
- M05: `07a41932124f975971a803a1b878ce5c53b572b325807c8c0220333500bfd1d2`
- M06: `ea63d4913f3c0bb6899def373dd5aea87d76487528e9396b75da61074b623800`
- M07: `6f4013d8e67b9d2389d69f068dd06573b2a64693953c73de1c4e28e55f434858`
- M08: `98083dacdf4bad0add2565028cce115a19052d446c1aaf1ed4193b727c053c1e`
- M09: `5393b4a1c6707f57d19eefe32d701f03c9f6b3096469873b765e904c4e99775a`
- M10: `068330f57e73cc7330c78da22b0903184e7d829de2cbf15eca7bbc975e8f1e98`
- M11: `f2a1a81acd83aeb9b1f967781aa694982d6d07189296cbe13c86116891e38378`
- M12: `fd2405f6282d6dd55d9e5b5be96a942b64f72eedcf7b29c98debd27a690fa88e`
- M13: `7a5386f4847b0111910b86545fd81769212cf7b4433729ee96d0ebc7e824a010`
- M14: `e5db36313b7b302b95357af36e1a4f5933170479422de15691aef40386ee366b`
- M15: `c6322a5d78e91a2d2dfd4ac29a1d46f71db14975724839d11eba8ed03fe0a6a7`
- M16: `a8c2482375f68a33d90ae77980ca366362771e89179e4fe43414e31d1d122ed5`
- M17: `606d85dca27a345315116cad258931f7d503e52a639be178562e91b02175d09e`
- M18: `5491322391f45488793c47531eace43ce795b485cbac555c1ba4f7cd260fbc32`
- M19: `65e104542c928a1ab3cbdf7e81823290874ed1b00e06e0e9ef15a5ce0ff9b15a`
- M20: `fa4b13e1d5999606915a67e5e44b18938c278d3678533f00751cd04224e3cfb7`
- M21: `0cfdbd87f176a44fd7ca43c84a1de8facc51efabde5882db8f24a66802547135`
