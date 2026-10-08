# Đối soát — có phạm vi, chưa đạt toàn hệ thống

Run VIBE-PILOT-20260928T032001Z. Expected được lấy từ đặc tả fixture và phép tính độc lập, không lấy UI làm chuẩn.

| Phạm vi | Expected | DB | UI / PDF | Kết luận |
|---|---|---|---|---|
| TEST branch A | 165 load + S1/S2/S3/S5 = 169 | 169 học viên | Không duyệt đủ từng hồ sơ | Số lượng khớp |
| TEST branch B | 165 load + S4 = 166 | 166 học viên | Branch A bị chặn scope B | Số lượng và đối chứng scope khớp |
| TEST branch C | 165 load | 165 học viên | Chưa journey nghiệp vụ | Chỉ xác nhận số lượng |
| Tổng synthetic | 495 load + 5 scenario = 500 | 500 | Không coi là 500 người đồng thời | Khớp |
| S1 tháng 8 | 8 buổi: 6 hoàn thành, 1 hủy, 1 chờ | Đúng 8, trạng thái đúng | Báo cáo dùng 6 buổi đủ kỳ/điều kiện | Khớp trong mẫu |
| S1 tháng 9 | 8 buổi: 6 hoàn thành, 1 hủy, 1 chờ | Đúng 8, trạng thái đúng | Launcher 28/9 thấy 1 học viên chưa điểm danh | Khớp trong mẫu |
| Attendance mỗi tháng | 4 PRESENT + 1 LATE + 1 ABSENT | 6 records | 5 có mặt/đi muộn, 1 vắng | Khớp |
| Tỷ lệ tháng 8 | (4+1)/6 ×100, làm tròn 1 chữ số = 83,3% | Snapshot 83,3% | Portal và PDF 83,3% | Khớp |
| Report snapshot | 6 nhật ký S1, bản publish bất biến | 2 loại MONTHLY/END_OF_COURSE | Nội dung V2 portal/PDF đã sửa dùng chung whitelist trường công khai | Có regression, visual cuối |
| Parent P1 | Đúng S1 và S2 | Chính xác 2 IDs | Chọn con đúng hồ sơ | Khớp |
| Khung học thuật | 4 chương trình / 37 level / 184 subject / 2.640 lesson theo tài liệu | 4 / 37 / 188 / 1.440 | Không ép số bằng xóa/sinh nội dung | FAIL: +4 subject, thiếu 1.200 lesson so mục tiêu |
| Notifications trong mẫu | Không gửi thật | 4 jobs SKIPPED_NO_CHANNEL, attempts 0 | Không tuyên bố DELIVERED/READ | Khớp mock/no-send |
| Tuition / Finance | Đối soát từng dòng VND theo policy | Regression còn lỗi fixture | Chưa persisted E2E | BLOCKED |
| Payroll-shadow | Giờ/earnings/deductions/chi trả độc lập | Một số suite đạt; teacher_payroll bị chặn | Chưa đối soát cuối ngày | BLOCKED |
| Inventory | Opening + movements = closing, chuyển kho 2 vế | Suite ledger/serial đạt trong rollback | Chưa persisted UI và concurrency 2 phiên | BLOCKED |

Bằng chứng: `raw/reconciliation-counts.json`, `raw/academic-counts.json`, `mapping.json`, `api-evidence.json`, `security-api.json`, `pdf-evidence.json`, `raw/db-final.log`.

Cấu trúc hiện có được giữ nguyên. Piano Pre Step chưa sẵn sàng; không tự quyết định nội dung hoặc mapping để làm khớp tổng. Session fixture chưa điền room_id dù schedule có phòng: đây là thiếu sót của fixture, không gọi là lỗi sản phẩm khi giao diện hiện “Chưa xếp phòng”.

Các kiểm thử tài chính/kho trong transaction rollback không thay thế bảng đối soát persisted cuối ngày. Tổng tiền và số tồn mới cho toàn đợt chưa được dựng theo policy được chấp nhận, do đó không báo số 0 hoặc PASS giả.
