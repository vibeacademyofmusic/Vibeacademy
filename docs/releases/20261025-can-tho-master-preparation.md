# Cần Thơ: chuẩn bị đối chiếu bảng ngày học phí, chương trình và Level

## Phạm vi và nguồn đã xác minh

Đây là bước **chuẩn bị chỉ đọc** trên nền mã `acdd5c0060399cb33d627f2b99fda79cb65009b0`. Chủ trường chọn tiếp tục chuẩn bị theo tệp hướng dẫn ngoài Git, SHA-256 `2406dd8a9cd66dd280077815e1c9939f62d16beb285d0df263b507eb7da7e39b`; lựa chọn này không mở cổng ghi production. Chưa áp migration, ghi dữ liệu, triển khai ứng dụng hay kích hoạt điểm danh trên production. Bản mã nền đã có required check `regression` đạt trên GitHub; các thay đổi của bước chuẩn bị này phải được kiểm thử riêng trước khi coi là ứng viên phát hành mới.

- File nguồn mới nằm ngoài Git, SHA-256 `0c21addfc5e5971a45c635ea2bfacb9b0d4188536f033e26a9e658382c5e5dcc`, sheet `Students_Current_State`, header hàng 4, 111 dòng thật từ hàng 6 đến 116. Hàng 5 là ví dụ, không nhập.
- Cột F là Level mới; cột N chỉ để đối chiếu lịch sử. Cột P/Q là đầu/cuối kỳ học phí theo **ngày lịch**; Q vẫn là ngày có hiệu lực. Không dùng cột O làm ngày bắt đầu học thuật, không dùng P/Q làm ngày bắt đầu xếp ca.
- F có 98 giá trị và 13 ô trống. P/Q có 99 cặp ngày hợp lệ, 10 cặp trống, hàng 80 có hai ngày bằng nhau và Q86 là chuỗi ngày sai định dạng. Không tự sửa hai ngoại lệ này. Hàng 22 là quyền vô hạn đã xác nhận; không yêu cầu hoặc tạo ngày kết thúc giả.
- Dòng 60 loại khỏi đợt nhập/xếp mới; dòng 94 bảo lưu và giữ chờ xếp ca. Dòng 26 có Level/ngày mới nhưng batch cũ chưa có `target_student_id`; phần đối chiếu ID vẫn giữ chờ. Hàng 116 là dòng mới, không có trong batch cũ, nên không ghép theo tên hoặc số điện thoại.
- Batch tham chiếu production `b52d8476-7446-5130-abf8-04f0a67c992c` thuộc project `qhznfywwrhmcwbkujclm` có 111 dòng gồm ví dụ cũ; 107 dòng có `target_student_id` của 106 học viên. Trong số đó, 104 dòng có liên kết chương trình/Level, ba dòng HARP/ELECTRIC chưa ánh xạ. Production của nhóm này có 0 ghi danh lớp và 0 kỳ học phí vận hành.

Bản đọc ledger/danh mục và manifest theo từng dòng chỉ lưu tại thư mục riêng quyền `0700`, tệp `0600`, ngoài Git. File Excel gốc nằm trên Desktop ngoài Git và hiện có quyền `0644`; không coi file gốc đã được bảo vệ bằng quyền `0600`. Không commit tên, số điện thoại, mã hồ sơ, UUID học viên hoặc bản sao dữ liệu production.

Lần đối chiếu chỉ đọc trên snapshot production tạo manifest SHA-256 `5a09133766e76af249d87454ed5f48569d9e4c0eb979e52ea025a4dd573ed0f8`. Trong 111 dòng thật: liên kết giữa nguồn lịch sử và ledger `LEDGER_LINK_MATCHED=105`, `HOLD=5`, `EXCLUDED=1`; hai cột ngày học phí **tham chiếu** `MATCHED_COLUMNS_ONLY=94`, `HOLD=16`, `EXCLUDED=1`; Level **tham chiếu** `CANDIDATE_REFERENCE=54`, `HOLD=56`, `EXCLUDED=1`; xếp ca `HOLD=110`, `EXCLUDED=1`. Chưa kiểm tra hồ sơ đích còn tồn tại/đúng chi nhánh ở thời điểm ghi, cũng chưa đối chiếu ngày trong `normalized_payload`; vì vậy không gọi 105 liên kết là danh tính production đã xác minh hoặc 94 dòng là đã áp dụng đầy đủ. Mọi hành động học phí và học thuật **vận hành** đều `HOLD`. `CANDIDATE_REFERENCE` chỉ là đề xuất kỹ thuật, chưa được phép ghi production.

Năm dòng chưa đủ định danh là 26 (batch cũ giữ chờ), 39 (tên nguồn đổi), 77 (số điện thoại khác nguồn nhập gốc), 94 (batch cũ giữ chờ) và 116 (dòng mới chưa có ID). Riêng ngày tham chiếu còn giữ chờ ở dòng 80 (P=Q), 86 (Q sai định dạng), tám dòng thiếu cặp ngày và dòng 22 vô hạn; không lấy ngày từ cột khác để lấp. Dòng 60 bị loại như quyết định đã có.

## Cách phân loại hành động

`scripts/can-tho-master-plan.py` đối chiếu checksum file, định dạng cột, số hàng, mã batch/source row, nguồn lịch sử và catalog. Kết quả cho từng dòng được tách riêng:

