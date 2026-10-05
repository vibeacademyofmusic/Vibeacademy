# Bằng chứng phục hồi local

Run VIBE-PILOT-20260928T032001Z. Production HOLD.

## Backup và phục hồi đã thực hiện

Snapshot mã nguồn trước sửa và custom PostgreSQL dump được giữ riêng trong `/private/tmp/vibe-pilot-20260928T032001Z`, thư mục 0700, tệp 0600. Dump có auth nên không đưa vào repository hoặc báo cáo công khai.

SHA-256 dump: `ed4432261bad47cb682deb45265be9047d0554f013b86cf437db4a463acd683b`.

Restore vào database `vibe_pilot_restore_20260928_032001` trong container local `supabase_db_vibe-academy-system`. MAIN không bị reset hoặc ghi đè. Đối chiếu toàn bộ 200 bảng thuộc public/auth/storage/supabase_migrations bằng số dòng và digest của các dòng đã sắp xếp: không có chênh lệch tại thời điểm baseline. Bằng chứng: `raw/restore-row-comparison.json`.

Bản restore sau đó được dùng để thử migration sửa lỗi; vì vậy đối chiếu baseline không đại diện cho trạng thái clone sau những thử nghiệm đó. Lần restore đầu bằng postgres gặp lỗi owner; lần phục hồi lại bằng supabase_admin thành công. Chủ database được chỉnh về postgres để khớp MAIN trước thử migration.

## Cài đặt mới

Database riêng `vibe_pilot_fresh_20260928_032001`: khởi tạo các schema nền tảng auth/storage/extensions/vault và extension cần thiết, sau đó chạy migration ứng dụng theo thứ tự. Không dùng nguyên public schema từ MAIN làm đường tắt. Business storage policies được loại khỏi bootstrap để ứng dụng tự tạo qua migration.

177 migration đã chạy thành công; chi tiết từng tệp trong `raw/fresh-migrations.json`. Sửa lỗi thay chữ ký hàm Zalo tại migration lịch sử; đã thêm các migration đồng bộ MAIN ở cuối chuỗi. Runner từng làm mất dòng ghi nhận thành công cuối khi tiếp tục; đã sửa runner và chạy xác minh lại migration bị thiếu dòng, lưu `raw/fresh-placement-reverify.log`.

## Giới hạn quan trọng

Đây là phục hồi database trong cùng máy/cụm PostgreSQL. Chưa chứng minh phục hồi độc lập máy mới, Auth service/JWT keys, storage object binaries, Vault root keys, provider credentials và scheduler. Không gọi REC-01 PASS đầy đủ. Chưa diễn tập mất mạng/DB giữa giao dịch, worker crash sau gửi hoặc rollback cấu hình cả hệ thống. Không dùng bằng chứng này để nghiệm thu cloud.
