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

Đăng nhập 30/09 lúc kiểm tra lại: tab tự động của Cursor, tiêu đề “VIBE Academy”, view `glass-browser-0c515d31-d78a-4ddd-a153-8077cb69a1e1`, vẫn ở `http://localhost:3000/login`. Trang là form Email/Password, không có cookie. Phiên này không thấy phiên người dùng vừa đăng nhập.

Kết nối đang mở tới cổng 3000 còn một trình duyệt khác: Codex bên trong ChatGPT.app, thư mục dữ liệu `/Users/macbookair/Library/Application Support/Codex`, tiền tố user agent `CodexBrowser`, tiến trình mạng PID 50427. Cookie của trình duyệt đó không được đọc và không được chép sang tab Cursor. Sổ `auth.sessions` local chỉ có user agent `node`, không có phiên trình duyệt. Không đặt lại mật khẩu.

Luồng đã đăng nhập, từ chối vai trò, đăng ký, hồ sơ học viên, xếp lớp, điểm danh, học phí, phiếu thu, bảo lưu và học bù vì thế chưa thao tác được trên phiên người dùng. Cần đăng nhập lại trên đúng tab Cursor ở `http://localhost:3000/login`.

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

## Commit ứng viên đã triển khai Preview

SHA đã đẩy và đang chạy Preview: `fed93be98c3ed34a14a42e57a0dbadc54416b2ce`.

Run `regression` thất bại trước đó, https://github.com/vibeacademyofmusic/Vibeacademy/actions/runs/36571794278, vì phục hồi đăng ký còn trả SEND khi khóa pilot chặn provider. `fed93be` sửa đường đó. Run push https://github.com/vibeacademyofmusic/Vibeacademy/actions/runs/36572381761 và run pull request https://github.com/vibeacademyofmusic/Vibeacademy/actions/runs/36572388704 đều thành công, gồm `supabase db reset` trên runner trống. Cổng hồi quy của đúng SHA này đạt. SHA này vẫn cho phép gọi provider khi `VERCEL_ENV=production` và `ZALO_PILOT_OUTBOUND` thiếu hoặc không phải đúng `enabled`.

## Bằng chứng 30/09/2026

Quyết định vẫn **NO-GO**. Phần dưới chỉ ghi việc mới.

### Khóa gửi Zalo

Trên `fed93be`, `zaloPilotOutboundBlocked` trả về chặn khi giá trị là `disabled`, và khi giá trị không phải `enabled` thì chỉ chặn nếu `VERCEL_ENV` khác `production`. Vì vậy production thiếu biến, hoặc nhận chuỗi rỗng, `false`, `true`, `yes`, `Enabled`, `enabled ` vẫn mở cổng gọi ra ngoài. Đó là hành vi không an toàn.

Sửa local, chưa commit và chưa có trên Preview: chỉ đúng chuỗi `enabled` mới mở cổng. Mọi giá trị khác, kể cả thiếu biến và `VERCEL_ENV=production`, trả `ZALO_PILOT_OUTBOUND_DISABLED` trước transport.

`node --test tests/zalo-pilot-outbound.test.cjs tests/pilot-failure-log.test.cjs`: 14/14 đạt. Chín chế độ thiếu, preview, rỗng, `false`, `true`, `yes`, `Enabled`, `enabled ` và `disabled` đều có số lần gọi provider bằng 0 trên gửi điện thoại, gửi UID, xác nhận đăng ký, gia hạn credential, kiểm tra token, đổi mã OAuth, nhắc học phí qua `sendZaloTemplateMessage`, lịch `maintainZaloCredentials`, hàng đợi chạy hai lần, và phục hồi ở trạng thái RETRY. Một ca đặt đúng `enabled` đi qua mock đúng một lần và `delivered` vẫn là false. Chưa chạy lại GitHub `regression` cho cây local này.

### Preview và phạm vi cấu hình

Đọc cấu hình đã cấp quyền, không ghi giá trị secret.

| Dự án Vercel | Mục tiêu | SHA | `ZALO_PILOT_OUTBOUND` | Supabase |
| --- | --- | --- | --- | --- |
| vibeacademy-staging | Preview `dpl_9ixXoxPbsF22Dj7ew9fvkY7Kwz1M` | `fed93be98c3ed34a14a42e57a0dbadc54416b2ce` | không có khóa | host là `owpfqwdrmyzcmjahehek`, cập nhật trước lúc build |
| vibeacademy-staging | Production `dpl_54JzzSNdpV95gsCGxqWTYNXDj995` | `341f5b329abc15237b42ea5d6306a8f99d1b844b` | không có khóa | cùng host staging |
| vibeacademy | Preview `dpl_5PcoDs3qNWA1r3wLu5PcvU6RF7BP` | `fed93be98c3ed34a14a42e57a0dbadc54416b2ce` | không có khóa | `NEXT_PUBLIC_SUPABASE_URL` có mặt nhưng giá trị rỗng |
| vibeacademy | Production | `770b81855609cee8372e09fa7ff71bc2f0220849` | không có khóa | giá trị URL rỗng |

