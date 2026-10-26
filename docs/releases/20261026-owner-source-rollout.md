# Cần Thơ: cập nhật theo nguồn của chủ trường

Đầu vào hiện hành là file Excel có SHA-256 `0c21addfc5e5971a45c635ea2bfacb9b0d4188536f033e26a9e658382c5e5dcc`, đối chiếu qua ledger của nguồn nhập gốc có SHA-256 `8ad3a441cb601c7973ad3792e7eaddb29312e403c62b874a5bb8d514be186761`. Dùng cột F cho Level; P/Q là ngày học phí. Không dùng N hoặc ngày học phí thay ngày học thuật.

Người dùng đã duyệt ngày **27/10/2026** làm hiệu lực gán chương trình/Level và vận hành lịch/điểm danh cho hồ sơ Cần Thơ đang học, đã xác nhận danh tính, học thuật và ca đích. Đây không phải ngày nhập học lịch sử. Không thay lịch sử, kỳ phí hoặc khoản thanh toán; không tạo buổi vắng, điểm danh hoặc quyền bù trước mốc này. Nếu ngày vận hành đã qua khi bắt đầu ghi danh mới, công cụ dừng để chốt lại; không ghi lùi.

## Công cụ

`scripts/production-rollout.cjs` hỗ trợ `plan`, `verify`, `run`, `status`, `resume`, `rollback-plan`; không có command thì chỉ hiện help. Workbook, snapshot, manifest, bằng chứng lịch và nhật ký có thông tin học viên được giữ trong `.backups/`, quyền riêng tư, không đưa vào Git. Không đổi đích các script local thành production.

- `plan`: đọc workbook bằng helper Python, kiểm hash và liên tục nguồn nhập, đọc production và alias thật; mỗi dòng tách tham chiếu, kỳ phí vận hành, học thuật và lịch. Chỉ ánh xạ Grade rõ ràng sang Level ACTIVE cùng bộ môn. Nhãn PRE có suffix chưa đủ quy tắc thì giữ chờ.
- `verify`: yêu cầu container/database thử rõ ràng. Thử toàn bộ hiệu chỉnh, chạy lại, thử ghi danh rồi hoàn tác có điều kiện, cuối cùng ROLLBACK. Đọc lại xác nhận nguyên trạng và không có tác dụng phụ. Lưu hash của manifest và mã công cụ.
- `run`/`resume`: yêu cầu đúng nguồn, alias, mã đã kiểm thử và manifest. Khóa tiến trình, khóa giao dịch; nhóm đầu ba dòng tham chiếu, sau đó tối đa 20. So tiền trạng thái dưới khóa trước từng ghi, ghi hậu trạng thái và nhật ký trong cùng transaction. Đọc lại sau commit trước khi tiếp tục. Nếu mất kết nối, kiểm ledger trước khi thử lại. Không ghi đè chỉnh sửa tiếp theo của nhân viên.
- `status`: đọc lại dữ liệu và cả hai ledger, phân biệt tham chiếu và ghi danh vận hành; không dựa riêng vào file checkpoint.
- `rollback-plan`: chỉ lập phương án từ tiền/hậu trạng thái và ledger, không tự hoàn tác production. Hàm rollback ghi danh hiện hữu chỉ được dùng khi bản ghi còn nguyên và chưa có phụ thuộc.

Migration mới chỉ tạo nhật ký quản trị trong `maintenance_private`; hai bảng bật RLS và không cấp quyền cho anon/authenticated/service_role. Các thay đổi học viên đi qua guard hiện hữu; không tắt trigger, không tạo Super Admin hay đổi phạm vi chi nhánh.

## Phạm vi ghi đã chuẩn bị

Manifest ban đầu có 57 hiệu chỉnh tham chiếu, gồm 32 dòng đổi Level ID; không có cặp ngày tham chiếu hợp lệ nào còn khác nguồn. Việc đổi tham chiếu không tự kích hoạt lộ trình hoặc học phí. Một lộ trình học thuật đã có đúng Grade được tái sử dụng, giữ nguyên ngày bắt đầu và tiến độ.

Lịch PDF có SHA-256 `645b4762fa658e67ff19dd5ff35c27d698b7ffb265e93e6ba5a0aaaef71e06c4`. Tám dòng có bằng chứng danh tính chắc chắn được đối chiếu lại với database. Một dòng nay khớp duy nhất ca Violin thứ Tư 18:00–19:30, phòng thật 6 chỗ và phân công hiện hữu; ô nguồn có 5 người nên không cần chia thành viên sang phòng thứ hai. Dòng này đủ điều kiện chuẩn bị ghi danh từ 27/10. Ca Piano có ô nguồn vượt 6 vẫn chờ chốt thành viên; sáu dòng chưa có ca đích vẫn chờ. Không chọn nhóm hoặc giáo viên mới.

Các nhãn PRE STEP/PRE GRADE có suffix, hai dòng ngày sai, nguồn thiếu ngày/Level, hồ sơ nghỉ/bảo lưu, danh tính thay đổi hoặc dòng mới chưa có ledger tiếp tục được ghi rõ HOLD. HARP/ELECTRIC không đổi sang bộ môn khác. Không tạo kỳ phí/hóa đơn hoặc suy số tiền; nguồn hợp lệ không tự trở thành quyền học đã đối soát.

## Kiểm chứng

Kiểm thử ứng dụng và SQL trong PGlite bao gồm nguồn F, ngày lịch, PRE suffix, giới hạn cột ghi, preimage, retry, sửa tiếp sau nhập, tác dụng phụ thông báo, điều kiện ca/phòng/giáo viên, hồ sơ bảo lưu và chống nhập trùng. Clone từ bản sao production được dùng để diễn tập dữ liệu thật trong ROLLBACK. Nhật ký production và báo cáo riêng tư mới là bằng chứng phần đã áp dụng; tài liệu này không thay việc đọc lại trạng thái thật.

Không cần triển khai lại giao diện cho riêng công cụ quản trị và nhật ký này. Bản ứng dụng Ca dạy/Lịch học đã phục vụ `manage.vibe.edu.vn` từ `dpl_7D75S9YVCWpd2AQaD5KVEqtdmc59`; kiểm alias lại trước thao tác.
