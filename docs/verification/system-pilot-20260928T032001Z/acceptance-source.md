# VIBE Academy — Strict System Acceptance & Internal Pilot Gate V1

Ngày: 28/09/2026 — Asia/Ho_Chi_Minh.
Loại: Lệnh thực thi cho Codex tại repo local + ma trận nghiệm thu.
Trạng thái thực tế khi soạn: BLOCKED_ACCESS / SYSTEM_TESTS_NOT_RUN.
Không có kết quả test ứng dụng, database hoặc tích hợp thật nào được tạo từ phiên soạn này.

## 0. Kết luận hiện tại và bằng chứng giới hạn

- Phiên ChatGPT hiện tại không có repo /Users/macbookair/vibe-academy-system, không có checkout Git của app và không có runtime VIBE ở cổng 3000 trên execution host.
- Đây là giới hạn truy cập của phiên ChatGPT; KHÔNG chứng minh máy Mac hoặc localhost:3000 của Owner đang ngừng chạy.
- Chỉ có thể chuẩn bị tiêu chí/dữ liệu/lệnh kiểm thử tại đây. Codex đang có quyền truy cập repo local phải thực thi, sửa lỗi và cung cấp evidence.
- Owner báo Piano Pre Step đã có level và bốn môn; báo cáo đó chưa xác nhận 200 Lesson hoặc khả năng dùng học vụ.
- Không suy ra các lần test PASS cũ vẫn đúng với code/DB hiện tại.

## 1. Lệnh bắt đầu cho Codex

Thực hiện kiểm thử nghiêm ngặt toàn bộ VIBE Academy System để đánh giá khả năng vận hành thử có kiểm soát.

Đây là nhiệm vụ THỰC THI, không chỉ viết checklist:
audit → tạo fixture → chạy kiểm thử → phát hiện lỗi → sửa đúng nguyên nhân → kiểm thử lại → đối soát → báo cáo GO/NO-GO theo phạm vi và môi trường.

- Đọc AGENTS.md và test stack hiện có; xác minh chính xác repo/CWD/runtime/DB phục vụ http://localhost:3000.
- Đọc đầy đủ tài liệu này. Lập inventory tất cả route/action/RPC/table/job/integration thực tế để bổ sung ca thiếu. Ma trận bên dưới là tập tối thiểu, không phải bằng chứng đã phủ mọi dòng code.
- Dùng tài khoản giả lập, dữ liệu synthetic có run_id, không giả mạo số điện thoại của người thật.
- Sửa lỗi local trong phạm vi đã rõ. Với chính sách nghiệp vụ chưa chốt, ghi POLICY_BLOCKED và tiếp tục nhánh độc lập; không tự đặt ngưỡng đạt, công thức lương, quy tắc tiền hoặc điều kiện học vụ.
- Không dừng cả hệ thống chỉ vì một tính năng ngoài pilot scope bị block.
- Khi một bước của luồng lỗi, dừng chuỗi phụ thuộc tại đó, ghi bằng chứng, sửa và chạy lại trước khi bước tiếp; vẫn kiểm tra các luồng độc lập.
- Không yêu cầu Owner duyệt lại kiểm thử/fix local thông thường đã được giao. Chỉ báo các thiếu hụt cần thông tin/quyết định thật sự.
- Giữ cổng 3000. Không tạo một app 3001/3010 rồi dùng nó thay bằng chứng cho bản Owner đang xem.
- Không tự deploy, push, migrate cloud/production hoặc gửi hàng loạt thông báo. “Kiểm thử để vận hành thử” không phải lệnh triển khai production.
- Nếu thiếu quyền/môi trường, hoàn thành phần chuẩn bị và ghi đúng blocker, không viết “đã tạo”, “đã test”, “đã sẵn sàng” khi chưa làm được.

## 2. Mục tiêu và phạm vi pilot

Tách rõ bốn kết luận:

| Gate | Ý nghĩa | Không được suy ra |
|---|---|---|
| TECHNICAL_TEST_PASS_LOCAL | Luồng kỹ thuật đã kiểm chứng trên local, dữ liệu giả | Cloud/staging/production cũng PASS |
| READY_FOR_INTERNAL_REHEARSAL | Có thể diễn tập nội bộ với tài khoản/dữ liệu thử trong scope đã kiểm chứng | Được dùng dữ liệu/giao dịch thật |
| READY_FOR_PILOT_ON_TARGET_ENV | Target environment, schema, RLS/RPC, recovery và UAT đáp ứng gate; scope/người dùng được ghi rõ | Được rollout toàn học viện |
| OWNER_PILOT_GO | Owner quyết định bắt đầu trên scope/environment cụ thể sau evidence | Mọi module đều sẵn sàng hoặc đã cho phép production migration |

Hướng vận hành thử:
- Nhóm nội bộ 2–5 người trước, rồi một chi nhánh, sau đó mới mở rộng.
- Finance/Tuition ở shadow/test; Payroll kiểm chứng bằng dữ liệu giả, chưa chi trả thật.
- Zalo/report/feedback live chỉ test tới recipient thử đã chỉ định, có consent/allowlist/template phù hợp; không mở automation cho toàn bộ phụ huynh.
- E-learning/Final Test/academic writeback chưa có D01–D14 được duyệt: ngoài phạm vi kích hoạt. Vẫn test authorization và trạng thái bị chặn để không vô tình bật.
- Curriculum chỉ là khung biên soạn chưa được coi là đủ điều kiện giảng dạy. Chọn curriculum đã sẵn sàng để pilot; Pre Step còn thiếu nội dung/tiêu chí phải nêu rõ loại trừ.
- Module bị loại khỏi pilot phải được cô lập theo cơ chế thật và không phá module trong scope. Chỉ ẩn menu không đủ để chứng minh đã cô lập backend.

Tài liệu SOP 15/09/2026 đang mang trạng thái Owner review. Dùng để đối chiếu lộ trình, đối soát và stop conditions; không tự coi các đề xuất về nhân sự, SLA, ngày pilot là Owner đã ký.