`341f5b3` có trong Git với thông điệp map mẫu đăng ký nhưng không bật gửi. File `lib/integrations/zalo/pilot-outbound.ts` không có trong commit đó. Preview staging của `fed93be` là bản có khóa cũ và biến pilot vắng, nên cổng cũ chặn vì mục tiêu là Preview. Production của dự án staging không có khóa đó. Không đổi biến trên Vercel.

Đề xuất để duyệt, chưa áp dụng: trên vibeacademy-staging, cả Preview và Production, đặt `ZALO_PILOT_OUTBOUND` đúng bằng `disabled` cho đến khi có cửa sổ gửi được duyệt. Không dùng giá trị nào khác. Không đặt `enabled` trong đợt này. Không dùng deployment production `770b818` làm đích rollback của pilot.

Ledger staging vẫn 150 dòng, lớn nhất `20260923052000`, thiếu 41 file local từ `20260922310000` đến `20260929220000`. Không `db push`. Học viên 5, payment 0. Mẫu Zalo đăng ký là `PENDING`, `enabled=false`, chưa có provider id. Các mẫu Zalo khác là `DRAFT` và tắt. Không gửi tin và không bấm nút.

### Bản sao public

Đã chép hai file từ `/private/tmp` sang `~/.vibe-private/staging-backups/public-20260929/`. Thư mục `0700`, file `0600`, không đưa vào Git. Nguồn là project `owpfqwdrmyzcmjahehek`, chỉ schema `public` và dữ liệu `public`.

| File | Byte | SHA-256 |
| --- | --- | --- |
| schema | 1352482 | `47b43537fe60bc28c5d23258eeeb38fb09387fe221481b9a5240c387549aae29` |
| data | 243403 | `fe7781ac70bf5a546e7f4f9d2988b6995c5e8cc25081395274068260e2ee35d9` |

Đây không phải bản sao toàn hệ thống. File không có schema Auth, không có dòng `auth.users`, không có Storage, không có `supabase_migrations`, và không có thân 20 hàm trigger trong `finance_private`, `hr_private`, `notification_private`, `payroll_disbursement_private`, `vibe_expense_private`, `vibe_operating_expense_private`.

Phát lại nguyên file schema trên database trống dừng vì thiếu `auth` và operator class `gist`. Database tách `vibe_staging_dump_restore_20260930` chỉ nạp được sau các bước ngoài file: `btree_gist` trong `pg_catalog`, bảng `auth.users(id uuid)` rỗng, ba hàm `auth.uid/role/email` trả null, sáu schema private rỗng, và 20 hàm trigger đi tiếp mà không giữ luật cấm sửa. Sau đó schema và dữ liệu nạp hết.

Kết quả database tách: 151 bảng public, 445 khóa ngoại, 0 khóa ngoại chưa validate, 183 policy, RLS bật trên 151 bảng, không có sổ migration, không có hàm đăng ký tại quầy của commit ứng viên. `anon` không được `SELECT` học viên hay payment. `authenticated` được `SELECT` học viên. Đếm dòng: 5 học viên, 0 payment, 0 hồ sơ đăng ký, khớp số đếm staging đã đọc. 445 khóa ngoại trong public không có dòng mồ côi trỏ tới bảng public. 13 khóa ngoại trỏ `auth.users` có 68 tham chiếu không tìm thấy cha, vì bản sao không có người dùng Auth. Quyền RLS với người dùng thật chưa chạy.

Để khôi phục pilot cần thêm bản Auth và Storage cùng thời điểm, thân hàm private đúng bản đang chạy, secret nằm ngoài SQL, rồi mới so ledger và áp từng migration còn thiếu trên bản sao đã diễn tập. Chưa có bản đó nên chưa khôi phục được staging.

### Nhật ký lỗi

Trước lượt này, lỗi server chủ yếu là `console.error` rời, không có mã tương quan, môi trường hay quy tắc bỏ secret. Chưa thêm dịch vụ giám sát mới. Vercel của cả ba dự án không có log drain. Speed Insights có mặt và `hasData` là false.

Đã thêm `lib/observability/pilot-failure.ts` và `onRequestError` trong `instrumentation.ts`. Một lỗi server ghi một dòng JSON: `failure`, `environment`, `timestamp`, `correlationId`. Không ghi header, query, thông điệp lỗi, secret hay tên học viên. Test tổng hợp với mã `corr-synthetic-001`, môi trường `preview`, thời điểm `2026-09-30T00:00:00.000Z` đạt. Mã tương quan lấy từ `digest` khi có. Bản Preview `fed93be` chưa chứa đường này, nên log deployment hiện tại chưa được xác nhận bằng một lỗi tổng hợp trên Vercel.

Chưa có người được chỉ định theo dõi lỗi pilot. Cách xem sau khi bản có logger được triển khai Preview: mở log runtime của đúng deployment, tìm `source=pilot-failure`. Việc chỉ định người trực vẫn là điều kiện trước pilot.

