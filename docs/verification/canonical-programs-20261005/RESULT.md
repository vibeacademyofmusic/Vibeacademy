# Đối soát chương trình học local — 2026-10-05

Môi trường: ứng dụng `http://127.0.0.1:3000`, API Supabase local `http://127.0.0.1:54321`, database container `supabase_db_vibe-academy-system` cổng `54322`. Không đụng staging hay production.

Sao lưu: `/tmp/vibe-canonical-programs-20261005-214827/affected.dump` (quyền 600). Phạm vi: năm bảng khung chương trình, ghi danh học thuật, tiến độ, khóa học, đăng ký, xếp lớp và các bảng payOS/hóa đơn/thanh toán được đối soát.

## ID vận hành còn lại

| Chương trình | Mã | ID |
|---|---|---|
| Piano | PIANO | `d650ee06-2567-4694-a792-9d47722cf6af` |
| Guitar | GUITAR | `11ff51d3-6adf-4532-85c7-c58c279bafc3` |
| Violin | VIOLIN | `91b978e6-bad6-4384-bc6a-9aeec445d1bb` |
| Trống | DRUMS | `9c408855-ccd2-48fc-a4c7-19ad340f7623` |

Các ID này là cây TEST đã có học viên và tiến độ. Mã và tên hiển thị được đổi trong cùng một giao dịch.

## Hồ sơ lịch sử giữ lại

`ZC-CUR` / Guitar PayOS / `ab940000-0000-4000-8000-000000000020` chuyển sang INACTIVE. Đăng ký, xếp lớp, ghi danh và tiến độ của hồ sơ này không bị chuyển. Đơn payOS, webhook, hóa đơn và thanh toán không đổi: 10 đơn đăng ký, 8 webhook, 1 đơn học phí, 1 hóa đơn tổng 5.500.000, 10 thanh toán tổng 35.337.500.

Database còn 5 dòng `curriculums`, trong đó 4 dòng vận hành.

## Gộp và xóa

Đã chuyển 15 component bài học nháp sang môn còn trống của Piano và Violin, giữ nguyên ID bài học và trạng thái INACTIVE. Không gộp vào môn đã có bài học CORE và tiến độ học viên.

Đã xóa hai khung nháp không còn phụ thuộc: `7de89db6-e01c-4794-ae03-dbfc40713fd7` (PIANO) và `5131353d-2b02-402f-8029-9534f8e93440` (VIOLIN).

Piano giữ Pre Step → Pre → Grade 1–8. Pre Step vẫn INACTIVE.

Số bài học sau gộp: Piano 410 (360 đang hoạt động), Guitar 360, Violin 460 (360 đang hoạt động), Trống 360. Bài nháp chuyển sang vẫn INACTIVE. Ghi danh học thuật 27, không có cặp học viên–chương trình trùng, tiến độ bài học 600 không đổi. Chạy lại script cho `changes = 0`.

## Kiểm tra đã chạy

- Truy vấn `operational_curriculums` trả đúng bốn dòng ACTIVE. `curriculums` còn năm dòng vì ZC-CUR được giữ.
- Trang `/admin/programs` sau khi tải lại: bộ đếm 4, danh sách Guitar, Piano, Trống, Violin. Piano mở ra Pre Step (ngừng hoạt động) → Pre → Grade 1–8.
- Đăng ký tại quầy, thêm chương trình trên hồ sơ học viên và bộ lọc chờ vào ca dạy chỉ còn bốn lựa chọn với đúng ID trên. Hồ sơ chờ lớp `Guitar PayOS · Grade 1` vẫn hiển thị.
- Lộ trình học viên Piano `edce00bc-e945-401e-854b-7e2e4cf0e630` vẫn là Piano · Grade 1, các Lesson 01–10 còn nguyên.
- Khách chưa đăng nhập vào `/admin/programs` nhận 307 về `/login`.
- 30 test tập trung đều đạt. `tsc --noEmit` đạt. ESLint trên file đã sửa không có lỗi.
- `npm run build` dừng ở bước chuẩn bị vì cổng 3000 đang phục vụ ứng dụng. Không tắt server để build. Bản webpack production chưa chạy.
- Desktop và 390px: ảnh `desktop.png`, `mobile-390.png`. Ở 390px không tràn ngang.

Chưa kiểm tra bằng một tài khoản không phải quản trị đã đăng nhập, và chưa mở cổng phụ huynh `/my-learning` bằng phiên học viên.
