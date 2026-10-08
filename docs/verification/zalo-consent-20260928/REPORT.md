# Kiểm tra và sửa đồng ý nhận Zalo — 28/09/2026

Hồ sơ: **DK-20260928-91966813EDE4**. Môi trường: **http://localhost:3000**, Supabase local. Bản cuối dựng lúc `2026-09-28T05:51:03.358Z`.

## Kết luận và nguyên nhân gốc

Hồ sơ thật không có bản ghi nào trong `registration_zalo_phone_consents`, kể cả bản đã rút. Số liên hệ của hồ sơ hợp lệ theo quy tắc chuẩn hóa hiện hành, nhưng số liên hệ không phải bằng chứng đồng ý. Job duy nhất chưa có `delivery`/`consent_id`/số nhận tin, `attempts=0`, `sent_at=null`.

Truy vết trước sửa:

1. `new/CounterForm.tsx` không có checkbox đồng ý Zalo; chỉ nhập số liên hệ.
2. `createRegistration` chỉ chuyển số liên hệ và thông tin đăng ký vào `create_registration_application_with_academics`; không truyền đồng ý.
3. RPC tạo đăng ký không ghi bảng đồng ý. Form ghi nhận tại trang chi tiết đã có, nhưng hồ sơ này không có dữ liệu chứng minh thao tác đó từng được lưu thành công.
4. Khi đăng ký hoàn tất, outbox tạo job `SKIPPED_NO_CHANNEL` vì chưa có consent để chụp số nhận tin. Eligibility đọc dữ liệu mới và trả `NO_CONSENT`.
5. Giao diện phản ánh đúng việc thiếu consent. Chưa có bằng chứng đây là consent bị mất khi lưu, đọc dữ liệu cũ, lỗi token hay lỗi API Zalo.

`SKIPPED_NO_CHANNEL` là trạng thái tổng quát “chưa có kênh nhận đủ điều kiện”; `NO_CONSENT` là nguyên nhân cụ thể. Giữ nguyên enum và hợp đồng worker. Không chuyển job sang gửi lỗi hoặc báo đã gửi.

## Bản sửa

- Form tạo mới có checkbox không chọn sẵn và nguồn xác nhận bắt buộc khi chọn đồng ý. Checkbox gắn rõ với số liên hệ đang nhập.
- RPC mới tạo hồ sơ và lưu đồng ý trong cùng giao dịch; lỗi consent không để lại bản nháp tạo dở. Không chọn checkbox thì không sinh consent.
- Trang chi tiết cho `SUPER_ADMIN` ghi nhận đồng ý hoặc rút đồng ý bằng thao tác riêng có checkbox xác nhận. Giữ phạm vi quyền cũ, không nâng quyền cho quản trị chi nhánh/giáo viên.
- Lưu người ghi nhận, thời điểm, nơi ghi nhận (`REGISTRATION_FORM`/`REGISTRATION_RECORD`), phương thức xác nhận (trực tiếp/cuộc gọi/văn bản), và người/thời điểm kết thúc hiệu lực. Hiển thị lịch sử với số che bớt.
- Chuẩn hóa `0xxxxxxxxx`, `84xxxxxxxxx`, `+84…` về `84…`; chấp nhận phân cách thông thường, từ chối chuỗi có chữ. Số gửi luôn được so với consent còn hiệu lực.
- Mỗi lần lưu dùng mã consent đang hiển thị để phát hiện trang cũ/nhấn lưu trùng. Thay số phải ghi nhận một xác nhận mới rõ ràng.
- Với job chưa từng thử gửi và không có bằng chứng gọi dịch vụ, lưu consent cập nhật snapshot và đánh giá điều kiện trong cùng giao dịch. Không tạo job thứ hai. Dữ liệu phía giao diện được đọc lại; trạng thái nút không giữ bản consent cũ.
- Giữ nguyên snapshot của job đã thử gửi, đã chấp nhận hoặc chưa rõ kết quả. Không tự đổi người nhận của những job đó.
- “Kiểm tra lại điều kiện” không gọi transport, không tạo attempt và không tăng số lần gửi. Lưu consent cũng không gửi tin.
- Kiểm tra consent tại ranh giới gọi dịch vụ cho cả gửi thủ công và luồng tự động. Rút/thay consent sau khi giữ chỗ nhưng trước gọi dịch vụ sẽ bị chặn; ghi bằng chứng chặn nội bộ, không giả lập lỗi/token/HTTP của Zalo.
- Nếu RPC đọc consent lỗi, hiển thị lỗi đọc dữ liệu thay vì kết luận thiếu đồng ý. Lỗi consent có liên kết sửa ngay tại hồ sơ; thao tác quản lý/gửi bị ẩn ngoài quyền.