## 3. Baseline và nguyên tắc bằng chứng

Trước khi thay đổi:
1. Ghi commit, branch, hash của diff tracked/untracked liên quan, migration head DB, app build/runtime và UTC+7 timestamp.
2. Ghi user/role/scope fixture, các entity IDs, số dòng/tổng tiền/kho/tình trạng học thuật expected. Expected phải tính độc lập từ rule/fixture được chấp nhận.
3. Ghi lỗi nền hiện có, test nào đang FAIL và bằng chứng. Không gắn nhãn “lỗi cũ” rồi bỏ qua lỗi critical.
4. Chụp baseline và bản sao lưu phục hồi phù hợp; không lưu credentials trong báo cáo.
5. Tạo run manifest và evidence directory trong repo. Số liệu test phải xuất từ runner hoặc actual checks, không nhập tay để đủ mục tiêu.

Mỗi ca gồm:
- Case ID, requirement/risk, role, branch/relationship, prerequisites.
- Steps/reproduction, expected, actual, timestamp.
- Route/action/RPC, entity IDs, request/correlation ID; SQL/ledger evidence phù hợp.
- Screenshot/video nếu cần UI; PDF/export thật nếu cần nội dung.
- PASS / FAIL / BLOCKED / NOT_RUN / NOT_APPLICABLE, kèm lý do.
- NOT_APPLICABLE phải được giải thích bằng inventory/scope, không dùng để bỏ qua tính năng đang mở.
- MOCK_PASS chỉ mô tả mô phỏng; không thay live integration.
- Mọi test sau bugfix phải gắn fingerprint bản sửa; kết quả từ revision cũ không được gộp thành PASS của revision mới.

Không dùng một trong các dấu hiệu sau làm bằng chứng đủ: HTTP 200, build thành công, ảnh dashboard, button bấm được, API Zalo error=0, hoặc tổng số test cao.

## 4. Chạy theo thứ tự để tránh sai và quá tải

### Pha A — Inventory, baseline và quyền
- Inventory toàn bộ menu/router/action/API/RPC/job/integration, kể cả route ẩn nhưng còn truy cập.
- Xác định expected permissions theo 4 lớp: Role, Branch, Relationship, Action.
- Chạy security gates sớm. Nếu có rò dữ liệu/ghi sai tiền, cô lập nhánh gây tác động trước khi test tiếp.
- Ưu tiên test stack của repo. Không cài thêm framework chỉ để làm báo cáo “toàn diện”.

### Pha B — Database và service
- Referential integrity, uniqueness, transaction, domain constraints, RLS/RPC.
- Fresh migration/restore drill ở DB dùng riêng; incremental state của MAIN được đối chiếu read-only trước khi áp thay đổi local đã chuẩn bị.
- DB dùng riêng chỉ phục vụ test/restore; không chuyển app 3000 sang đó rồi báo đã cập nhật MAIN.
- Mock external providers; chạy idempotency/concurrency/failed-transaction cases có kiểm soát.

### Pha C — Browser end-to-end theo vai trò
- UI → request/action → database → response → reload.
- Một học sinh chính chạy toàn bộ từ CRM/registration đến Academic, ca dạy, điểm danh, nhật ký, báo cáo, feedback, tuition và notification.
- Có ít nhất: Parent nhiều con; Teacher không được phân công; Branch Admin khác chi nhánh; Finance và Teacher account riêng.
- Kiểm tra desktop/mobile, direct URLs, exports/PDFs và lỗi thật ở server.

### Pha D — Integrations và hồi quy liên module
- Registration/academic/report/feedback/finance/payroll/inventory không tạo side effect sai module khác.
- payOS sandbox/mock trước; không tạo giao dịch ngân hàng hoặc refund thật.
- Zalo mock trước; live chỉ khi đủ điều kiện test hiện có, không tự tăng hạn mức hoặc dùng khách thật.
- Chạy lại các bộ regression hiện có bắt buộc; một lần tổng hợp ở candidate cuối là hợp lý vì người dùng yêu cầu full-system acceptance.

### Pha E — Performance, recovery và rehearsal
- Đo trên môi trường xác định, với dataset đại diện; không build, tsc, test DB, load test cùng lúc làm sai phép đo.
- Nếu cần đo production-like trên local, dùng cùng cổng 3000 theo quy trình restart có kiểm soát đúng process; không killall. Ghi mode đo và phục hồi runtime đã thống nhất sau test.
- Restore drill vào môi trường riêng; thử disable module/worker và phục hồi mà không làm mất nghiệp vụ.
- Diễn tập nhiều vai trò, cuối phiên đối soát và lập danh sách lỗi/giới hạn.

## 5. Dữ liệu kiểm thử tối thiểu

- Dữ liệu synthetic cho 3 branches để kiểm tra isolation; ít nhất hai branch phải có records khác nhau.
- Tài khoản kỹ thuật theo 7 roles; nhóm người pilot thật vẫn 2–5 người, không nhầm số test accounts với số người rollout.
- Student chính + sibling chung Parent + student khác branch + student không consent + student future-start + student paused + student ended.
- Private/group, teacher substitute, phòng có giới hạn, lịch lặp, học bù, buổi liền kề và trùng giờ.
- Gói 3 và 12 tháng; invoice chưa thu/thu một phần/đã đủ; mock payment duplicate/sai amount; chi phí cố định và ITEMIZED_V2.
- Payslip theo giờ/tháng và disbursement fixture; kho 2 nơi, một serial duy nhất, số tồn biên 0/1.
- Report MONTHLY/END_OF_COURSE, draft/review/published versions, câu hỏi, public reply/internal note, feedback thấp và reopen.
- Không điền ngẫu nhiên SĐT hợp lệ; phone/UID null cho fixtures không gửi thật.
- Không tự tạo học phí/điểm/tiền lương theo con số đoán. Ghi rõ policy fixture cho phần technical-only, không biến nó thành policy vận hành.
- Build fixture theo run_id và stable refs; rerun không nhân bản; preserve dữ liệu người khác đang làm.

