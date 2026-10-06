# Kiểm tra giao diện đã render

Môi trường: cùng local http://localhost:3000, Next production build đã xác minh, trình duyệt trong ứng dụng Codex. Không dùng kết quả compile thay cho kiểm tra trực quan.

| Bề mặt | Thao tác / kết quả | Kiểm tra thiết kế | Bằng chứng |
|---|---|---|---|
| Branch attendance | Launcher → session trực tiếp; trước sửa redirect login, sau sửa lần đầu roster rỗng; sửa read boundary → 1 học viên đúng scope, trạng thái/note/save disabled | Desktop 1440px, thẻ trắng, navy, notice vàng nhẹ, các nút theo tokens chung | branch-roster-desktop.png |
| Branch attendance mobile | 390px, bảng chuyển thành thẻ; document scrollWidth = innerWidth = 390 | Nhãn/trạng thái không tràn ngang; không che nội dung | branch-roster-mobile.png |
| Teacher workspace | T1 thấy session hiện tại; trạng thái chưa điểm danh khóa progress; lưu bản nháp nội dung và context Tác phẩm rồi reload còn đúng | Thẻ/nút/navy dùng giao diện VIBE đã có | teacher-workspace.png, teacher-draft-reloaded.png |
| QR attendance | Start tại TEST branch A, stop, chuyển TEST branch B; không còn image QR, nút mở trở lại; không quét/ghi công nhân viên thật | Thẻ, đường viền, khoảng cách, màu trạng thái phù hợp mẫu HR | qr-stopped.png |
| Parent report | P1 chọn đúng S1 trong hai con; hai report tháng 8; trước sửa có PDF summary nhưng portal báo trống; sau sửa hiển thị achievement/difficulty/next plan đã publish | Dùng vibe-admin/vibe-page/vibe-card/vibe-actions/vibe-button; tách nút PDF/hỏi đáp, bỏ liên kết dính liền | parent-report-before.png, parent-report-final.png |
| Parent report mobile | 390px; scrollWidth = innerWidth = 390; nút/card xuống dòng | Không thấy tràn ngang; đã trả viewport về mặc định | parent-report-mobile.png |
| PDF monthly và cuối khóa | 6 HTTP checks: P1/S1 200 PDF, P2 404; cache private,no-store; kiểm tra đủ 2 trang mỗi file sau render | Font Việt rõ, nhãn trạng thái tiếng Việt, nội dung nhận xét/83,3% đúng mẫu; không thấy cắt chữ/chồng chữ; footer sát phần cuối trang 1 nhưng không chồng | monthly.pdf, end_of_course.pdf, pdf-evidence.json |

Đối chiếu thiết kế dựa trên các token/component dùng chung đang áp dụng cho Công tác phí. Không có tái thiết kế ngoài phần bị tác động. Việc duyệt trên đây chỉ bao phủ các màn đã ghi; các trang employees/leave/scan và các route còn lại chưa được coi là visual acceptance đầy đủ. Chưa có UAT thiết bị thật của người dùng.

Một số ảnh điểm danh/QR/teacher được chụp trước sửa portal báo cáo cuối; các tệp UI tương ứng không đổi từ lúc chụp. Parent report và PDF được kiểm tra lại trên bản cuối. Manifest lưu fingerprint gate và baseline; không coi hình của bản trước là bằng chứng cho thay đổi report mới.
