# Lịch điều hành tuần — 24/10/2026

Bản phát triển mở mặc định tab **Lịch tuần** trong **Ca dạy & Lịch học** (`/admin/students?tab=coordination`). Nền: `codex/caday-source-sync-20261024`, commit `7d95bdbe6e1f3fef49350c102a9387c4bc0f0fc0`. Nhánh này không xác nhận mã đang phục vụ production. Không áp dụng migration hoặc thay đổi dữ liệu staging/production trong công việc này. `vercel.json` tắt Git deployment tự động cho cả nhánh nguồn và nhánh dashboard.

## Hành vi

- Máy tính đủ rộng hiển thị bảy cột Thứ 2–Chủ nhật; ba hàng Sáng (trước 12:00), Chiều (12:00–17:59), Tối (từ 18:00), theo giờ Việt Nam và giờ bắt đầu buổi. Một buổi chỉ xuất hiện một lần.
- Chọn tuần/chi nhánh; lọc bộ môn, giáo viên, phòng; nút “Cần xử lý” hiện cạnh tổng. Thẻ ca ngắn hiển thị giờ, phòng, giáo viên, sĩ số/trạng thái; chi nhánh hiện trên thẻ khi xem nhiều chi nhánh. Bấm thẻ mở dialog bên phải với đầy đủ danh sách, cảnh báo, điểm danh và đường dẫn đổi lịch. Escape đóng dialog và trả focus về ca đã chọn.
- Mỗi ô tuần hiện tối đa hai ca và nút “+N ca · Xem tất cả” mở ngày tương ứng, không bỏ các ca còn lại khỏi tổng. Điện thoại/vùng nội dung hẹp hơn 850px tự chuyển sang danh sách từng ngày. Có nút chuyển Tuần/Ngày trên màn hình rộng. Không dùng bảng rộng bắt người dùng kéo ngang trên điện thoại.
- Tổng tuần là một hàng nhỏ, ghi rõ theo tuần và bộ lọc kể cả khi xem một ngày; bỏ thẻ thống kê lớn. Bộ lọc phụ và hướng dẫn chi tiết thu gọn. Lịch chỉ tải ở tab Lịch tuần, hàng chờ/danh sách ca/hôm nay giữ workspace riêng để không kéo dài mọi màn hình.
- Lịch định kỳ chưa tạo buổi ghi rõ **dự kiến**. Buổi đã tạo dùng phòng/giờ/trạng thái thực tế; đổi giờ sang tuần khác không làm lịch gốc xuất hiện lại. Buổi hủy vẫn hiển thị nhưng không cộng vào tổng.
- Bốn tổng tính toàn bộ ca trong tuần theo bộ lọc, gồm cả các ca sau nút “Xem tất cả”: buổi đã tạo chưa hủy, lịch dự kiến, học viên không trùng, lượt học theo danh sách. Số ghi danh không được trình bày như số học viên đã đến lớp. Điểm danh tách có mặt/đi muộn, vắng/có phép, chưa điểm danh.
- Giới hạn là giá trị nhỏ hơn giữa sức chứa ca và phòng khi cả hai đã biết. Không gán cứng 6 và không sửa cấu hình phòng; thiếu sức chứa phải hiện chưa biết. Cảnh báo thiếu phòng/giáo viên, vượt sức chứa, trùng học viên, chồng phòng trong tập lịch được phép xem, buổi qua giờ chưa điểm danh đủ.
- Dữ liệu có mốc thời gian; người dùng bấm **Làm mới** để tải lại. Đây không phải cập nhật trực tiếp. Lỗi RPC, dữ liệu sai cấu trúc hoặc sai phạm vi không được chuyển thành lịch trống/số 0. Số 0 hợp lệ vẫn có ghi chú khi ca chưa có danh sách trong hệ thống.

## Nguồn dữ liệu và quyền

Migration mới duy nhất: `supabase/migrations/20261024002601_coordination_week_dashboard_read.sql`.

RPC `public.coordination_week_dashboard(date, uuid)` là lớp gọi `security invoker`; hàm đọc `security definer` nằm trong schema riêng, `search_path` rỗng, có kiểm tra `auth.uid()`, `account_is_active()`, `student_ops_may_enter()`, quyền `student_placement.view` theo chi nhánh qua `registration_can()`, `can_access_class()` và `can_access_session()`. Chỉ cấp thực thi cho `authenticated`. Không tạo buổi, điểm danh, ghi danh, học phí, thông báo hoặc phòng.

Một câu truy vấn trả về snapshot gồm lịch, danh sách và metadata; không giới hạn ngầm 300 buổi. Lịch dự kiến xét ngày hiệu lực của lớp/lịch, ghi danh bắt đầu/kết thúc và bảo lưu theo ngày. Buổi đã tạo dùng `session_teaching_roster` và `session_actual_teachers` hiện có, gồm danh sách đặt học bù. Đối với buổi đổi giờ, ngày xét roster vẫn tuân theo `occurrence_date` của hàm roster chuẩn hiện hữu; dashboard không tự thay đổi quy tắc đó. Chỉ các buổi bắt đầu trong tuần được hiển thị; buổi bắt đầu tuần trước kéo dài qua đầu tuần không thuộc tập này.

Cảnh báo chồng phòng chỉ dựa trên lịch người dùng được phép xem; không thay thế ràng buộc database chống tranh chấp. Branch selector lấy các chi nhánh có lớp được phép xem, không khẳng định liệt kê toàn bộ chi nhánh tổ chức.