## 6. Ma trận kiểm thử tối thiểu (105 ca)

### Môi trường và bản phần mềm

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| ENV-01 | P0 | Đúng runtime | Xác minh repo/CWD/branch/commit, dirty diff fingerprint, PID/mode của 3000 và DB đang phục vụ; UI/API/SQL phải cùng môi trường. | NOT_RUN |
| ENV-02 | P0 | Không nhầm cloud | Xác minh read/write targets và secret source mà không in secrets; fixture không đi vào production hoặc provider thật ngoài phạm vi cho phép. | NOT_RUN |
| ENV-03 | P1 | Khả năng tái lập | Ghi Node/package manager/lockfile, migration head thực tế, scripts; cài và chạy theo repo, không tự nâng dependency trong đợt nghiệm thu. | NOT_RUN |
| ENV-04 | P0 | Migration và recovery | Kiểm thử migration/restore trên DB local dùng riêng được nhận diện rõ; không reset hay khôi phục đè MAIN. So sánh schema/dữ liệu sau phục hồi. | NOT_RUN |
| ENV-05 | P1 | Không che lỗi | Chạy required lint/typecheck/build/unit/integration/DB gates từ repo; không skip, xfail hoặc đổi expectation để che bug; ghi cả lỗi cũ còn tồn tại. | NOT_RUN |
| ENV-06 | P1 | Một runtime thống nhất | Kết thúc kiểm thử giao diện tại 3000 với đúng bản đã sửa; không lấy PASS từ cổng khác hoặc bản build cũ. | NOT_RUN |

### Bảo mật và phân quyền

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| SEC-01 | P0 | Ma trận quyền | Với 7 vai trò, kiểm tra view/create/update/approve/export/download/delete theo permission thực; cho phép và từ chối đều có bằng chứng UI/API/DB. | NOT_RUN |
| SEC-02 | P0 | Branch scope | Branch Admin A không đọc/ghi/export/report aggregate dữ liệu branch B; đổi query/body/UUID không vượt scope. | NOT_RUN |
| SEC-03 | P0 | Teacher relationship | Teacher chỉ thao tác lớp/ca/học sinh đúng quan hệ; cùng chi nhánh nhưng không được phân công vẫn bị chặn; actual/substitute teacher đúng ngày nghiệp vụ. | NOT_RUN |
| SEC-04 | P0 | Parent/Student relationship | Parent thấy đúng con; Student chỉ thấy mình; đổi child/report/feedback IDs và direct storage URL không đọc được người khác. | NOT_RUN |
| SEC-05 | P0 | Thu hồi quyền | Disable user, đổi role/scope, gỡ Parent↔Child hoặc teacher assignment: backend áp quyền hiện tại, không chỉ ẩn menu; session cũ không giữ đặc quyền trái policy. | NOT_RUN |
| SEC-06 | P0 | Anonymous và RPC | Audit grants, RLS, SECURITY DEFINER/search_path/function execute và views; chạy lại authorization_foundation/security_catalogue nếu có, sửa root cause thay vì chỉ test fixture. | NOT_RUN |
| SEC-07 | P0 | Giả dữ liệu actor | Không tin created_by/branch_id/teacher_id/approver_id từ client; server lấy actor đúng session và validate relation. | NOT_RUN |
| SEC-08 | P0 | Tài liệu và cache | PDF, export, signed URL, cache keys và response serialization không rò thông tin giữa tài khoản; chưa phát hành không tải được. | NOT_RUN |
| SEC-09 | P0 | Input và secrets | XSS/injection, unsafe redirect, CSRF theo framework thật; credentials/service-role/token không có trong client bundle, URL, logs hoặc evidence. | NOT_RUN |
| SEC-10 | P1 | Auth thực tế | Đăng nhập/đăng xuất/reset/hết phiên theo cơ chế hiện có; tài khoản riêng cho từng actor, lỗi không lộ thông tin quá mức. | NOT_RUN |

### Menu, giao diện và khả dụng

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| NAV-01 | P1 | Menu mới | Đối chiếu yêu cầu mới: Vận hành chứa Đào tạo và Tài chính; Đào tạo một thanh menu con; HR một mục chính theo mẫu CRM; Hệ thống cuối menu tích hợp các mục đã yêu cầu. | NOT_RUN |
| NAV-02 | P1 | Route thật | Kiểm tra mọi route đang được phép trong menu, direct link, refresh/deep link, back/forward và permission; không chỉ thử trang dashboard. | NOT_RUN |
| NAV-03 | P1 | E-learning ngoài scope | Menu E-learning đã gỡ theo yêu cầu; kiểm tra quyền truy cập URL/backend riêng. Ẩn menu không đồng nghĩa authorization hoặc xóa dữ liệu. | NOT_RUN |
| NAV-04 | P1 | Form lifecycle | Create/edit/save/reload, validation, empty/error/loading states; double click, bỏ trang khi đang sửa và lỗi server không mất/ghi đôi dữ liệu. | NOT_RUN |
| NAV-05 | P1 | Desktop/mobile | Desktop và màn hình hẹp khoảng 390px: core action dùng được, bảng/modal không che nút, bàn phím/focus/nhãn form đủ dùng. | NOT_RUN |
| NAV-06 | P1 | Dashboard và bộ lọc | KPI theo ngày Việt Nam/branch khớp DB và ledger; filter/search/pagination giữ đúng scope; không lấy tổng trang làm tổng toàn bộ. | NOT_RUN |
| NAV-07 | P2 | Ngôn ngữ thiết kế | Kiểm tra navy/gold/warm shell và component thống nhất cho phần thay đổi; lỗi thẩm mỹ không được ưu tiên hơn lỗi dữ liệu/quyền. | NOT_RUN |

