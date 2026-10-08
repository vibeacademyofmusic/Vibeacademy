# Phạm vi nghiệm thu VIBE — đợt local đang thực thi

Run: VIBE-PILOT-20260928T032001Z. Nguồn yêu cầu: acceptance-source.md (105 ca). Chỉ local MAIN ở cổng 3000 và Supabase 54321/54322. Không deploy, không reset MAIN, không gửi khách thật hoặc chi trả thật.

## Bề mặt đã kiểm kê

104 page routes; 60 tệp server action; 8 API routes; 198 tên RPC được tham chiếu; danh sách chi tiết trong inventory.json.

Catalogue thực tế: 515 hàm nghiệp vụ, 172 bảng trong các schema nghiệp vụ được quét, 192 policy RLS. Catalogue còn ghi grants, owner, search_path và hash định nghĩa. Bao gồm các đường dẫn không xuất hiện trong menu.

## Phân quyền kỳ vọng

SUPER_ADMIN: giao diện quản trị đầy đủ, vẫn chịu các ràng buộc nghiệp vụ/checker độc lập.
BRANCH_ADMIN: đọc/CRM/xếp lớp trong phạm vi chi nhánh; chỉ xem sổ điểm danh, không mở ghi điểm danh qua cổng quản trị legacy.
ACADEMIC_ADMIN: nghiệp vụ học thuật theo quyền hiện hành; không suy ra quyền vào mọi trang admin.
TEACHER: không gian giáo viên, đúng actual/substitute assignment và ngày/quan hệ học viên.
FINANCE: workspace /finance và quyền maker/checker thực tế; không tự suy ra quyền truy cập shell SUPER_ADMIN.
PARENT: hồ sơ con đang có liên kết hợp lệ; STUDENT: hồ sơ của chính mình.

Ma trận đầy đủ role × branch × relationship × action chưa được phép gắn PASS chỉ từ đăng nhập hoặc menu. Các giới hạn đó sẽ xuất hiện trong bảng kết quả từng ca.

## Dữ liệu thử

500 học viên tổng hợp; ba chi nhánh TEST Pilot A/B/C; 7 vai trò kỹ thuật và các đối chứng không được phân công/khác chi nhánh. IDs trong mapping.json. Mật khẩu chỉ ở thư mục riêng ngoài repository.

S1 chạy luồng học thuật, điểm danh, nhật ký, báo cáo MONTHLY/END_OF_COURSE và phản hồi. P1 liên kết S1 và S2. S4 thuộc nhánh B. Lịch sử giả lập tháng 8/9, dạy thay, vắng, đi muộn, hủy buổi. Dataset hiện chưa có lịch sử dày cho toàn bộ 500 học viên; không đánh đồng số hồ sơ với số người truy cập.

Piano Pre Step của S2 chưa sẵn sàng học thuật: chỉ là hồ sơ phụ huynh nhiều con, không kích hoạt học vụ cho chương trình đó. Không tự biên soạn đủ 200 lesson để lấy PASS.

## Quyết định và điều kiện ngoài tự động hóa

Owner đã đồng ý nhóm người thật, sau đó nêu Cần Thơ/Sóc Trăng. Phân bổ mới đang chờ xác nhận vì tổng theo diễn giải hiện tại là 9 thay cho 5. Không tạo tài khoản hay gán quyền cho người thật từ suy đoán.

Tài liệu Music Theory trong repo ghi OWNER_APPROVED D01–D14, nhưng chỉ riêng nhãn đó không chứng minh nghiệm thu nội dung/Grade 1/shadow writeback đã hoàn tất. Không bật học trực tuyến hoặc academic writeback trong đợt này.

Zalo/payOS: dùng local/mô phỏng; không có recipient live được chỉ định. Nhân sự UAT, ký duyệt owner và thử provider live được tách khỏi kiểm thử kỹ thuật.

## Tiêu chí kết luận

Mọi FAIL ở gate bắt buộc và ca critical chưa chạy vẫn giữ nguyên. Local technical acceptance, internal rehearsal, targeted pilot và owner GO là các quyết định riêng. Production HOLD.