## File thay đổi trong phạm vi lần sửa này

| File | Nội dung |
| --- | --- |
| `app/admin/business/registrations/new/CounterForm.tsx` | Checkbox, số được đồng ý, nguồn xác nhận |
| `app/admin/business/registrations/new/page.tsx` | Đọc quyền, hiển thị form theo quyền |
| `app/admin/business/registrations/actions.ts` | Payload tạo mới, lưu/rút consent, đọc lại trang |
| `app/admin/business/registrations/ConsentPanel.tsx` | Form chi tiết và lịch sử consent |
| `app/admin/business/registrations/[id]/page.tsx` | Đọc mới, xử lý lỗi đọc, cập nhật recovery, liên kết khắc phục |
| `lib/integrations/zalo/preview-dispatch.ts` | Chốt kiểm tra consent trước transport, xử lý chặn nội bộ |
| `lib/integrations/zalo/recovery-labels.ts` | Thông báo nguồn xác nhận, trang cũ, rút đồng ý |
| `supabase/migrations/20260928223000_registration_zalo_consent_lifecycle.sql` | Audit metadata, quyền, giao dịch tạo/lưu/rút, chốt gửi |
| `supabase/tests/database/registration_zalo_consent_lifecycle_test.sql` | 37 kiểm tra dữ liệu, giao dịch và phân quyền |
| `tests/registration-zalo-consent.test.cjs` | 5 kiểm tra payload và giao diện theo quyền |
| `tests/zalo-admin-ui.test.cjs` | Cập nhật hợp đồng đọc consent của trang |
| `tests/zalo-durable-recovery.test.cjs`, `tests/zalo-phone-registration.test.cjs` | Bổ sung mô phỏng chốt consent và thử rút sau claim |

Migration đã được áp dụng và ghi nhận **chỉ trên Supabase local**. Không push/deploy, không sửa enum trạng thái, không backfill đồng ý cho hồ sơ cũ.

## Kết quả kiểm thử

| Tình huống | Kết quả / bằng chứng |
| --- | --- |
| Không đồng ý | Không có consent; job bị chặn `NO_CONSENT`; nút gửi tắt |
| Đồng ý đúng số | SQL + payload test + thao tác trình duyệt: số chuẩn hóa trùng snapshot |
| Đổi số | Consent cũ hết hiệu lực, actor được lưu; consent mới gắn snapshot của job chưa thử gửi; UI cập nhật ngay |
| Rút đồng ý | UI/SQL: không còn consent hiệu lực, nút gửi tắt; giữ lịch sử |
| Tải lại trang | Consent, người ghi nhận, thời điểm, nguồn và số đã chuẩn hóa vẫn được đọc đúng |
| Bổ sung sau hoàn tất | Hồ sơ giả lập hoàn tất: job cũ từ bỏ qua → đủ điều kiện, vẫn một job, 0 attempt |
| Nhấn gửi liên tiếp | Transport giả lập + CAS hiện có: hai lời gọi đồng thời chỉ phát một yêu cầu; replay cũ không tăng số lần gửi |
| Người không có quyền | SQL từ chối chưa đăng nhập và người đã đăng nhập không có vai trò; kiểm thử render không có form ghi consent |
| Rút sau claim, trước outbound | Chặn tại DB trước transport, 0 lần gửi; replay reservation bị từ chối |
| Lỗi lưu consent ở form mới | Cả giao dịch tạo hồ sơ được hoàn tác, không có draft dở |
| Thanh toán / học vụ | So sánh JSON của đăng ký, payOS và placement trong test; hash hồ sơ thật trước/sau trùng nhau |
| Chống tự gửi | Không bấm nút gửi trên trình duyệt; các bài thử gửi chỉ dùng transport giả lập |