### CRM và đăng ký

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| CRM-01 | P1 | Lead lifecycle | Tạo/cập nhật lead, người phụ trách, tag/trạng thái và lịch sử follow-up; chuyển đổi không làm mất nguồn hoặc tạo lead trùng trái rule. | NOT_RUN |
| CRM-02 | P1 | Registration end-to-end | Từ form đăng ký đến application, hồ sơ học sinh và academic assignment theo workflow; lỗi ở một bước có rollback hoặc trạng thái phục hồi rõ. | NOT_RUN |
| CRM-03 | P1 | Kiểm tra trùng | Kiểm tra cùng tên, cùng SĐT gia đình, đăng ký lặp, hai học sinh dùng chung phụ huynh; không tự merge người khác nhau. | NOT_RUN |
| CRM-04 | P1 | Retry và concurrency | Hai lần submit cùng registration không tạo hai enrollment/invoice/event; lần hợp lệ độc lập vẫn được nhận. | NOT_RUN |
| CRM-05 | P0 | Registration notification | Consent/recipient/template/allowlist được kiểm tra; đăng ký mới không tự gửi tin đến khách thật trong fixture; retry không nhân bản. | NOT_RUN |
| CRM-06 | P1 | Queue và tìm kiếm | Lead/registration/student sau chuyển đổi xuất hiện đúng tab và branch; lỗi từng record không bị lấp bằng nhãn thành công chung. | NOT_RUN |

### Hồ sơ học sinh

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| STU-01 | P1 | Identity đầy đủ | Tạo/update học sinh, Parent, role, branch và relationship đúng; reload và search ra cùng ID, không orphan. | NOT_RUN |
| STU-02 | P0 | Trang placement giới hạn | Nhân sự chỉ có student_placement.view không vào được chi tiết tài chính/payroll/HR hoặc tự tăng quyền qua API. | NOT_RUN |
| STU-03 | P1 | Program và ngày bắt đầu | Gán chương trình, bắt đầu/nâng grade với ngày tương lai; trạng thái UI Đã lên lịch và backend chặn tiến độ trước ngày bắt đầu đúng rule. | NOT_RUN |
| STU-04 | P1 | Bảo lưu và kết thúc | Khoảng bảo lưu inclusive, gia hạn, kết thúc/chuyển trạng thái ảnh hưởng lịch/tuition/journal theo rule; giữ lịch sử cũ. | NOT_RUN |
| STU-05 | P1 | Dữ liệu mở đầu | Nếu có import/baseline: dry-run, validate, duplicate detection và đối soát nguồn→DB; lỗi giữa chừng không import nửa phần mà báo hoàn tất. | NOT_RUN |

### Ca dạy, lịch, phòng, điểm danh

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| OPS-01 | P1 | Định nghĩa ca dạy | Làm rõ class/ca dạy lặp và session/buổi cụ thể trong code; đổi nhãn không làm gộp hoặc nhân đôi các đối tượng/khóa dữ liệu. | NOT_RUN |
| OPS-02 | P1 | Xếp lịch hợp lệ | Private/group, capacity, room, teacher, student enrollment, branch, effective dates; lịch hiển thị đúng từng ngày Asia/Ho_Chi_Minh. | NOT_RUN |
| OPS-03 | P1 | Xung đột lịch | Chặn trùng giáo viên/phòng/học sinh, kể cả khác lớp và hai request đồng thời; buổi liền kề không chặn sai; kiểm tra buffer nếu policy có. | NOT_RUN |
| OPS-04 | P1 | Dạy thay và bàn giao | PRIMARY theo ngày và session-specific override đúng precedence; handoff kết thúc/bắt đầu đúng ngày; ghi rõ hạn chế tái phân công cùng teacher sau gap nếu còn. | NOT_RUN |
| OPS-05 | P1 | Lifecycle | Reschedule/cancel/complete/lock/reopen theo quyền; lịch lặp sửa một buổi so với cả chuỗi; lịch sử attendance/journal/payroll không đổi nhầm. | NOT_RUN |
| OPS-06 | P1 | Điểm danh | PRESENT/LATE/ABSENT/EXCUSED theo policy; đổi trạng thái có audit; không điểm danh học sinh ngoài enrollment hiệu lực. | NOT_RUN |
| OPS-07 | P1 | Học bù | Tạo/đặt/hoàn tất/hủy buổi bù không tính hai lần buổi học/học phí/giờ dạy; gắn được buổi gốc. | NOT_RUN |
| OPS-08 | P1 | Thiếu dữ liệu | Unassigned teacher null khác với thiếu view row; thiếu assignment không crash hoặc lấy nhầm teacher mặc định. | NOT_RUN |

### Curriculum và tiến độ

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| ACA-01 | P1 | Tree | Curriculum→Level→Subject→Component→Lesson đúng parent, sort và identity; rerun không trùng; không làm phẳng Component. | NOT_RUN |
| ACA-02 | P1 | Khung 4 nhạc cụ | Đối soát mục tiêu 4 chương trình/37 level/184 subject/2.640 Lesson khung với số thật; báo missing/conflict thay vì xóa dữ liệu để ép số. | NOT_RUN |
| ACA-03 | P1 | Pre Step | Theo báo cáo Owner, mới có Piano Pre Step + 4 môn; kiểm tra lại số Component/Lesson thật. Mapping 1 nhóm/môn ở trao đổi trước là đề xuất, chưa tự gọi là duyệt. | NOT_RUN |
| ACA-04 | P1 | Academic evidence | Component→Subject→Grade theo required rules có thật; placeholder 10/50 Lesson không tự là session hoặc bằng chứng PASS. | NOT_RUN |
| ACA-05 | P1 | Correction | Sửa đánh giá/miễn môn theo quyền và audit, không cập nhật grade ngoài phạm vi; kiểm tra report lịch sử giữ snapshot. | NOT_RUN |
| ACA-06 | P0 | E-learning writeback | D01–D14 chưa có bản duyệt được xác minh: không kích hoạt Final Test chính thức hay auto subject completion; test shadow/blocked gate riêng, không chặn module độc lập. | NOT_RUN |

