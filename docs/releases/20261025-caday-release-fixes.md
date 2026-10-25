# Sửa các lỗi phát hành Ca dạy, 25/10/2026

Bản sửa dựa trên `51993b32506bf93392ddac1f65eb6269613dd99d`.
Đây là sửa mã và kiểm thử, chưa phải biên bản triển khai production.

## Bổ sung 26/10: lưu điểm danh học bù từ ca khác

Trên `a65f3cf`, `saveAttendance` lọc ghi danh theo ca đích trước khi xét
danh sách học bù. Vì thế form gửi cả học viên của ca và học viên ca khác,
nhưng chỉ học viên của ca được lưu. Đường ghi hiện đọc RPC đã có phân quyền
`attendance_roster_read`, cùng nguồn danh sách buổi học với lịch tuần, rồi
upsert một lô theo `(session_occurrence_id, enrollment_id)`. Không cấp thêm
quyền và không gọi trực tiếp hàm nội bộ `session_teaching_roster`.

Danh sách lỗi, sai dạng, trùng ID hoặc form còn gửi học viên đã rời buổi thì
dừng trước khi ghi. Trạng thái không hợp lệ không bị âm thầm bỏ qua. Sau khi
lưu, làm mới cả lịch tuần, màn hình điều phối và sổ điểm danh. Bộ kiểm thử
`tests/attendance-save.test.cjs` chạy chính server action, RPC đọc roster và
trigger kiểm điểm danh bằng SQL trong PGlite; HTTP được thay bằng adapter,
quyền học bù và RLS toàn bộ được kiểm riêng trong bộ Supabase. Kiểm thử bao
gồm học viên khác ca, buổi chỉ có khách, đọc lại hai dòng đã lưu, lưu lại,
form cũ, hủy chỗ trước/lúc lưu, ngày học/bảo lưu, quyền truy cập, buổi đã
chốt/hủy và không xóa trạng thái học viên chưa chọn.

**Không sửa tám migration, manifest hoặc runner trong bổ sung này.** Clone
đã áp đúng bản `a65f3cf` và đạt ledger 273 có thể giữ lại để kiểm ứng dụng.
Hướng dẫn dựng clone mới ở phần dưới chỉ dành cho clone dùng file thứ tám
trước `a65f3cf`.

Theo biên bản người vận hành gửi ngày 26/10, Chrome sạch trên Mac không có
lỗi hydration; lệch `data-cursor-ref` chỉ xuất hiện do công cụ trình duyệt.
Đây là kết quả được người vận hành cung cấp, không phải lần bấm lại từ môi
trường sửa mã này. Việc chọn học viên ca khác trong giao diện tạo học bù
chưa được bổ sung ở bản sửa điểm danh này; ca thử đã đặt chỗ bằng RPC.

```sh
node --test tests/attendance-save.test.cjs
```

Kiểm chứng tại môi trường sửa mã: 11 kiểm thử đường lưu mới và 37 kiểm thử
tập trung tổng cộng đạt; build, typecheck, lint các tệp thay đổi và
`git diff --check` đạt. Bộ đường lưu đã tái hiện việc mã `a65f3cf` báo lưu
một học viên dù form gửi hai học viên. Chưa bấm lại ứng dụng trên máy Mac.

## Thay đổi đã thực hiện

- Runner dùng một kết nối, giữ advisory lock xuyên suốt đợt chạy. Mỗi file
  SQL và dòng ledger cùng một transaction. Bộ phân tích SQL chỉ bỏ cặp
  BEGIN/COMMIT ngoài cùng đã xác minh; không sửa nội dung function hoặc file
  migration nguồn. File, byte size và checksum được kiểm trước khi kết nối.
- Bỏ `--repair-ledger`. Có dấu hiệu schema nhưng thiếu ledger thì dừng;
  không chạy lại SQL, không coi tên một hàm là bằng chứng hoàn tất. Kiểm tra
  baseline 265 dòng, tiên quyết, thứ tự liên tục và checksum trước lần ghi đầu
  và trước mỗi file. Sau mất kết nối, chạy lại cùng bộ đã xác minh: transaction
  đã commit được bỏ qua; transaction chưa commit được áp lại.
- Cổng dừng ghi bao phủ chín bảng, có `public.rooms`. Khóa dòng gate được
  giữ tới khi giao dịch ghi kết thúc; gate mất thì từ chối ghi. Script tắt/bật
  guard khóa bảng theo cùng thứ tự và kiểm đủ chín trigger gate trước khi mở.
- Ngày/giờ của lịch tuần ghép từ các thành phần có tên, tránh khác định dạng
  ICU giữa server và browser làm lệch khóa ngày hoặc HTML hydration.
- Kiểm thử SQL lịch tuần đã dùng function roster mới nhất, có trường hợp
  học bù từ ca khác và trạng thái điểm danh của chính học viên đó.

## Kiểm chứng và cách chạy

```sh
node --test tests/caday-release-manifest.test.mjs tests/caday-release-runner.test.mjs tests/caday-write-gate.test.mjs tests/coordination-calendar.test.mjs tests/coordination-calendar-db.test.mjs tests/cross-class-makeup-roster.test.mjs tests/schedule-release-safety.test.cjs
node scripts/test-caday-browser.mjs
node scripts/test-caday-release-concurrency.mjs
```

46 kiểm thử tập trung đã đạt bằng SQL trong PGlite và kiểm thử ứng dụng.
Build, typecheck và lint phần thay đổi đạt. Kiểm thử browser dùng component
WeeklyBoard, React và CSS thực, dữ liệu học viên giả, adapter router/link;
đã kiểm hydration với định dạng locale khác, danh sách học bù, cập nhật điểm
danh từ snapshot mới, Escape/trả focus, màn hình 390px và trạng thái tải lỗi.
Ảnh desktop/mobile/chi tiết đã xem. Đây không phải E2E đăng nhập/đặt học bù
và ghi điểm danh qua Supabase của production.

CI chạy thêm script hai kết nối trên database mới, dùng Docker Supabase local:
runner đồng thời, mất kết nối trước COMMIT, sau COMMIT và chạy lại. Script chỉ
tạo/xóa database `caday_runner_test_<pid>` của riêng nó. Bằng chứng SQL thực
của toàn bộ migration vẫn nằm trong required check `regression`.

## Khi tiếp tục trên máy đang giữ bản phục hồi

Manifest vẫn có tám file, ledger dự kiến 265→273. File thứ tám thay đổi
checksum để bổ sung gate phòng. Không chạy chồng lên clone đã áp file thứ tám
bản cũ, không sửa checksum/ledger để ép qua. Tạo clone thử mới từ mốc trước
migration rồi dùng runner mới. Bản production được báo cáo chưa áp cả tám file.

Checkout `60ce447`, bản sao production và phiên đăng nhập của máy Mac không
có trong môi trường sửa này. Vì vậy không kết luận đã kiểm ứng dụng cũ trên
schema mới hoặc đã gỡ overlay cụ thể từng xuất hiện ở máy đó. Không sửa
metadata deployment để suy diễn ngược nguồn mã. Backup mới nhất quán và bản
sao ngoài máy vẫn là bước vận hành trước khi ghi production; không cần chúng
để hoàn tất các sửa mã nêu trên.
