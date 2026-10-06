# Mẫu PDF cho duyệt ZBS — 2026-10-06

Hostname đã kiểm tra, mở được không cần đăng nhập: `https://vibeacademy-staging.vercel.app`.
Đây là alias production của dự án staging, không phải ứng dụng production `vibeacademy-pink.vercel.app`. Quản trị vẫn chuyển về `/login`.

CTA động: `https://vibeacademy-staging.vercel.app/r/learning/<report_link_id>/pdf`
Link mẫu: `https://vibeacademy-staging.vercel.app/r/learning/1e5bd9c7e1135d6b6fc0b59844e7ce781d328f3c079aa42a14423f3d800dcd38/pdf`

GET ẩn danh trả PDF 14.518 byte, SHA-256 `010c47f53ac44b76e35ba9290b26f11bd78d50fab082d176dcd77f0fd6ba620f`, đọc được “Dữ liệu minh họa” và “Học viên Minh họa”. Token 64 hex khác trả 404, không trả file này.

Đây là tệp minh họa gắn sẵn trên host, không phải luồng phát hành từ database và không phải tin Zalo đã gửi. Deployment tiếp theo của alias này cần giữ route mẫu, nếu không link duyệt sẽ mất.