### Nhật ký học tập

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| JNL-01 | P1 | Nộp đúng lúc | DRAFT→SUBMITTED chỉ khi session COMPLETED; PRESENT/LATE cần observation + progress_note; ABSENT/EXCUSED theo rule tùy chọn. | NOT_RUN |
| JNL-02 | P0 | Actor chính xác | Actual teacher/SUPER_ADMIN tạo hoặc sửa; Branch Admin không sửa journal, chỉ đọc/resolve attention theo quyền. | NOT_RUN |
| JNL-03 | P1 | Revision | submitted_at/by giữ nguyên từ lần nộp đầu; revised_at/by và revision_count đúng, không quay lại DRAFT. | NOT_RUN |
| JNL-04 | P0 | Attention nội bộ | Giáo viên flag, admin resolve đúng scope; resolution không sửa revision/status; trường nội bộ không lọt vào portal/PDF/Zalo. | NOT_RUN |
| JNL-05 | P1 | Missing journal queue | COMPLETED chưa có journal xuất hiện đúng; CANCELLED, paused/not-started/ended được loại theo rule. | NOT_RUN |
| JNL-06 | P1 | Nguồn báo cáo | Nhật ký đã nộp đóng góp đúng kỳ/học sinh; revision sau phát hành không âm thầm viết lại report snapshot. | NOT_RUN |

### Báo cáo và phản hồi

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| REP-01 | P1 | Báo cáo hai loại | MONTHLY và END_OF_COURSE đúng kỳ/enrollment, academic, attendance và teacher evaluation; cuối khóa không đồng nghĩa đạt grade. | NOT_RUN |
| REP-02 | P0 | Duyệt/phát hành | Creator/reviewer, trạng thái thực, scope và snapshot đúng; Student/Parent không xem draft/review; không gửi hai event cho approved và published cùng một lần. | NOT_RUN |
| REP-03 | P1 | PDF | Đúng dữ liệu/version, font Việt, layout, MIME; tải trên desktop/mobile có bằng chứng; không gọi HTTP 200 là đủ PASS nội dung. | NOT_RUN |
| REP-04 | P1 | Hỏi/đáp báo cáo | Parent hỏi đúng report/version; public reply/internal note/resolve có actor và audit; thread không thay report approval status. | NOT_RUN |
| REP-05 | P1 | Feedback buổi học | Đủ điều kiện mới gửi rating/comment; rating thấp vào queue xử lý theo policy; reply/assign/resolve/reopen giữ lịch sử. | NOT_RUN |
| REP-06 | P0 | Nội dung và recipient | Không gửi internal note hoặc nhầm câu trả lời của học sinh khác; Parent nhiều con chọn đúng context; recipient được kiểm tra lại khi gửi. | NOT_RUN |
| REP-07 | P1 | Bộ 59 ca trước | Đối chiếu VIBE_Student_Academic_Zalo_E2E_Codex.md; chạy các ca chưa được phủ, gắn ID tương đương để không đếm hai lần một bằng chứng. | NOT_RUN |

### Học phí, tài chính và payOS

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| FIN-01 | P0 | Học phí | Gói 3/12 tháng, ngày bắt đầu, hết hạn, bảo lưu, bù và đổi gói theo policy có thật; expected độc lập, không lấy UI output làm expected. | NOT_RUN |
| FIN-02 | P0 | Ledger | Opening balance, invoice, receipt, allocation, credit/debt, void/refund nếu có khớp từng dòng/branch/period; không trộn VND với currency khác. | NOT_RUN |
| FIN-03 | P0 | Thu nhiều lần | Partial/full/overpayment và phân bổ nhiều khoản đúng quy tắc; hai request cùng khóa không ghi trùng thu/giảm nợ. | NOT_RUN |
| FIN-04 | P0 | Lỗi giữa transaction | Lỗi sau tạo payment trước allocation không làm tiền hoặc nợ sai; phục hồi có audit, không chỉnh số tổng trực tiếp. | NOT_RUN |
| FIN-05 | P0 | payOS trust boundary | Chữ ký/payload/amount/orderCode/merchant mapping đúng SDK/docs đang dùng; return URL thành công không tự đánh dấu đã thanh toán. | NOT_RUN |
| FIN-06 | P0 | Webhook | Callback duplicate, đến sai thứ tự, giả chữ ký, timeout, sai số tiền, payment canceled/expired được xử lý đúng; không tạo receipt đôi. | NOT_RUN |
| FIN-07 | P1 | Chi phí | Công tác phí ITEMIZED_V2, legacy read-only và chi phí cố định theo branch có kỳ/ngày/số tiền/audit đúng; cấp quyền riêng. | NOT_RUN |
| FIN-08 | P0 | Nhắc học phí và đối soát | Rule gói 3 tháng/12 tháng theo policy đã chốt; reminder preview đúng thời điểm và số nợ; không gửi thật hàng loạt; tổng dashboard khớp ledger. | NOT_RUN |

