# Đăng ký tại quầy và Zalo — kiểm chứng staging, 29/09/2026

## Kết luận hiện tại

**NO-GO cho production.** Đã lấy bản sao schema/dữ liệu `public` staging nhưng
chưa diễn tập restore và chưa có bản sao Auth/Storage. Chưa triển khai
schema và app cùng một commit ở staging, chưa có kiểm thử gửi Zalo thật và xác nhận
nhận trên thiết bị, và commit sửa CI chưa được kiểm chứng trên GitHub.
Không có tin nào được gửi trong đợt kiểm tra này; không triển khai production.

## Phiên bản và bằng chứng đã có

- `3a2ddd9` là commit ứng viên đăng ký tại quầy/Zalo đã đẩy lên
  `codex/counter-zalo-staging-candidate`. Trên GitHub, run
  [36488688480](https://github.com/vibeacademyofmusic/Vibeacademy/actions/runs/36488688480)
  đạt cài đặt, typegen, typecheck, build và bộ test ứng dụng, nhưng **FAIL** tại
  `supabase start`; các bước SQL bị bỏ qua. Log ghi `SQLSTATE 42703`:
  `class_row.accepted_from_level_id` không tồn tại trong migration
  `20260925230000_teaching_shift_assignment_v1.sql`.
- Nguyên nhân: migration `20260924130000_mixed_level_class_ops_v1.sql` tạo cột đó
  nằm trong thay đổi local chưa commit, nên thử trên database local đang có cột đã
  che khuất phụ thuộc. Commit bổ sung `de665d5` chỉ đưa migration phụ thuộc vào
  nhánh ứng viên. Bản phát lại từ cây sạch trong Supabase local riêng đã áp dụng
  toàn bộ migration và chạy 8 file pgTAP (185 assertion) thành công. `de665d5`
  **chưa có bằng chứng CI GitHub** tại thời điểm lập báo cáo.
- Trước sửa, bản xuất từ commit sạch đạt typegen, typecheck, build và 86/86 test
  ứng dụng. Đây là bằng chứng local, chưa thay thế kiểm chứng staging.
- Ban đầu GitHub không có ruleset/branch protection. Sau khi chủ sở hữu phê duyệt
  riêng, đã bật protection cho `main` và đọc lại qua API: required check
  `regression`, strict up-to-date, áp dụng cho quản trị viên, không cho force-push
  hoặc xóa nhánh. Đây là cấu hình nền tảng đã xác minh; check của ứng viên vẫn
  cần PASS trên GitHub.

## Đối chiếu staging

- Project Supabase được chỉ định là `vibe-academy-staging`, ref
  `owpfqwdrmyzcmjahehek`. Sổ migration đọc từ remote có **28 phiên bản local
  chưa áp dụng**, không có phiên bản chỉ ở remote. Trong đó 16 nằm trong commit
  `3a2ddd9`, một phiên bản phụ thuộc được thêm ở `de665d5`, và 11 phiên bản
  thuộc thay đổi local khác. Không được chạy `db push` từ working tree hiện tại
  vì nó sẽ kéo theo các migration ngoài commit ứng viên.
- URL Vercel preview gắn với nhánh được bảo vệ bằng SSO (HTTP 302). Chưa xác minh
  được cấu hình môi trường của preview trỏ đúng Supabase staging, trạng thái
  triển khai app cùng commit, callback HTTPS, role, template và OA.
- Lần dump đầu bị treo và đã dừng; lần thử giới hạn thời gian thành công. Bản sao
  schema `public` có 151 bảng, 1.352.482 byte, SHA-256
  `47b43537fe60bc28c5d23258eeeb38fb09387fe221481b9a5240c387549aae29`.
  Bản sao dữ liệu `public` có 151 khối COPY, 243.403 byte, SHA-256
  `fe7781ac70bf5a546e7f4f9d2988b6995c5e8cc25081395274068260e2ee35d9`.
  Hai file ở `/private/tmp/vibe-staging-public-{schema,data}-pre-3a2ddd9.sql`,
  quyền `0600`. Chưa có bản sao Auth/Storage hoặc diễn tập restore, nên chưa
  áp migration staging.
- `.env.local` trỏ tới Supabase `127.0.0.1:54321`, không phải cấu hình staging.
  Không dùng token hoặc người nhận của local để suy ra quyền gửi staging.

## Rà từng điều kiện NO-GO

1. **Hồi quy DB toàn hệ thống: CHẶN.** Báo cáo pilot 28/09 ghi 98 file/1.609
   assertion đã thực thi nhưng 46 file lỗi/dừng. Bộ 8 file nghiệp vụ đạt trong
   local sạch chỉ bảo vệ phạm vi đăng ký/Zalo, chưa làm toàn hệ thống PASS.
2. **Cấu trúc và nội dung học thuật: CHẶN production toàn hệ thống.** Sai lệch
   cấu trúc thực tế, Piano Pre Step và phê duyệt nội dung chưa được đóng.
3. **Backup và khôi phục: CHẶN.** Đã có snapshot `public` và checksum, nhưng
   chưa chứng minh restore độc lập Auth, keys, Storage, scheduler và crash
   recovery. File local chưa thay thế backup được quản lý, lưu giữ và khôi phục.
4. **Hiệu năng và hành trình tích hợp: CHẶN.** Chưa có rehearsal 60 phút, 10
   hành trình browser tích hợp, đối soát dữ liệu tài chính/payroll/inventory sau ghi.
5. **Quyền và nhà cung cấp: CHẶN.** Chưa có ma trận quyền staging toàn bề mặt;
   OA dùng chung chưa xác nhận chủ sở hữu token/refresh; chưa có bằng chứng mẫu
   `640377` được duyệt/bật đúng môi trường, callback/receipt thật và người nhận
   đã đồng ý được đối chiếu với job cụ thể. User cho phép một tin thử, nhưng quyền
   đó chưa xác định số/OA/job trong staging và chưa có điều kiện gửi an toàn.
6. **UAT và phê duyệt: CHẶN.** Chưa có người dùng thật ký nhận, chủ sở hữu chưa
   phê duyệt release/rollback và phạm vi production.
7. **CI bắt buộc: CHẶN kết quả.** Run của `3a2ddd9` thất bại; commit sửa chưa
   chạy CI remote. GitHub đã cấu hình required check `regression` trên `main`.
8. **Staging cùng commit: CHẶN.** Chưa triển khai migration/app cùng SHA; chưa
   chạy chống gửi trùng, timeout, thiếu consent và nhận Zalo thật trên staging.

## Chốt tắt gửi phát hiện khi rà soát

Đường PHONE ban đầu không kiểm tra cờ gửi UID và bản `claim`/`authorize` chưa
kiểm tra `notification_templates.enabled` cho job đã xếp hàng. Vì thế chỉ tắt
template không bảo đảm dừng request PHONE. Migration bổ sung
`20260928224000_zalo_registration_send_gate.sql` dùng cờ template làm chốt DB:
trước claim trả `GATE_DISABLED`, ngay trước HTTP chặn reservation và ghi audit
`ZALO_GATE_DISABLED` mà không gọi Zalo. Ứng dụng nhận kết quả này như chặn nội bộ,
không ghi giả `ACCEPTANCE_UNKNOWN`. Trong cây và Supabase local sạch, build,
typecheck, 8 file SQL/192 assertion và 87 test ứng dụng PASS. Chốt này **chưa triển khai staging** và chưa
được xác nhận bởi GitHub CI.

## Trình tự triển khai staging sau khi gỡ chặn

1. Chốt SHA đã PASS CI, tạo bản sao staging có mã kiểm toàn vẹn và kiểm thử restore
   ở môi trường tách biệt. Ghi lại migration ledger, row counts và các tổng tiền
   theo đơn vị tiền tệ; xác nhận Auth/Storage theo kế hoạch khôi phục tương ứng.
2. So sánh chính xác migration của SHA với remote, áp dụng tăng tiến chỉ các file
   thuộc SHA, kiểm tra ledger và đối soát sau mỗi nhóm. Không reset remote và
   không dùng working tree đang có 11 migration ngoài ứng viên.
3. Triển khai app staging từ cùng SHA, xác minh biến môi trường chỉ trỏ project
   staging, URL/auth redirect/role, giữ send gate tắt ban đầu.
4. Đối chiếu OA, token owner, template, đúng số thử đã đồng ý và job; bật cổng
   gửi có thời hạn cho đúng một tin thử. Lưu provider acceptance riêng với bằng
   chứng `DELIVERED`/thiết bị nhận. Sau đó thử duplicate, timeout/ambiguous và
   thiếu consent bằng fixture không gửi thêm tin ngoài hạn mức.
5. Tắt cổng gửi và khóa bằng chứng. Chỉ đề xuất production khi mọi gate liên
   quan đạt và người có thẩm quyền ký nhận.

## Tắt gửi và rollback giữ giao dịch

- Dừng scheduler/worker outbound, đặt `notification_templates.enabled=false`
  cho `ZALO_REGISTRATION_CONFIRMED`, rồi đợi các request đang bay hoàn tất trước
  khi xác nhận tắt gửi. Giữ nguyên queue, attempt và audit. `ACCEPTANCE_UNKNOWN` cần đối
  soát với Zalo, tuyệt đối không tự retry.
- Trước khi có ghi nghiệp vụ mới, có thể redeploy app release trước nếu schema
  tương thích; restore DB chỉ sau khi thử điểm khôi phục và được duyệt.
- Sau khi có học viên, thanh toán, job hoặc attempt mới, **không** hoàn DB về
  snapshot cũ vì sẽ mất giao dịch. Giữ ledger/webhook idempotency, dùng migration
  sửa tiến và bút toán điều chỉnh/hoàn tiền theo quyền. Không xóa migration,
  phiếu thu, job hay attempt để “rollback”.

Nguồn NO-GO toàn hệ thống: `docs/verification/system-pilot-20260928T032001Z/PILOT_GO_NO_GO.md`.
Quy tắc nghiệp vụ và kiểm thử tập trung: `docs/business-lock-counter-registration-zalo-20260928.md`.
