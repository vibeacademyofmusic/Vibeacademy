# Hợp đồng nghiệp vụ: đăng ký tại quầy và tin Zalo xác nhận đăng ký

Trạng thái ngày 28/09/2026: **khóa kỹ thuật trong phạm vi local đã kiểm chứng; chưa đủ điều kiện gắn nhãn phiên bản production ổn định**. Tài liệu này mô tả hành vi hiện có cần giữ, không cấp quyền gửi tin hay triển khai. Nguồn đối chiếu: `docs/verification/zalo-consent-20260928/REPORT.md`, `docs/zalo-registration-channel-recovery.md` và `docs/crm-consolidation-delivery.md`. Báo cáo kiểm tra toàn hệ thống tại `docs/verification/system-pilot-20260928T032001Z/PILOT_GO_NO_GO.md` vẫn là NO-GO.

## Quy tắc đăng ký tại quầy

1. Nhân sự có quyền tạo bản nháp từ thông tin chi nhánh, học viên, phụ huynh, số liên hệ và chương trình/trình độ/môn học hợp lệ. Khách CRM chỉ được chuyển từ lead `WON`. Mã học viên, học viên chính thức và xếp ca không được tạo chỉ vì lưu nháp, nộp hoặc xác minh hồ sơ.
2. Trạng thái chính: `DRAFT` → `SUBMITTED` khi hồ sơ có tên và ngày sinh; `SUBMITTED` → `VERIFIED` khi nhân sự xác minh. Báo giá chỉ được chốt từ `VERIFIED`; đơn thanh toán đưa hồ sơ vào `PAYMENT_PENDING`. Các bước dùng version và request ID để chặn trang cũ và replay sai thao tác.
3. Báo giá lưu snapshot học phí, giảm giá có căn cứ, chi nhánh và lựa chọn `DEPOSIT_50` hoặc `FULL`. Cọc tối thiểu là 50% **học phí đã chốt** (làm tròn VND theo cột generated); lựa chọn thanh toán đủ yêu cầu 100%. Khoản dưới ngưỡng giữ hồ sơ ở trạng thái chờ, chưa tạo học viên hay tin xác nhận.
4. Chỉ biên nhận thanh toán đã xác thực bằng hợp đồng provider/RPC mới đẩy hồ sơ `PAID` và hoàn tất `COMPLETED`. Lúc hoàn tất tạo đúng một học viên, phụ huynh liên kết, hồ sơ chờ xếp ca và một job Zalo bền vững. Webhook/trả về trình duyệt lặp lại không tạo thêm học viên, phiếu thu hoặc job. Xếp ca là bước tiếp theo, không phải điều kiện gửi tin xác nhận đăng ký.
5. `CANCEL` được phép trước hoàn tất, trừ khi đã nhận cọc: cần luồng hoàn tiền/duyệt trước. `COMPLETED`, `CANCELLED`, `REJECTED`, `EXPIRED` không thể hủy bằng chuyển trạng thái thông thường. Sai phiên bản trả `REGISTRATION_STALE`; trạng thái không hợp lệ trả `REGISTRATION_TRANSITION_DENIED`.

Hợp đồng tại database nằm trong `supabase/migrations/20260922260000_registration_placement_v1.sql` và các migration `20260928010000`–`20260928050000`. Server action gọi RPC, không tự xác nhận tiền hoặc tạo học viên.

## Quy tắc đồng ý và gửi Zalo