## Kiểm chứng local

- 38/38 kiểm thử tập trung: model, loader, truy vấn SQL mới và hồi quy điều phối/ca độc lập/lớp nhiều trình độ.
- 115/115 kiểm thử nghiệp vụ ứng dụng hiện hữu đã đạt ở bản dashboard ban đầu; lần điều chỉnh bố cục này chạy lại 38 kiểm thử liên quan, kiểm thử trình duyệt và build.
- Typecheck, lint các tệp TS/TSX thay đổi, `git diff --check` và production build được kiểm tra riêng trong đợt này.
- SQL chạy thực tế trong PGlite với bảng tối thiểu và các hàm roster/bảo lưu/giáo viên chuẩn lấy từ migration repository. Các guard quyền dùng test double được ghi rõ trong test: đây chưa phải kiểm thử RLS đầy đủ trên Supabase hoặc kiểm thử với tài khoản vận hành thật.
- Bao phủ: hiệu lực/bảo lưu/chi nhánh, đổi giờ sang tuần khác, buổi hủy, học bù theo booking, điểm danh và dạy thay, session bị từ chối quyền không trở lại thành lịch dự kiến, 302 buổi không bị cắt, anonymous/tài khoản không hoạt động không được đọc, quyền xem lớp/buổi đơn lẻ không thay thế quyền điều phối đúng chi nhánh, không phát sinh bản ghi.
- Bố cục mới kiểm tra bằng `scripts/check-calendar-layout.cjs` với dữ liệu tổng hợp `tests/fixtures/calendar-dashboard.ts`: desktop 1440×1000, laptop 1280×800 và điện thoại 390×844. Bảy ngày vừa chiều ngang bên cạnh sidebar mô phỏng; đầu bảng ở y=401px trong fixture desktop. Bao phủ mở/đóng roster, Escape và trả focus, xem toàn bộ ô đông lịch, bộ lọc môn/phòng/ca cần xử lý, chuyển ngày, dialog điện thoại, lỗi tải và lịch trống. Không lỗi runtime, không tràn ngang toàn trang. Đây là fixture có sidebar mô phỏng trên Chromium; chưa thay thế kiểm thử trang đăng nhập và Safari trên Mac.
- Script dùng Playwright có sẵn (hoặc `CALENDAR_PLAYWRIGHT_MODULE`), có thể chỉ định `CALENDAR_BROWSER_EXECUTABLE`/`CALENDAR_BROWSER_ARGS`. Route `app/calendar-layout-check` chỉ được tạo tạm lúc kiểm tra, tự dọn sau khi chạy; route không nằm trong commit hay build phát hành. Không dùng dữ liệu học viên thật.

Ảnh bố cục mới: [desktop](compact-desktop.png), [điện thoại](compact-mobile.png), [chi tiết ca](compact-detail.png). Ảnh là UI môi trường kiểm thử với dữ liệu minh họa, không phải bằng chứng localhost trên Mac hoặc production. Các ảnh `desktop.png`, `mobile.png`, `error.png` giữ làm lịch sử phiên bản đầu.

Lệnh kiểm tra chính:

```sh
node --test tests/coordination-calendar.test.mjs tests/coordination-calendar-db.test.mjs tests/coordination-calendar-loader.test.cjs tests/coordination-workspace.test.cjs tests/independent-shifts.test.mjs tests/mixed-level-class-ops.test.cjs
npm run test:business-lock
npm run typecheck
npx --no-install eslint app/admin/coordination/WeeklyBoard.tsx app/admin/coordination/WeeklyDashboard.tsx app/admin/coordination/calendar-model.ts app/admin/coordination/calendar-data.ts app/admin/coordination/Workspace.tsx
CI=1 npm run build
git diff --check
```

Job `calendar-contract` độc lập trong GitHub Actions chạy ba bộ test mới. Không bỏ qua hay đổi kết quả job `regression` hiện hữu.

## Trước khi phát hành

1. Giải quyết lỗi replay migration nền Zalo (`registration_zalo_connection(uuid)` đã tồn tại) trong một thay đổi được kiểm chứng. Lỗi này có trước dashboard; không sửa lịch sử migration để che lỗi hoặc đánh dấu SQL/race tests là đã chạy khi chưa chạy.
2. Đối chiếu schema đích và quyền thực tế. Chỉ áp dụng migration mới cùng dependency đã được xác minh; không đẩy cả thư mục migration đang lệch lịch sử. Kiểm tra quyền tài khoản quản trị chi nhánh, nhân viên và người không có quyền, rồi đối chiếu roster/counters với danh sách và điểm danh thật trên môi trường thử.
3. Kiểm tra toàn bộ trang với phiên đăng nhập hợp lệ và dữ liệu thật đã được phép sử dụng; kiểm tra đổi tuần/chi nhánh, học bù/đổi giờ/hủy, bảo lưu và refresh sau cập nhật. Kiểm thử ảnh local chưa thay thế bước này.
4. Xác định đúng mã nguồn và cấu hình production trước khi phát hành. Lưu bản phát hành có SHA, deploy ứng dụng sau khi RPC đã sẵn sàng, kiểm tra lại trang với tài khoản vận hành. Nếu quay lại giao diện cũ, có thể giữ RPC chỉ đọc không dùng; không có dữ liệu nghiệp vụ do dashboard tạo để xóa.

Không xác nhận danh tính, ghi danh học viên giữ chờ, hoặc kích hoạt điểm danh trong thay đổi dashboard.
