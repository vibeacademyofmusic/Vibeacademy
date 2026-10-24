# Mốc đóng băng production ngày 12/10/2026

## Đã mở lại ngày 21/10/2026

Người dùng yêu cầu rõ ràng: “hãy mở khoá băng để tôi cập nhất hệ thống”. Đã khôi phục `buildCommand` và `autoAssignCustomDomains: true` của project `prj_NAIBJsctlaU316pQge3O63aAd9Fr`, team `team_y2GkHFTH08Wieo2XQ4QMRPRn`, theo `previous-project-settings.json`; API Vercel báo thành công. Công cụ trả về thông tin project rút gọn, không hiển thị lại hai trường cấu hình để đối chiếu độc lập.

Đã kiểm tra tên miền trước và sau khi mở: `manage.vibe.edu.vn` vẫn trỏ tới `dpl_2rWYz4ktKaHEGkxhXQXhuwnAwfLW`. Chưa triển khai bản mới. Cần kiểm tra bản dự định phát hành trước khi triển khai. Các đoạn bên dưới và `checkpoint.json` là hồ sơ lịch sử lúc đóng băng, không còn là lệnh chặn cập nhật.

## Hồ sơ lịch sử

Bản đang chạy: `dpl_2rWYz4ktKaHEGkxhXQXhuwnAwfLW`, tên miền `manage.vibe.edu.vn`.

Đã tắt tự động gán bản triển khai mới vào tên miền production và chặn build mới khi `VERCEL_ENV=production`. Bản đang chạy tiếp tục phục vụ nhân viên, thanh toán và webhook Zalo. Không thay đổi dữ liệu học viên, khoản thu, quyền đăng nhập hoặc cấu hình tác vụ đang hoạt động.

`checkpoint.json` ghi mốc và kiểm chứng. Tệp lưu nguồn `production-source.tar.gz` thuộc mốc local cũ và được loại khỏi nhánh phát hành mới để không đưa bản sao lên GitHub. `approved-design-manifest.json` giữ khóa thiết kế. `previous-project-settings.json` lưu cấu hình build/tự động gán tên miền trước đóng băng; `frozen-project-settings.json` là cấu hình lúc khóa.

Chỉ mở khóa khi người dùng yêu cầu rõ ràng. Trước khi mở, đối chiếu tên miền vẫn trỏ đúng mốc và hoàn tất kiểm tra bản dự định phát hành. Khôi phục hai trường trong `previous-project-settings.json` bằng API cập nhật đúng project/team, kiểm tra lại, sau đó mới triển khai và promote bản được duyệt. Không dùng prebuilt, rollback hoặc promote bản cũ để đi vòng qua khóa.

Khóa này chặn build production mới và tự động thay thế tên miền. Chủ project vẫn có thể đổi cài đặt hoặc promote thủ công bằng quyền quản trị; quy tắc trong AGENTS.md và `.cursor/rules/production-freeze.mdc` yêu cầu mọi tác vụ tôn trọng mốc đóng băng. Không ghi nhận khóa này như một chế độ chỉ đọc cơ sở dữ liệu.