1. Số liên hệ **không** phải bằng chứng đồng ý. Checkbox mặc định bỏ chọn. Khi ghi nhận đồng ý cần xác nhận rõ, số Việt Nam hợp lệ và nguồn `IN_PERSON`, `PHONE` hoặc `WRITTEN`. Tạo hồ sơ và ghi consent cùng giao dịch; lỗi ghi consent rollback cả bản nháp. Chỉ `SUPER_ADMIN` được ghi/rút consent và xem lịch sử chi tiết; quyền ở RPC là ranh giới bắt buộc.
2. Consent gắn với số chuẩn hóa `84…`, phiên bản thông báo `zbs-phone-v1`, người ghi, thời điểm và nguồn. Đổi số phải có xác nhận mới; mã consent kỳ vọng chặn thao tác từ trang cũ. Rút consent giữ audit. Kiểm tra điều kiện (`CHECK`) không gửi, không tạo attempt và không tăng số lần gửi.
3. Chỉ job `REGISTRATION_COMPLETED` của hồ sơ đã hoàn tất, thanh toán đúng ngưỡng, có consent hiệu lực trùng số nhận đã chụp, template `ZALO_REGISTRATION_CONFIRMED`/`640377` **đã duyệt và được bật**, OA/token đúng quyền mới có thể đi tới bước gửi. Giá trị `payment_status` duy nhất cho kênh PHONE là “Đã nhận cọc 50%” hoặc “Đã thanh toán đủ”; mapping nằm ở `lib/integrations/zalo/readiness.ts`, kiểm tra ở `phone.ts`, điều kiện tiền ở database.
4. Thiếu consent/recipient/template/credential giữ job ở trạng thái chặn, không được giả ghi `SENT`. `SKIPPED_NO_CHANNEL` là trạng thái lưu; `NO_CONSENT` là lý do cụ thể. Ghi consent muộn chỉ có thể chuẩn bị lại **job cũ chưa từng thử gửi**; không tự gửi và không tạo job thứ hai.
5. Trước HTTP outbound, database kiểm tra lại consent sau claim. Consent bị rút/thay sau claim chặn gửi và ghi bằng chứng nội bộ. Một attempt `REQUESTING` được lưu trước HTTP; chỉ một worker/recovery được claim. Kết quả không rõ (`ACCEPTANCE_UNKNOWN`) phải đối soát với nhà cung cấp, **không gửi lại**. `SENT` chỉ có nghĩa nhà cung cấp chấp nhận; `DELIVERED` cần bằng chứng delivery riêng. Tin đã chấp nhận/đã phát không được replay; lỗi từ chối chắc chắn mới đủ điều kiện cho luồng retry có kiểm soát.
6. Kênh UID cũ hiện bị chặn tại dispatcher vì chưa có durable claim. Không bật lại qua cấu hình token. Adapter Zalo chung trong `lib/integrations/zalo/outbound.ts` cũng cố ý không gửi; luồng đăng ký qua PHONE là đường riêng có chốt consent/job.

Các trạng thái Zalo cần giữ nguyên trong UI và dữ liệu: `QUEUED`/`PENDING`/`RETRYING` = chờ; `PROCESSING` = đang gửi; `SKIPPED_NO_CHANNEL` = thiếu điều kiện; `FAILED` = thất bại có bằng chứng; `ACCEPTANCE_UNKNOWN` = phải đối soát; `SENT` = nhà cung cấp chấp nhận; `DELIVERED` = đã xác nhận tới máy. Không gộp “đã chấp nhận” với “đã nhận”.

## Cổng hồi quy trong repository

- `npm run test:business-lock`: bộ ứng dụng tập trung gồm form tại quầy, chữ ký/đối soát MoMo và payOS, quyền, consent, PHONE outbound, retry/timeout/ambiguous và template gate. Kiểm thử Học viên/Xếp ca chạy trong cổng hồi quy tổng thể, ngoài phạm vi commit hẹp này.
- `npm run test:business-lock:db`: 8 file pgTAP, 185 assertion trên Supabase local hiện tại. Chúng kiểm tra phương án thu tiền, ngưỡng cọc, tạo một học viên/job, đồng ý nguyên tử, quyền, snapshot người nhận, claim và trạng thái delivery. Mỗi fixture chạy trong transaction và rollback.
- `.github/workflows/business-lock.yml` chạy kiểm tra kiểu, ứng dụng, dựng Supabase local mới, reset migration và pgTAP trên pull request/main. Đây là workflow GitHub Actions **mới** vì repository không có CI workflow được version hóa trước lượt này. Chưa có kết quả GitHub run hay branch protection; chủ repository cần bật required check `regression`.
- Fixture `registration_agreed_deposit_test.sql` đã được bổ sung phòng, giáo viên và lịch thực để qua guard xếp ca; toàn bộ 29 assertion đạt và file đã được đưa vào gate. Báo cáo pilot toàn hệ thống còn nhiều fixture khác lỗi tương tự, nên gate tập trung này không thay cho full regression.