### Nhân sự, lương và chi trả

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| HR-01 | P0 | Dữ liệu nhân sự | Role/capacity/branch và thông tin nhạy cảm được bảo vệ; bỏ menu Giáo viên không làm mất teacher relationship. | NOT_RUN |
| HR-02 | P1 | Nghỉ/phân công | Đơn nghỉ/ca thay/đối soát đúng ngày và quyền; actual teacher gắn buổi dạy chính xác. | NOT_RUN |
| HR-03 | P0 | Giờ và công thức | Monthly/hourly pay, duration, late/cancel/makeup/substitute theo hợp đồng/policy có thật; join không nhân đôi giờ hoặc dùng teacher hiện tại cho lịch sử. | NOT_RUN |
| HR-04 | P0 | Payslip | Tổng earnings/deductions/expenses và thực nhận khớp expected; locked/approved payslip không đổi âm thầm do sửa ca cũ. | NOT_RUN |
| HR-05 | P0 | Disbursement ledger | Chi một phần/đủ, nhiều lần, duplicate/concurrent request không trả vượt hoặc trả trùng; reversal nếu có theo workflow, không xóa audit. | NOT_RUN |
| HR-06 | P0 | Quyền xem/duyệt | Teacher/employee chỉ thấy phiếu của mình; branch staff không thấy payroll nếu thiếu quyền; approve/pay theo separation rules hiện có. | NOT_RUN |
| HR-07 | P1 | Document/delivery | PDF payslip đúng kỳ/người/version; delivery count khớp recipient và trạng thái; chưa gửi phiếu lương thật trong thử nghiệm. | NOT_RUN |

### Kho và cửa hàng

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| INV-01 | P0 | Nhập/xuất/tồn | Nhập, xuất, chuyển kho hai vế, điều chỉnh lý do khớp opening + movements = closing; không tồn âm trái rule. | NOT_RUN |
| INV-02 | P0 | Concurrency | Hai yêu cầu xuất cuối kho hoặc bán cùng serial chỉ một được nhận; retry không tạo chứng từ đôi. | NOT_RUN |
| INV-03 | P1 | Serial và giá vốn | Model/serial/location/status/history đúng; giá vốn chỉ vai trò được phép; không vòng qua serial guard bằng thao tác kho thường. | NOT_RUN |
| INV-04 | P0 | Chứng từ tài chính | Xuất kho không tự thành doanh thu/thu tiền nếu chưa có nghiệp vụ đó; khi có tích hợp phải đối soát chính xác. | NOT_RUN |
| INV-05 | P1 | Menu và lịch sử | Chuyển menu xuống Hệ thống không mất danh mục/giao dịch/quyền; thống kê tháng và deep links vẫn đúng. | NOT_RUN |

### Zalo và tích hợp

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| INT-01 | P0 | Tắt gửi ngoài phạm vi | Mock/dry-run mặc định cho fixture; chỉ recipient test đã chỉ định, consent và allowlist phù hợp được dùng khi gửi thật; không reset counter/quota. | NOT_RUN |
| INT-02 | P1 | Template registry | ID/purpose/channel/status/params/CTA lấy từ OA/App thật; template đăng ký không tự đại diện cho báo cáo, feedback hay payslip. | NOT_RUN |
| INT-03 | P0 | Outbox | Event bền vững và transaction đúng; rollback không gửi; worker claim/lock/dedupe theo entity/version/recipient/purpose. | NOT_RUN |
| INT-04 | P1 | Retry | 429/5xx retry có backoff và giới hạn; timeout sau send là UNKNOWN cần đối soát; không resend vì thiếu receipt. | NOT_RUN |
| INT-05 | P0 | Token MAIN | Giữ kho token mã hóa; kiểm tra refresh rotation, lock, restart persistence bằng fixture/mocks trước; không force refresh live lặp lại hoặc revoke OA chỉ để test. | NOT_RUN |
| INT-06 | P1 | Scheduler thật | Xác minh lịch chạy, heartbeat, last success, queue lag; scheduler Mac chỉ chứng minh local. Bản online cần bằng chứng scheduler tại môi trường online. | NOT_RUN |
| INT-07 | P0 | Receipt và download | Webhook xác thực/replay-safe; ACCEPTED khác DELIVERED/READ; CTA HTTPS kiểm tra quyền rồi trả đúng PDF, không nhúng localhost hoặc public storage dài hạn. | NOT_RUN |
| INT-08 | P1 | Failure isolation | Provider lỗi không làm mất registration/report/reply đã commit; UI hiển thị lỗi có thể xử lý; notification event không tự gây vòng lặp. | NOT_RUN |

### Backup, phục hồi, vận hành và audit

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| REC-01 | P0 | Restore drill | Backup DB cùng dependency thiết yếu, auth/storage/config references theo kiến trúc; restore vào môi trường test riêng, xác minh sample records và quyền, không chỉ kiểm tra file backup tồn tại. | NOT_RUN |
| REC-02 | P0 | Không mất dữ liệu | Crash giữa nghiệp vụ, worker restart, DB tạm lỗi, submit timeout được thử có kiểm soát; không tạo partial transaction hoặc thao tác không audit. | NOT_RUN |
| REC-03 | P1 | Audit trail | Create/update/approve/resolve/void/correction có actor/time/reason/before-after phù hợp, log không chứa secrets; người không quyền không sửa audit. | NOT_RUN |
| REC-04 | P1 | Quan sát lỗi | Lỗi frontend/API/DB/job có correlation ID và đủ thông tin truy vết; logs nhìn được ở môi trường thực, không dùng console xanh để bỏ qua queue lỗi. | NOT_RUN |
| REC-05 | P1 | Disable/rollback | Thử tắt riêng module/integration và phục hồi bản cấu hình/code theo runbook; không xóa queue gửi chưa rõ kết quả, không rollback DB làm mất giao dịch mới. | NOT_RUN |
| REC-06 | P1 | Cleanup fixture | Manifest ID/parent/run_id đầy đủ; cleanup chỉ dữ liệu thử và không xóa audit hoặc dữ liệu người dùng đã chỉnh sau đó. | NOT_RUN |

