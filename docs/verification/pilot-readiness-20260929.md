# Đánh giá sẵn sàng pilot — 29/09/2026

Nhánh: `codex/release-candidate-lint`. Pull request: https://github.com/vibeacademyofmusic/Vibeacademy/pull/3 (chưa merge).

Commit xuất phát: `3dde64c0dfb4041ca920f5fb21ff16bc8b70496f`.
Commit mã và bằng chứng: `75e0d016a8a1bd75e8856106aa327abb10707ae3`.

## Quyết định

**NO-GO.** Chưa bắt đầu pilot.

Đã khóa đường gọi Zalo phía máy chủ khi không phải production, đã nâng một bản sao của snapshot qua toàn bộ migration còn thiếu mà không xóa học viên, payment hay trao đổi, và đã bỏ tạo khóa học mới. Vẫn thiếu phiên đăng nhập, ánh xạ preview sang database, và hai câu nghiệp vụ chưa chốt. Kiểm thử tổng hợp không phải pilot trên dữ liệu thật.

## Zalo — khóa gửi phía máy chủ

Trước: `sendZaloPhoneTemplate`, gửi UID, `dispatchPreviewRegistrationZalo`, gia hạn token, đổi mã OAuth và `verifyZaloToken` vẫn gọi transport khi có credential và mẫu bật. Worker hàng đợi không gọi mạng nhưng ghi `ZALO_OUTBOUND_NOT_CONFIGURED`.

Sau: `lib/integrations/zalo/pilot-outbound.ts`. Provider bị chặn khi `ZALO_PILOT_OUTBOUND=disabled`, hoặc khi biến đó không phải `enabled` và `VERCEL_ENV` khác `production`. Production giữ cổng cũ nếu không đặt biến mới và `VERCEL_ENV=production`. Không đổi cấu hình production.

Khi bị chặn, hàm trả `ZALO_PILOT_OUTBOUND_DISABLED`, không gọi transport, không ghi delivered. Nhắc học phí vẫn kết thúc `ERROR`, mã lỗi là mã khóa này, không phải `SENT`. Dispatch trả về trước khi claim. Gia hạn token và đổi authorization code không chạy.

`tests/zalo-pilot-outbound.test.cjs` chứng minh số lần gọi transport bằng 0 khi mẫu bật và credential có mặt, kể cả `VERCEL_ENV=production` cộng `ZALO_PILOT_OUTBOUND=disabled`, và khi biến pilot không đặt. Một ca `VERCEL_ENV=production` không đặt biến pilot vẫn đi qua mock transport đúng một lần và `delivered` vẫn là false.

## Nâng cấp `20260928200000`

Snapshot `vibe_pilot_restore_20260928_032001` không bị sửa. Trước và sau lượt này: 9 học viên, 2 payment, 2 `learning_conversations`, 16 tin nhắn, ledger không có `20260928200000`.

Ledger snapshot dừng ở `20260928190000` nhưng bỏ qua `20260928080000` và `20260928090000`. Bảng `learning_conversations` đã có đủ cột, ràng buộc, chỉ mục duy nhất `(kind, entity_id, source_version)`, RLS bật, không có policy, `anon` và `authenticated` không có quyền bảng. Bốn hàm trao đổi và ba mẫu `PENDING`/`enabled=false` đã có. Thân `learning_conversation_write` trùng database làm việc. Schema đi trước sổ migration vì SQL đã được chạy mà không ghi `schema_migrations`.

Không đánh dấu mù, không `DROP`, không thêm `IF NOT EXISTS` vào file migration. `scripts/reconcile-academic-family-communications.sql` chỉ ghi ledger khi đối chiếu cột, ràng buộc, RLS, quyền và hàm khớp. Đã chạy trên bản sao `vibe_upgrade_20260929`, không chạy trên snapshot.

`20260928201000` cũng đã có hàm và trigger khớp file. `attendance_roster_read(uuid)` đã có đúng thân và quyền (`authenticated` được execute, `anon`/`public`/`service_role` không). Hai phiên bản đó được ghi ledger trên bản sao sau đối chiếu, không chạy lại `CREATE`.

`20260928090000` đã có bảng `zalo_connection_checks` đúng cột. File gốc dùng `IF NOT EXISTS` nên lần chạy trên bản sao bỏ qua `CREATE TABLE` sau khi cột đã được đối chiếu, rồi thay hàm.

Phần migration còn lại chạy được trên bản sao đến `20260929201000`. Sau nâng cấp: vẫn 9 học viên, 2 payment, 2 hội thoại, 16 tin. ACL hai bảng trao đổi không đổi: `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`.

Cài đặt sạch của riêng file `20260928200000`: bản sao `vibe_clean_conversation_20260929` được xóa hai bảng trao đổi và bốn hàm để file gặp schema chưa có chúng. File chạy hết. Học viên vẫn 9, payment vẫn 2, hội thoại mới bằng 0 vì bản sao này cố ý bỏ dữ liệu trao đổi cũ để `CREATE TABLE` chạy được. `anon` và `authenticated` không được `SELECT`. `authenticated` được execute hàm ghi. Đây không phải đường giữ dữ liệu. Đường giữ dữ liệu là bản sao nâng cấp ở trên.

Hai database tạm đã được xóa sau khi lấy số liệu. Snapshot gốc còn nguyên.