## Phiên bản ổn định, phát hành và rollback

**Ứng viên hiện tại chưa được phát hành**: commit ứng viên của luồng này phải chứa chính xác mã, migration và kiểm thử trong cùng snapshot; nhiều thay đổi Học viên, học vụ và giao diện toàn hệ thống vẫn nằm ngoài phạm vi commit hẹp. Không gắn tag production khi các gate NO-GO còn mở.

Trước khi gọi bản ổn định: (1) đưa chính xác toàn bộ mã, migration và tài liệu đã nghiệm thu vào commit/PR có thể tái tạo; (2) chạy GitHub CI trên commit đó, sửa các fixture còn lỗi ngoài gate tập trung và kiểm tra regression tổng thể; (3) thực hiện sandbox end-to-end có biên nhận MoMo/payOS, mẫu 640377 đã duyệt, OA đúng chủ sở hữu, số thử có đồng ý, callback HTTPS, nhận tin/receipt trên máy; (4) chủ sở hữu chấp thuận phạm vi, quyền và kế hoạch triển khai; (5) gắn tag release vào commit đã duyệt. Không dùng số PASS local như phê duyệt nền tảng.

Triển khai sau khi được cho phép: lưu snapshot/backup và sổ migration trước thay đổi; triển khai migration tăng tiến theo timestamp, rồi app cùng commit release; giữ cổng gửi Zalo tắt cho tới khi OA/template/recipient/quyền đã được đối soát và owner bật có chủ đích; kiểm tra một hồ sơ thử, biên nhận, consent, một job và trạng thái nhận. Không thực hiện thao tác này trong lượt khóa nghiệp vụ.

Rollback: trước khi có ghi nghiệp vụ mới, phục hồi app về release trước **chỉ khi schema tương thích**, và phục hồi DB từ snapshot đã kiểm tra theo kế hoạch được duyệt. Sau khi có tiền/học viên/job mới, không xóa migration, job, attempt hoặc phiếu thu và không khôi phục DB gây mất giao dịch; tắt template/scheduler để chặn outbound mới, giữ `ACCEPTANCE_UNKNOWN` để đối soát, dùng migration sửa tiến và bút toán điều chỉnh/hoàn tiền có duyệt. App rollback không đảo ngược schema. Mọi replay webhook phải giữ idempotency key gốc.

## Ranh giới kỹ thuật và nền tảng

Đã được chặn bằng mã/DB/test: trạng thái đăng ký, ngưỡng tiền, consent riêng với số liên hệ, quyền RPC, snapshot người nhận, template gate, durable claim, chặn gửi lại khi chưa rõ kết quả và phân biệt provider acceptance/delivery. CI mới sẽ báo lỗi khi các bài hồi quy này hỏng **sau khi mã được đưa lên GitHub**.

Vẫn cần cấu hình/phê duyệt ngoài repository: GitHub branch protection required check; quyền Supabase/staging/production và sao lưu; chủ sở hữu OA dùng chung, token/refresh ownership, template được duyệt và send gate; sandbox payment credentials, webhook/HTTPS public origin, số thử được cho phép và bằng chứng đồng ý thật; người duyệt release/rollback. Không có tin khách hàng hoặc production deployment trong lượt này.