### Hiệu năng và tính ổn định

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| PERF-01 | P1 | Dữ liệu có quy mô | Dataset synthetic đại diện 3 branches/ít nhất 500 học sinh và lịch/ledger/report có lịch sử; ghi số thật, không đánh giá từ DB rỗng. | NOT_RUN |
| PERF-02 | P1 | Baseline | Đo cold riêng, warm riêng, p50/p95/max/error rate, query count và payload cho các route lõi; ghi hardware/runtime/dataset để so sánh. | NOT_RUN |
| PERF-03 | P1 | Tải thực tế | Chạy 2→5 user workflows đồng thời, sau đó 10-user smoke nếu máy đủ; không coi 500 học sinh là 500 người truy cập đồng thời. | NOT_RUN |
| PERF-04 | P1 | Truy vấn | Tìm N+1, full-table scan, fetch không pagination, join làm nhân dòng, cache sai scope; tối ưu dựa vào evidence, giữ correctness. | NOT_RUN |
| PERF-05 | P1 | Stability | Tối thiểu một phiên rehearsal liên tục 60 phút với nhiều vòng nghiệp vụ; checkpoint mỗi 10–15 phút; không kết luận đã ổn định nhiều ngày từ vòng này. | NOT_RUN |
| PERF-06 | P1 | Không tranh CPU | Build/tsc/tests/load chạy có thứ tự, không cùng nhiều tiến trình nặng; kiểm tra giới hạn máy trước khi quy mọi chậm trễ cho Next dev. | NOT_RUN |

### Người dùng thử và kết luận

| ID | Ưu tiên | Kiểm thử | Kết quả bắt buộc | Trạng thái ban đầu |
|---|---|---|---|---|
| UAT-01 | P1 | Thực hành theo vai trò | Nhóm 2–5 người có tài khoản riêng; đủ đại diện Owner/Branch/Academic/Finance và Teacher khi dùng; mỗi người hoàn tất tác vụ chính mà không mượn SUPER_ADMIN. | NOT_RUN |
| UAT-02 | P1 | Đối soát cuối ngày | Student/enrollment/session/attendance/tuition/finance/payroll-shadow/inventory/notifications đối soát độc lập, chênh lệch không giải thích được là blocker. | NOT_RUN |
| UAT-03 | P1 | Scope ký nhận | Liệt kê module được dùng, giới hạn, người phụ trách, thời gian support, nguồn dữ liệu và stop conditions; phần thiếu policy không được tự gán đã duyệt. | NOT_RUN |
| UAT-04 | P0 | Gate đúng môi trường | NO-GO nếu critical test trong scope chưa chạy/fail, còn lỗi security/money/data integrity hoặc chưa có recovery evidence. Local PASS không được dùng làm online/cloud PASS. | NOT_RUN |


## 7. Mười hành trình phải có bằng chứng xuyên suốt

1. CRM → đăng ký → student/parent → chương trình → enrollment → ca dạy; kiểm tra retry không nhân đôi.
2. Xếp ca → xung đột → đổi phòng/teacher → dạy thay → complete/attendance → đối soát giờ dạy.
3. Bảo lưu/học bù → lịch/attendance/journal/tuition đúng, không tăng/giảm buổi hai lần.
4. Academic partial progress → đánh giá hợp lệ → completion đúng policy; fixture chưa đủ required không được PASS.
5. Journal submit → revision → attention resolution; parent không thấy nội bộ.
6. Báo cáo tháng/cuối khóa → duyệt/phát hành → PDF → Parent hỏi → public reply/resolve → thông báo đúng version.
7. Feedback invitation → Parent đánh giá thấp → phân công → trả lời → resolve/reopen → notification đúng người.
8. Invoice → mock payOS/receipt → allocation → outstanding → duplicate/late webhook → đối soát không sai tiền.
9. Completed teaching sessions → payroll calculation → payslip → mock disbursement ledger; không chi trả thật.
10. Inventory receipt → transfer → issue/sale serial → concurrent duplicate → stock/history/cost permissions; phục hồi và đối soát.

Với mỗi hành trình, báo rõ ranh giới cuối cùng đã thật sự kiểm chứng và bước còn BLOCKED. Không đánh dấu toàn hành trình PASS khi bước downstream mới chỉ mock.

## 8. Tiêu chí hiệu năng đề xuất cho diễn tập nội bộ

Đây là mục tiêu kỹ thuật cho đợt test, không phải SLA sản phẩm đã được Owner duyệt:
- Các trang lõi warm: p95 ≤ 2 giây tại 5 người hoạt động đồng thời.
- Save/action nội bộ warm: p95 ≤ 3 giây, không gồm thời gian chờ bên cung cấp dịch vụ ngoài.
- Không có lỗi server bất ngờ, mất save hoặc request pending vô hạn trong cửa sổ đo.
- PDF/report generation/background work ghi latency và timeout riêng theo baseline, không đánh đồng với thao tác form.
- Tối thiểu 30 phép đo hợp lệ cho mỗi nhóm tác vụ quan trọng; ghi số mẫu, cold/warm, cache state, error rate. Không khẳng định p95 đại diện rộng nếu số mẫu nhỏ.
- 10-user smoke là headroom check tùy năng lực máy, không phải mô phỏng 500 concurrent users.
- 60 phút rehearsal là một kiểm tra ổn định ngắn. Pilot 7–10 ngày vận hành cần người thật thực hiện, không được giả lập thành “đã hoàn tất” trong một lần chạy.

Nếu không đạt, tìm evidence query/runtime trước khi tối ưu. Nếu chậm do dev compilation hoặc build/test cạnh tranh tài nguyên, báo rõ và đo lại đúng điều kiện; không đổi ngưỡng âm thầm.

## 9. Severity và cổng GO / NO-GO

| Mức lỗi | Ví dụ | Cách xử lý |
|---|---|---|
| P0 — Critical | Rò dữ liệu, vượt quyền, sai/ghi đôi tiền, mất dữ liệu, chi trả sai người | Chặn pilot có phạm vi bị ảnh hưởng; sửa root cause và retest bắt buộc. Không chấp nhận workaround làm yếu security/integrity |
| P1 — High | Core workflow bị chặn, trùng ca, academic sai, báo cáo sai, scheduler không chạy khi cần | NO-GO cho scope sử dụng tính năng đó; chỉ loại khỏi scope nếu có cô lập thật và được Owner chấp nhận |
| P2 — Medium | Lỗi phụ có cách xử lý an toàn, UI làm chậm công việc | Có owner, hạn xử lý, workaround; đánh giá ảnh hưởng thật trước GO WITH CONDITIONS |
| P3 — Low | Lỗi trình bày nhỏ không làm sai dữ liệu/quyền | Ghi backlog; không để sửa cosmetic trì hoãn fix critical |

