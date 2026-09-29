# Đánh giá sẵn sàng pilot — 29/09/2026

Ứng viên: `df989b1257e89779149b354d4c39540b4b31455f` trên `codex/release-candidate-lint`.
Pull request: https://github.com/vibeacademyofmusic/Vibeacademy/pull/3 (chưa merge).

## Quyết định

**NO-GO** cho pilot có kiểm soát, kể cả pilot giới hạn trên staging hoặc dữ liệu học viên thật.

Phạm vi đã chứng minh chỉ là kiểm thử tổng hợp trên database trống của GitHub Actions và bản sao local. Chưa có phiên đăng nhập, chưa có nâng cấp an toàn từ snapshot cũ, và đường gửi Zalo đăng ký chưa bị khóa cứng.

Pilot dùng dữ liệu thật và bài kiểm thử dữ liệu tổng hợp là hai việc khác nhau. Báo cáo này không cho phép bắt đầu pilot.

## Triển khai Vercel của PR này

Ba deployment do PR tạo đều là **Preview**, commit `df989b1`, không có bản ghi Production mới.

| Dự án | Môi trường GitHub | Kết quả | URL deployment |
|---|---|---|---|
| vibeacademy | Preview | thành công | `https://vibeacademy-ridi96bby-vibeacademyofmusic.vercel.app` |
| vibeacademy-staging | Preview | thành công | `https://vibeacademy-staging-fv88z2xye-vibeacademyofmusic.vercel.app` |
| hooks-preview-relay | Preview | thất bại | `https://hooks-preview-relay-572piz76b-vibeacademyofmusic.vercel.app` |

Ba URL preview yêu cầu đăng nhập SSO Vercel. Không đọc được biến môi trường hay mã dự án Supabase gắn với chúng. **Not verified** cho database của từng preview.

Môi trường Production mới nhất vẫn là 15/09/2026, SHA `770b81855609`, URL `https://vibeacademy-8ify44gfv-vibeacademyofmusic.vercel.app`. Alias công khai `https://vibeacademy-pink.vercel.app/login` vẫn trả trang đăng nhập của ứng dụng. Header không cho biết deployment id. Việc alias này còn trỏ đúng SHA 15/09 là **Not verified** ở mức tên miền, nhưng PR này không tạo deployment Production.

`hooks-preview-relay` không có trong repository này. Preview của nó thất bại. Lần Production của dự án đó ngày 25/09 cũng thất bại. Nó không phục vụ ứng dụng học viện. Một push mới, theo mẫu các commit gần đây, sẽ tạo thêm ba preview cho ba dự án trên. Mẫu đó không thay deployment Production ngày 15/09. Không promote, không rollback, không đổi cấu hình.

Mã Supabase production `qhznfywwrhmcwbkujclm` và staging `owpfqwdrmyzcmjahehek` là định danh đã ghi trong tài liệu và liên kết CLI local. Không đọc lại được từ env của deployment Vercel trong lượt này.

## Nâng cấp schema

Snapshot `vibe_pilot_restore_20260928_032001` có ledger tối đa `20260928190000`, 9 học viên và 2 payment. Đã sao chép sang `vibe_upgrade_gate` rồi áp các migration còn thiếu. Dừng ở `20260928200000_academic_family_communications.sql`: bảng `learning_conversations` đã tồn tại dù ledger chưa có phiên bản đó. Snapshot và sổ migration không khớp. Bản sao nâng cấp dở đã bị xóa. Snapshot gốc vẫn còn 9 học viên. Database `postgres` đang dùng không bị reset.

CI `regression` trên SHA này đã áp migration từ database trống và chạy bộ SQL business-lock. Đó là bằng chứng cài đặt mới, không phải bằng chứng nâng cấp dữ liệu cũ.

## Khóa SSH

Hai tệp chưa theo dõi nằm ở thư mục gốc, tên bắt đầu bằng `ssh-keygen`. Một tệp là khóa riêng OpenSSH, quyền `600`, 419 byte. Tệp kia là khóa công khai, quyền `644`, 107 byte. `git ls-files` không thấy chúng. Lịch sử Git không có tên tệp này và không có chuỗi `BEGIN OPENSSH PRIVATE KEY`.

Đã sao chép sang `~/.vibe-private/zalo-gateway-staging/` và xóa bản trong repository. `.gitignore` chặn đúng hai tên đó. Không xóa khóa ở nơi cất riêng, không thu hồi khóa trên máy chủ.

Không có bằng chứng lộ qua Git. Chưa cần xoay khóa chỉ vì repository. Cần xoay nếu khóa riêng đã bị copy ra ngoài máy này. Việc đó là **Not verified**.

## Module

