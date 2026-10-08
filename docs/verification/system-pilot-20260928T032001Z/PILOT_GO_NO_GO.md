# NO-GO — chưa mở pilot vận hành

Môi trường đã kiểm: local http://localhost:3000, repo `/Users/macbookair/vibe-academy-system`, branch `feature/learning-report-v2`, commit nền `45822a4d9dd56317324f9c554df76b42f55c1199` kèm dirty changes; fingerprint chính xác nằm trong TEST_RUN_MANIFEST.json/gates.json. Supabase local 54321/54322. Không có chứng cứ nghiệm thu cloud.

## Coverage

105 ca: BLOCKED 76, FAIL 14, NOT_RUN 6, PASS 9. Các case BLOCKED có thể có bằng chứng thành phần, không tương đương PASS toàn ca. Bảng expected/actual/evidence đầy đủ ở SYSTEM_TEST_RESULTS.md.

Mức độ theo case (không phải số bug độc lập):

- P0: BLOCKED 30, FAIL 6, NOT_RUN 1, PASS 4
- P1: BLOCKED 45, FAIL 8, NOT_RUN 5, PASS 5
- P2: BLOCKED 1

## Kiểm tra đã chạy

Lint/typecheck/build PASS; Node 754/754 PASS, không skip. DB 98 tệp / 1.609 assertions đã thực thi, 46 tệp FAIL hoặc dừng trước hoàn tất; số assertion đã thực thi không phải tổng assertion yêu cầu. API học thuật 17/17, security 9/9, PDF 6/6 trong phạm vi synthetic local.

## Những điều kiện còn chặn

- Full DB regression FAIL, nhiều fixture thiếu academic/placement prerequisites; legacy import và student_ops assertions còn sai. Không được gắn PASS cho tiền, giờ dạy hay relation từ các suite chưa chạy hết.
- Cấu trúc học thuật thực tế khác mục tiêu; Piano Pre Step chưa ready. Không tự phê duyệt nội dung hoặc writeback.
- Phục hồi DB riêng đã có bằng chứng; độc lập Auth service, keys, storage binaries, scheduler và crash recovery chưa đủ.
- Chưa rehearsal 60 phút; số đo 2/5 actor chỉ là read-only baseline. Chưa đủ 10 integrated browser journeys, persisted finance/payroll-shadow/inventory reconciliation.
- Ma trận quyền toàn bề mặt, live provider template/receipt/HTTPS CTA và target scheduler chưa đủ.
- Chưa có UAT người thật hoặc owner signoff. Không được nâng nhóm thử vì kiểm thử tự động đạt một phần.

## Phạm vi hiện được dùng

Chỉ tiếp tục kiểm thử kỹ thuật local bằng tài khoản synthetic. Có thể xem lại fixture điểm danh, teacher draft, parent report/PDF/conversation để kiểm chứng các bản sửa. Chưa cho phép vận hành thật, thu/chi thật, chi lương, chuyển kho thực, gửi Zalo, bật E-learning writeback hoặc deploy production dựa trên đợt này. Không có module nào được tuyên bố GO toàn diện.

## Nhóm người được đề xuất

Owner ban đầu đồng ý 5 người; câu trả lời tiếp theo được hiểu là Cần Thơ 3 quản trị + 3 giáo viên, Sóc Trăng 1 admin + 2 giáo viên, tổng 9. Đây vẫn là diễn giải đang chờ chốt; chưa có tên/mã và chưa tạo/gán tài khoản thật. Hai chi nhánh thật không bị sửa bởi fixtures A/B/C.

Sau khi xử lý gate kỹ thuật, cần chốt danh sách/mã từng người, quyền đúng vai trò, một đợt đầu giới hạn theo kế hoạch đã duyệt, thời gian hỗ trợ và người ký nhận. Sự đồng ý số người không thay cho phê duyệt kết quả nghiệm thu.

## Trách nhiệm và mở lại gate

Codex/đội kỹ thuật: hoàn thiện fixture không bypass trigger, sửa lỗi còn lại, chạy lại toàn bộ gates và các ca chưa phủ; hoàn thiện crash/recovery, perf 60 phút, đối soát persisted và visual acceptance các trang còn lại.

Owner/phụ trách học thuật: chốt sai lệch cấu trúc và nội dung Pre Step theo policy thật; chốt người/chi nhánh/phạm vi UAT. Người thử thực hiện tác vụ bằng tài khoản riêng và ký nhận sau khi kỹ thuật đạt.

Dừng ngay nếu lộ dữ liệu, sai tiền/tồn/giờ, gửi sai người hoặc mất audit. Giữ bằng chứng, cô lập module có mục tiêu, không xóa queue hoặc reset MAIN. Cleanup mặc định dry-run ở CLEANUP_FIXTURE.sql chưa được thực thi.

**Production HOLD. Không có deployment hoặc thay đổi cloud trong đợt này.**