Cài đặt sạch toàn bộ chuỗi migration vẫn là `supabase db reset` trong job `regression` trên runner trống. Kết quả CI của commit này ghi ở cuối sau khi push.

## Khóa học

Luật đã duyệt: Chương trình → Trình độ → Môn học → Bài học. Ca dạy là lớp. Không hỏi duyệt lại.

Đã bỏ tab “Khóa học”. `createCourse` không còn ghi bảng `courses`. Màn `view=courses` chỉ còn hồ sơ cũ. Trang chương trình nói rõ lộ trình mới.

Việc cần quyết định migration riêng, chưa làm:

- `classes.course_id` vẫn `NOT NULL` từ `20260901101225_class_enrollment_management.sql`. Form tạo ca dạy vẫn phải chọn khóa học cũ.
- Xếp lớp và một số hàm học liệu `join` qua `classes.course_id`. Bỏ cột hoặc cho phép null sẽ làm các ca mới biến mất khỏi những câu đó nếu chưa viết lại.
- Trang sửa khóa học cũ vẫn còn. Không dùng cho đăng ký mới.

Không xóa dòng `courses` hay `classes.course_id` hiện có.

## Hai câu chưa chốt

Không bịa quy tắc mới.

1. Mốc “trên 18”: mã hiện tại coi ngày sinh nhật thứ 18 là chưa “trên 18” (`birth + 18 năm < hôm nay theo Asia/Ho_Chi_Minh`). Chưa có quyết định nghiệp vụ nào khác để đổi.
2. Bảo lưu có làm đổi học phí, nợ hoặc điểm danh hay không: migration chỉ có khoảng ngày inclusive và trạng thái bản ghi `ACTIVE`/`CANCELLED`. Không thấy quy tắc đã duyệt về tiền hay điểm danh. Chưa thực hiện hệ quả tài chính.

## Việc chưa làm được vì thiếu quyền

Đăng nhập: trình duyệt local trước đó dừng ở `/login`. Không có phiên đã đăng nhập trong lượt này. Không xin mật khẩu và không đặt lại tài khoản. Cần đăng nhập local tại `http://localhost:3000/login` bằng tài khoản đã cấp rồi báo lại để kiểm tra vai trò.

Ánh xạ preview sang database: URL preview vẫn cổng SSO Vercel. Lần đọc SQL staging/production trước đó bị chặn với lý do: công cụ từ chối vì hướng dẫn không được truy vấn staging hoặc production khi chưa có phê duyệt riêng. Không thử lại và không dùng tài liệu lịch sử (`qhznfywwrhmcwbkujclm`, `owpfqwdrmyzcmjahehek`) làm bằng chứng deployment.

## Rollback

Không dùng deployment Production ngày 15/09, SHA `770b81855609`, làm đích rollback của pilot. SHA đó phục vụ môi trường production đã biết, không phải snapshot pilot `vibe_pilot_restore_20260928_032001`.

Phiên bản ứng dụng tương thích với snapshot trước khi nâng cấp là commit nền của buổi kiểm `45822a4d9dd56317324f9c554df76b42f55c1199` trên `feature/learning-report-v2`, kèm dirty tree lúc lấy snapshot. Các file migration từ `20260928080000` trở đi có trong commit `df989b1`, cùng một commit, nên không có commit Git nào vừa khớp ledger snapshot vừa chứa đủ mã sau đó.

Phục hồi database là việc riêng: restore bản dump lấy ngay trước migration. Dump buổi kiểm có SHA-256 `ed4432261bad47cb682deb45265be9047d0554f013b86cf437db4a463acd683b` trong `docs/verification/system-pilot-20260928T032001Z/RECOVERY_EVIDENCE.md`. Không có migration đi xuống. Chưa diễn tập restore lên staging. **Not verified** ngoài bản sao local ở trên.

Push nhánh `codex/**` chạy workflow `regression` và, theo các push trước của nhánh này, tạo deployment Preview cho vibeacademy, vibeacademy-staging và hooks-preview-relay. Workflow trong repo không deploy production. Không merge.

## Khóa SSH

Hai tệp chưa theo dõi nằm ở thư mục gốc, tên bắt đầu bằng `ssh-keygen`. Một tệp là khóa riêng OpenSSH, quyền `600`, 419 byte. Tệp kia là khóa công khai, quyền `644`, 107 byte. `git ls-files` không thấy chúng. Lịch sử Git không có tên tệp này và không có chuỗi `BEGIN OPENSSH PRIVATE KEY`.

Đã sao chép sang `~/.vibe-private/zalo-gateway-staging/` và xóa bản trong repository. `.gitignore` chặn đúng hai tên đó. Không xóa khóa ở nơi cất riêng, không thu hồi khóa trên máy chủ.

Không có bằng chứng lộ qua Git. Chưa cần xoay khóa chỉ vì repository. Cần xoay nếu khóa riêng đã bị copy ra ngoài máy này. Việc đó là **Not verified**.

## Lint

`npx eslint .` trên cây trước lượt này: exit 0, **0 lỗi, 73 cảnh báo**. Lượt này không tắt rule.

## Commit cuối

`75e0d016a8a1bd75e8856106aa327abb10707ae3` chứa mã, test và bằng chứng nâng cấp. Dòng này nằm ở commit tài liệu ngay sau commit đó trên `codex/release-candidate-lint`. Job `regression` chạy trên HEAD của pull request.