### hooks-preview-relay

Đây là lỗi cấu hình của một dự án Vercel khác, cùng repo GitHub `vibeacademyofmusic/Vibeacademy`, nhánh production `main`, thư mục gốc đặt là `hooks-preview-relay`. Thư mục đó không có trong repository. Deployment trên `fed93be` dừng với `NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST`. Creator của deployment lỗi là tài khoản `vibeacademyofmusic`. Dự án có biến `PREVIEW_WEBHOOK_UPSTREAM` ở Preview. Không có dependency trong mã academy này. Chưa đổi root directory và chưa đề xuất sửa cho đến khi chủ dự án xác nhận relay phải trỏ repo khác hay bỏ thư mục gốc.

### Cổng còn lại

1. Hồi quy GitHub của `fed93be`: đạt. Cây local siết khóa gửi: chưa có run mới.
2. Preview staging trỏ đúng project Supabase staging: đạt với biến URL hiện tại. Khóa gửi của SHA đã triển khai chưa phải bản fail-closed.
3. Production của dự án staging, SHA `341f5b3`: chưa có khóa gửi.
4. URL Supabase của dự án `vibeacademy`: rỗng. Không dùng làm pilot.
5. Migration staging: thiếu 41 file. Chưa áp.
6. Bản sao: chỉ public, đã diễn tập có điều kiện. Auth, Storage, hàm private và ledger còn thiếu.
7. Mẫu Zalo: chưa duyệt, chưa gửi, chưa phát lại webhook.
8. Đăng ký tại quầy trên staging: chưa chạy vì schema staging chưa có hàm của commit ứng viên và chưa có phiên đăng nhập.
9. Giám sát: chưa có người trực, logger mới chưa ở trên Preview.
10. Hai câu nghiệp vụ ở trên và `classes.course_id` vẫn chưa quyết định migration.

## Kiểm tra lại phiên và nâng cấp tách

Tab Cursor `glass-browser-0c515d31-d78a-4ddd-a153-8077cb69a1e1` được mở lại tại `http://localhost:3000/login` và để mở khóa để đăng nhập. Form Email/Password vẫn hiện. Chưa có cookie phiên. Chưa tạo bản ghi tổng hợp.

Server local PID 81249 không có `ZALO_PILOT_OUTBOUND`. Mã hiện tại chỉ mở cổng khi giá trị đúng là `enabled`, nên gửi ra ngoài đang bị chặn.

Bản phục hồi `vibe_staging_dump_restore_20260930` được giữ nguyên. Bản sao nâng cấp `vibe_staging_upgrade_20260930` dừng ở file đầu trong 41 file thiếu, `20260922310000_zalo_admin_read_v1.sql`: `registration_zalo_connection(uuid)` đã tồn tại. Trên bản phục hồi, hàm này có tham số tên `p_application`, md5 thân `8b7f3b87027d97f8adb92efd7b9f678f`, có nhánh `NONE`. File migration định nghĩa cùng kiểu đối số nhưng tên `p_registration`. Ba hàm `zalo_integration_overview`, `zalo_recent_events`, `zalo_linked_customers` chưa có trên bản phục hồi. Không thay hàm đang có. Bản nâng cấp dở được xóa.

Lần sau xác nhận kiểu trả về của hàm trên bản phục hồi trùng `20260923040000`: `link_status`, `external_link_key`, `linked_at`, `last_verified_at`, `masked_user_id`. Không chạy lại `CREATE` cũ. Chỉ tạo ba hàm đọc còn thiếu, rồi áp được 8 file kế tiếp trên bản sao. `20260926183000_staff_profile_badges_v1.sql` dừng với `VIBE_STAFF_PROFILE_PREREQUISITE_MISSING` vì `storage.buckets` không có. Học viên vẫn 5, payment vẫn 0. Bản sao đó đã xóa. Chưa ghi ledger và chưa áp lên staging.

## Tài khoản pilot — chưa tạo

Tab Cursor vẫn không có cookie tại `/login`. Chưa gửi lời mời và chưa tạo tài khoản trên staging hay production.

Vai trò có trong database local, không bịa thêm. `SUPER_ADMIN` với `branch_id` null đi qua `has_permission` khi mã quyền tồn tại và hồ sơ `ACTIVE`. `BRANCH_ADMIN` có các quyền registration, students.view, student_placement, attendance.manage, classes. `FINANCE` có các quyền finance và payroll đã gán. `TEACHER`, `STUDENT`, `PARENT`, `STAFF` chỉ có các quyền đã gán trong `role_permissions`. `ACADEMIC_ADMIN` chỉ xuất hiện ở trao đổi gia đình. `ACADEMIC_MANAGER` chỉ đọc bảo lưu và học bù trong migration chưa có trên staging. `ACCOUNTANT` và `BRANCH_MANAGER` không có dòng `role_permissions` và không có `has_role`. Không có luồng mời qua email. `local-bootstrap-admin` chỉ chạy local và không đổi mật khẩu cũ.