| Module | Kết quả | Căn cứ |
|---|---|---|
| Đăng nhập và vai trò | NOT VERIFIED | Trình duyệt còn ở `/login`. Chưa thử hành động được phép và bị từ chối |
| Đăng ký tại quầy | PASS trên test, NOT VERIFIED trên UI | Business-lock và SQL đã khóa địa chỉ, số Zalo, trên 18 tuổi, không chọn môn, đồng ý không kế thừa |
| Hồ sơ học viên theo ID | NOT VERIFIED | Chưa mở lại hồ sơ sau khi đăng nhập |
| Chương trình → trình độ → môn → bài | PASS một phần | SQL hoàn tất đăng ký mở một đường chương trình. UI chưa kiểm |
| Khóa học trung gian | NOT VERIFIED | Màn `/admin/programs?view=courses` vẫn tạo khóa học. Cần quyết định của chủ sở hữu: giữ làm vỏ lớp hay bỏ |
| Ca dạy, lịch, điểm danh | NOT VERIFIED | Có route và migration. Chưa chạy workflow đã đăng nhập |
| Học phí, phiếu thu, công nợ | PASS một phần | SQL cọc, MoMo và PayOS trong business-lock. Chưa đối soát phiếu thu trên UI |
| Bảo lưu / học lại | NOT VERIFIED | Luật trong migration, chưa diễn tập. Chỗ chưa chốt ghi ở dưới |
| Báo cáo và xuất | NOT VERIFIED | Trang biến động học viên hết lỗi JSX trong `try/catch`. Chưa in khi đã đăng nhập |
| Zalo | FAIL cho điều kiện “tắt hẳn” | Nhắc học phí local là `DRAFT`, `enabled=false`, không có mã mẫu. Hành động gửi ghi `ERROR`. Đường điện thoại đăng ký vẫn gửi được khi quyết định là SEND và có credential. Mẫu đăng ký local đang `APPROVED` và `enabled=true` |
| Staging migration, backup, giám sát | NOT VERIFIED | Không đọc ledger staging, không diễn tập restore, không xem monitor |

## Luật đã thấy, không bịa thêm

Bảo lưu: khoảng ngày inclusive, trạng thái bản ghi là `ACTIVE` hoặc `CANCELLED`. Sắp tới, đang bảo lưu, đã hết được suy từ ngày, không lưu thêm trạng thái. Không thấy quy tắc đã duyệt nói bảo lưu có xóa học phí, điểm danh hay nợ. Không suy diễn.

Học bù: có mặt, vắng không phép và đi trễ không tạo suất. Vắng có phép tạo một suất. Buổi thường bị hủy có thể cấp một suất cho mỗi ghi danh đủ điều kiện. Vòng đời `AVAILABLE → RESERVED → USED`. Một nguồn chỉ cấp một suất cho một ghi danh. Không thấy quy tắc đã duyệt về việc học bù có đổi công nợ.

Tuổi “trên 18”: trong mã hiện tại, ngày sinh nhật thứ 18 chưa được tính là trên 18. Cần chủ sở hữu xác nhận nếu cách hiểu nghiệp vụ khác.

## Lint

`npx eslint .` trên cây hiện tại: exit 0, **0 lỗi, 73 cảnh báo**.

- 52 cảnh báo là chỉ thị `eslint-disable` không còn cần. Không đổi hành vi.
- 14 biến không dùng. Không mở quyền và không sửa số liệu.
- 7 thẻ `img`. Ảnh vẫn hiện. Không phải lỗi bảo mật đã chứng minh.

Không tắt rule để xóa cảnh báo. CI vẫn fail khi có lỗi ESLint.

## Việc chủ sở hữu cần làm

1. Đăng nhập local tại `http://localhost:3000/login` bằng tài khoản đã được cấp. Không gửi mật khẩu vào chat và không đặt lại mật khẩu. Sau đó báo lại để kiểm tra đăng ký, hồ sơ, phiếu thu và quyền bị từ chối.
2. Cho phép một câu `SELECT` chỉ đọc `template_key, status, enabled, provider_template_id is null` trên staging `owpfqwdrmyzcmjahehek` và production `qhznfywwrhmcwbkujclm`. Lượt đọc trước bị chặn với lý do không được truy vấn staging/production khi chưa có phê duyệt riêng.
3. Chốt khóa học trung gian, cách tính “trên 18”, và bảo lưu có đụng học phí hay không.
4. Trước pilot không gửi Zalo: tắt `notification_templates.enabled` của mẫu đăng ký trên đúng môi trường pilot và không bật scheduler. Chưa thực hiện thao tác đó trên database đang dùng.

## Quy trình pilot khi được duyệt sau này

Được làm chỉ sau khi các mục trên có bằng chứng: đăng ký quầy, hồ sơ học viên, xếp chương trình/trình độ, ca dạy, điểm danh, học phí và phiếu thu trên môi trường đã tách khỏi production. Zalo để tắt cho đến khi có mẫu đã duyệt và một lần thử có kiểm soát.

Dừng ngay nếu một phiếu thu gắn sai học viên, một vai trò thấp đọc được dữ liệu ngoài phạm vi, hoặc một job Zalo rời hệ thống. Rollback ứng dụng là deployment Production trước `df989b1` (hiện ghi nhận SHA `770b81855609`). Rollback database là restore bản sao lấy ngay trước khi áp migration. Commit này không có migration đi xuống. Chưa có bằng chứng restore staging.