GO cho scope/môi trường xác định khi:
- Không còn P0/P1 mở trong scope.
- 100% ca critical và hành trình core trong scope được thực thi và PASS; BLOCKED/NOT_RUN không tính là PASS.
- Không có chênh lệch học vụ/điểm danh/tài chính/kho không giải thích được; fixture tiền và ledger khớp chính xác.
- Authorization cả allow/deny, branch/relationship và download/export PASS.
- Backup/restore và disable/rollback được chứng minh.
- Pilot users hoàn tất tác vụ đúng role, biết cách báo lỗi.
- Integrations được bật có evidence thật phù hợp. Integrations chưa kiểm chứng được tắt/loại khỏi scope một cách rõ ràng.
- Candidate code/schema/config chính là bản sẽ dùng pilot.
- Target cloud/staging security/schema và config được kiểm chứng nếu pilot chạy online; không tự thay target DB để đạt gate.
- Owner nhận được báo cáo scope, limits, owners và evidence trước quyết định bắt đầu pilot.

GO WITH CONDITIONS chỉ dành cho hạn chế thấp, có mitigation/owner/due date và không làm yếu security, financial integrity, durability, auditability. Không dùng kết luận này để che một core case chưa chạy.

## 10. Stop conditions trong khi pilot

Tạm dừng luồng bị ảnh hưởng ngay khi có:
- Sai người nhận hoặc truy cập sai hồ sơ/chi nhánh.
- Sai/trùng receipt, debt, payout, stock hoặc academic completion.
- Mất bản ghi, không phục hồi được hoặc audit không xác định được tác giả thao tác.
- Core workflow không hoàn thành được hoặc queue/job âm thầm ngừng chạy.
- Test fixture lọt vào giao dịch/notification thật ngoài phạm vi.

Ghi evidence trước khi sửa; cô lập có mục tiêu, không xóa lịch sử hoặc reset DB. Chỉ mở lại sau retest và quyết định đúng thẩm quyền.

## 11. Deliverables Codex phải trả

Tạo dưới thư mục evidence/reports theo quy ước repo:
1. SYSTEM_TEST_SCOPE.md — route/module/role/environment inventory, in/out-of-scope.
2. TEST_RUN_MANIFEST.json — code/diff/schema/config fingerprints và fixture IDs, không secrets.
3. SYSTEM_TEST_RESULTS.md hoặc định dạng bảng đang dùng — expected/actual/evidence cho từng case.
4. BUG_REGISTER.md — severity, reproduction, cause, fix, affected scope, retest; lỗi chưa sửa không được bỏ khỏi bản cuối.
5. RECONCILIATION_REPORT.md — source expected vs DB vs UI/export, từng branch và tổng.
6. PERFORMANCE_REPORT.md — dataset, runtime, concurrency, p50/p95/max/errors, traces cần thiết.
7. RECOVERY_EVIDENCE.md — backup/restore/disable/rollback drill và thời gian đo thực tế.
8. PILOT_GO_NO_GO.md — verdict theo môi trường/scope, module allowed/disabled, blockers, người xử lý.
9. Ảnh các luồng chính và PDF mẫu đã kiểm tra; credentials nằm ngoài Git và không đính vào báo cáo.
10. Cleanup script có mục tiêu, không chạy mặc định trước khi Owner kiểm tra fixture.

Lưu ý: danh sách này là yêu cầu đầu ra sau thực thi, không phải các file đã được tạo sẵn hoặc kết quả đã có.

## 12. Mẫu báo cáo cuối cho Owner

- Overall verdict: NO-GO / READY_FOR_INTERNAL_REHEARSAL / GO_WITH_CONDITIONS / READY_FOR_PILOT_ON_TARGET_ENV.
- Environment: URL, repo/branch/fingerprint, DB identity đã che thông tin nhạy cảm, timestamp.
- Coverage: total / PASS / FAIL / BLOCKED / NOT_RUN / NOT_APPLICABLE; tách mock và live.
- P0/P1: còn bao nhiêu, module nào, evidence.
- Những luồng đã kiểm chứng từ UI đến dữ liệu và kết quả.
- Các lỗi đã sửa và retest.
- Đối soát: Academic, Attendance, Tuition/Finance, Payroll-shadow, Inventory.
- Hiệu năng và recovery: số đo thật, giới hạn.
- Modules có thể thử, modules phải khóa, tài khoản/branch/nhóm người dự kiến.
- Việc Owner còn phải quyết định: chỉ các thông tin chính sách/người dùng/môi trường còn thiếu thật sự.
- Không ghi “hệ thống an toàn tuyệt đối” hoặc “đã test toàn bộ” nếu scope/giới hạn chưa được công bố.

## Nguồn và phạm vi kế thừa

- Các yêu cầu VIBE trong cuộc trao đổi hiện tại: 4 chương trình, Pre Step, Academic/Journal/Reports/Feedback/Zalo; 3000 là cổng làm việc thống nhất.
- VIBE_Academy_Internal_Pilot_Readiness_and_SOP_Pack_V1.docx, 15/09/2026: đã đọc phần môi trường/role/scope, GO/NO-GO và rollout; trạng thái tài liệu là Owner review.
- VIBE_Student_Academic_Zalo_E2E_Codex.md: bộ 59 ca đã chuẩn bị trước, chưa có bằng chứng thực thi từ phiên ChatGPT.
- VIBE_Curriculum_4_Programs_Codex.md: đặc tả khung; số lượng mục tiêu không phải số đã tồn tại trong DB.
- Kỹ năng Verification: truy vết UI→API→Data→Response→UI và ghi bằng chứng ở từng ranh giới.
