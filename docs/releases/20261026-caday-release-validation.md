# Kiểm tra ứng viên Ca dạy & Lịch học ngày 26/10/2026

Nguồn ứng dụng: `da212c1`. Đây là bản ghi kiểm chứng, chưa xác nhận production đã cập nhật.

- Required check `regression` trên nguồn `da212c1`: PASS, hai lượt GitHub.
- `CI=1 npm run build`: PASS, gồm khóa thiết kế, kiểm thử prebuild, TypeScript và 88 trang.
- Tám bộ kiểm thử release/runner/gate/lịch/roster/điểm danh: 57/57 PASS.
- Production vẫn ở `dpl_3EAKF2Ergmxiddq4pKfH4T9LyyjS`, ledger chưa có dashboard/time windows mới.
- Lần upload chưa gắn domain `dpl_DrYvQipAFD3W8MtoSwCMkeZybAHj` bị Vercel chặn: tác giả commit dùng địa chỉ máy Mac chưa được nhận diện có quyền triển khai.
- Commit ghi nhận này dùng danh tính Git đang cấu hình tại repository chính của chủ dự án; không sửa tác giả hoặc lịch sử commit ứng dụng cũ.
- Bản sao mã hóa ngày 24/10 đã sao chép vào thư mục LẬP TRÌNH trên Desktop theo yêu cầu người dùng, kiểm SHA-256 khớp. Đây là bản lưu trên cùng máy, không phải offsite.
- Chưa áp migration, chưa đổi domain. Phải hoàn tất bản sao mới và kiểm chứng schema/ứng dụng trước khi phát hành.
