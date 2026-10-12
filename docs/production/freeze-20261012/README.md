# Mốc đóng băng production ngày 12/10/2026

Bản đang chạy: `dpl_2rWYz4ktKaHEGkxhXQXhuwnAwfLW`, tên miền `manage.vibe.edu.vn`.

Đã tắt tự động gán bản triển khai mới vào tên miền production và chặn build mới khi `VERCEL_ENV=production`. Bản đang chạy tiếp tục phục vụ nhân viên, thanh toán và webhook Zalo. Không thay đổi dữ liệu học viên, khoản thu, quyền đăng nhập hoặc cấu hình tác vụ đang hoạt động.

`checkpoint.json` ghi mốc và kiểm chứng; `production-source.tar.gz` chứa mã nguồn kỹ thuật của bản đã chốt, không chứa thông tin đăng nhập hoặc tệp môi trường. `approved-design-manifest.json` giữ khóa thiết kế. `previous-project-settings.json` lưu cấu hình build/tự động gán tên miền trước đóng băng; `frozen-project-settings.json` là cấu hình đang khóa.

Chỉ mở khóa khi người dùng yêu cầu rõ ràng. Trước khi mở, đối chiếu tên miền vẫn trỏ đúng mốc và hoàn tất kiểm tra bản dự định phát hành. Khôi phục hai trường trong `previous-project-settings.json` bằng API cập nhật đúng project/team, kiểm tra lại, sau đó mới triển khai và promote bản được duyệt. Không dùng prebuilt, rollback hoặc promote bản cũ để đi vòng qua khóa.

Khóa này chặn build production mới và tự động thay thế tên miền. Chủ project vẫn có thể đổi cài đặt hoặc promote thủ công bằng quyền quản trị; quy tắc trong AGENTS.md và `.cursor/rules/production-freeze.mdc` yêu cầu mọi tác vụ tôn trọng mốc đóng băng. Không ghi nhận khóa này như một chế độ chỉ đọc cơ sở dữ liệu.