- 37/37 pgTAP đạt trên cơ sở dữ liệu thử riêng và trên local chính, mỗi lần trong giao dịch rollback.
- 79/79 kiểm thử Zalo đạt; 5/5 kiểm thử form mới đạt.
- Sau chỉnh giao diện cuối, 47/47 kiểm thử tập trung chạy lại đạt.
- Lint các file sửa, kiểm tra TypeScript và build production đạt.
- Kiểm chứng giao diện thực: desktop 1280px và mobile 390px; không tràn ngang (`scrollWidth == clientWidth`). Giữ `SectionCard`, `InlineNotice`, `vibe-field`, `vibe-button`, khung trang và token VIBE có sẵn. Đã xem ảnh kết quả, không chỉ dựa vào biên dịch.
- Kiểm thử phân quyền trên trình duyệt bằng tài khoản thứ hai không được dùng làm bằng chứng: phiên trình duyệt vẫn hiển thị tài khoản quản trị. Kết luận phân quyền dựa vào kiểm thử DB và render nêu trên.

## Trạng thái bàn giao và giới hạn

Hồ sơ thật **vẫn chưa có consent, 0/5 lần gửi, `sent_at=null`**. Không tự ghi nhận đồng ý thay phụ huynh. Số nhận thử thật chưa được xác định/cho phép nên **chưa gửi tin thật, chưa xác minh phát tin của Zalo**. Mẫu hiển thị duyệt không chứng minh gửi thành công hoặc kết nối API hoạt động.

Người có quyền có thể vào hồ sơ, nhập số phụ huynh đã xác nhận, chọn nguồn, đánh dấu xác nhận và bấm **Ghi nhận đồng ý**. Hệ thống kiểm tra lại từ dữ liệu mới. Chỉ khi có người nhận thử được phép mới thực hiện bước gửi thật riêng.

Job có lịch sử giữ chỗ/đã thử gửi không tự đổi người nhận hoặc tự gửi lại. Trường hợp hiếm bị chặn tại ranh giới outbound sau claim vẫn giữ audit reservation và yêu cầu đối soát nếu muốn tiếp tục; không xóa lịch sử để mở lại gửi.

Hai hồ sơ giả lập được giữ rõ danh tính để đối chiếu: `DK-ZALO-CONSENT-UI-TEST` và `DK-20260928-6205AC0CB0BD` (học viên `TEST ZALO CONSENT FORM 20260928`). Đã rút mọi consent giả lập; job giả lập không có attempt/sent_at. Không chỉnh dữ liệu thanh toán/học vụ của hồ sơ thật.

## Bằng chứng

- `raw/target-before.json`: trạng thái ban đầu, không chứa số điện thoại đầy đủ.
- `raw/target-invariants-before.json`, `raw/target-invariants-after.json`: kết quả đối chiếu hồ sơ thật giống hệt nhau, kể cả sau nút kiểm tra điều kiện.
- `raw/database-tests.txt`, `raw/database-main-tests.txt`: pgTAP.
- `raw/node-tests.txt`, `raw/form-tests.txt`, `raw/final-focused-tests.txt`: kiểm thử ứng dụng.
- `raw/lint.txt`, `raw/typecheck.txt`, `raw/build.txt`: kiểm tra bản dựng.
- `raw/ui-consent-after-reload.txt`, `raw/ui-new-form-persisted.txt`, `raw/ui-revoked.txt`, `raw/ui-final-desktop.txt`, `raw/ui-fixture-final.json`: bằng chứng giả lập.
- `screenshots/consent-desktop.png`, `screenshots/revoked-desktop-final.png`, `screenshots/target-mobile.png`: kiểm tra thiết kế và trạng thái thực.