Chạy `python3 scripts/can-tho-master-plan.py --help` để xem tham số. Khi tạo manifest thực tế, cung cấp file nguồn mới, file nhập gốc đã khóa checksum, hai snapshot production kèm SHA-256 và đường dẫn đầu ra **ngoài mọi Git checkout** trong thư mục quyền `0700`. Công cụ ghi tệp mới bằng quyền `0600`, từ chối ghi đè và không kết nối database. CI hiện chạy 10 kiểm thử dữ liệu giả về checksum, thay đổi cấu trúc Excel, công thức, ID danh mục, định danh, ngày, ánh xạ Level, trạng thái ledger, tính độc lập giữa các nhóm hành động và vị trí lưu riêng tư; lần chạy local đạt 10/10.

1. `tuition_date_action.reference`: chỉ đối chiếu hai cột ngày trong bảng **hồ sơ tham chiếu**; `MATCHED_COLUMNS_ONLY` chưa xác nhận JSON chuẩn hóa hoặc kỳ học phí vận hành.
2. `tuition_date_action.operational`: giữ `HOLD` cho đến khi xác minh đúng `tuition_period_id`, kỳ có hiệu lực và cơ chế cập nhật không phát sinh hóa đơn, thanh toán hay thông báo. Hiện 0 kỳ học phí vận hành cho nhóm này.
3. `academic_action.reference`: đối chiếu nhãn F nguyên văn với chương trình và Level đang ACTIVE. Nhãn PRE có hậu tố chưa có ánh xạ được duyệt vẫn `HOLD`; không lấy N bù. Chương trình VOCAL đã liên kết trước chỉ được tái sử dụng sau khi khớp catalog, không tự ánh xạ HARP/ELECTRIC.
4. `academic_action.operational`: giữ `HOLD` vì chưa có ngày bắt đầu học thuật đã duyệt và đường ghi hiện tại có thể tạo tiến độ học mới.
5. `schedule_action`: giữ `HOLD` vì chưa có ngày bắt đầu ghi danh vận hành, nhóm học viên X001–X122 còn cần xác nhận và chưa kiểm chứng khung giờ phòng ngừng sử dụng. Không dựng buổi/điểm danh lịch sử.

Tập `CANDIDATE_REFERENCE` vẫn bị cổng phát hành production chặn cho đến khi xác minh hồ sơ đích trực tiếp, có giao dịch ghi, nhật ký trước/sau, chống trùng, kiểm thử khôi phục và quyền tương ứng.

## Phòng, catalog và giới hạn đã đọc

CT01 đang có sáu phòng thật Piano 1/2, Guitar 1/2, Violin 1/2, đều ACTIVE và cấu hình sức chứa 6. Phòng số 1 của mỗi môn có 9 lịch lặp ACTIVE; phòng số 2 chưa có lịch ACTIVE trong lần đọc. Hệ thống chưa có bảng giờ phòng không sử dụng được, nên không suy mọi giờ còn trống. Sáu phòng mang nhãn kiểm thử không được dùng. Giữ thứ và giờ nguồn; ca song song cần phòng riêng, mã riêng, kiểm tra sức chứa kể cả ghi danh cũ và nhóm học viên được duyệt. Một giáo viên chính được phép phụ trách hai ca đồng thời; phân công thực tế hai phòng vẫn là quyết định vận hành.

Catalog production đang ACTIVE cho CELLO, DRUMS, GUITAR, PIANO, VIOLIN và VOCAL; không có HARP/ELECTRIC. Danh mục production không tự chứng minh mọi chương trình đều thuộc phạm vi đợt này. Không thêm chương trình, Level hoặc giáo trình từ một nhãn Excel chưa được duyệt.

## Cổng phát hành còn chặn

- Bảy migration ca dạy trong ứng viên `acdd5c0` chưa có trên production. Chỉ áp chọn lọc sau khi bản phát hành mới được kiểm thử trên bản phục hồi tương đương.
- Đọc lại alias Vercel ngày 25/10: `manage.vibe.edu.vn` vẫn trỏ deployment `dpl_3EAKF2Ergmxiddq4pKfH4T9LyyjS`; bản chuẩn bị này chưa triển khai. Liên kết Supabase của deployment dựa trên hồ sơ phát hành trước, cần kiểm tra lại môi trường đích trước một lần ghi thực tế.
- Bản sao ngày 24/10 kiểm tra đúng 16/16 tệp và checksum; diễn tập phục hồi toàn nền tảng mới đạt một phần. Các dump logic không cùng một snapshot nguyên tử; chưa có bản sao ngoài máy, globals/roles, cấu hình bí mật và dịch vụ Auth/Storage/Realtime được khôi phục tương đương. Chưa chứng minh rollback bảo toàn mọi giao dịch phát sinh. Trạng thái managed backup/PITR hiện tại cần đọc lại bằng quyền quản trị phù hợp.
- Chưa có `tuition_period_id`, ngày học thuật/ghi danh được duyệt, cách chia nhóm X001–X122 và khung giờ phòng không sử dụng. Các dòng thiếu căn cứ giữ chờ theo từng hành động; không chặn việc đối chiếu độc lập.
- Chưa có runner `run/resume` giao dịch đã kiểm thử cho lô cập nhật mới. Planner chỉ đọc không được dùng để tự động ghi production.

**Kết luận hiện tại: NO-GO cho ghi production.** Bước tiếp theo là kiểm thử planner bằng dữ liệu giả, chốt manifest riêng tư với snapshot đã xác minh, hoàn thành backup/restore và thiết kế giao dịch cập nhật có preimage/postimage, rồi mới quyết định tập dữ liệu có thể triển khai.
