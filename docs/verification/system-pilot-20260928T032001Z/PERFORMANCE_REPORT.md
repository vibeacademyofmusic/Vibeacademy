# Hiệu năng local — baseline có giới hạn

Máy Apple M2, arm64, 8 CPU, RAM 16 GiB. Node 24.20.0, Next 16.3.3 production build local tại cổng 3000; PostgreSQL 17.6 trong Docker local. Dataset: 500 hồ sơ/3 chi nhánh, lịch sử sâu chủ yếu S1. Build/typecheck/tests đã kết thúc trước khi đo.

305 samples: 5 lần chạm đầu + 30 mẫu/actor/concurrency, với 5 actor riêng. Đo HTTP HTML + scoped RPC roundtrip, không phải browser paint/Core Web Vitals. Nhóm 2 là từng batch tối đa 2; actor FIN ở batch cuối chỉ có 1. Nhóm 5 chạy đủ 5 actor. Chỉ đọc, không chứng minh tải ghi/concurrency tài chính.

Thời gian: 2026-09-28T04:54:59.790Z đến 2026-09-28T04:56:00.626Z. Source fingerprint không đổi: `325f80a585240c4a9895dcbc6f43832a1fcb46a9c4c772fc827b918c051caeb6`.

| Nhóm / actor | n | p50 ms | p95 ms | max ms | lỗi | payload max bytes |
|---|---:|---:|---:|---:|---:|---:|
| first-touch/1/ADMIN | 1 | 175 | 175 | 175 | 0 | 40087 |
| first-touch/1/BA | 1 | 83 | 83 | 83 | 0 | 27778 |
| first-touch/1/T1 | 1 | 82 | 82 | 82 | 0 | 10697 |
| first-touch/1/P1 | 1 | 932 | 932 | 932 | 0 | 7818 |
| first-touch/1/FIN | 1 | 31 | 31 | 31 | 0 | 22366 |
| warm/2/ADMIN | 30 | 30 | 34 | 40 | 0 | 40087 |
| warm/2/BA | 30 | 56 | 64 | 66 | 0 | 27778 |
| warm/2/T1 | 30 | 71 | 80 | 103 | 0 | 10697 |
| warm/2/P1 | 30 | 936 | 997 | 1020 | 0 | 7818 |
| warm/2/FIN | 30 | 29 | 44 | 44 | 0 | 22366 |
| warm/5/ADMIN | 30 | 49 | 58 | 60 | 0 | 40087 |
| warm/5/FIN | 30 | 48 | 58 | 60 | 0 | 22366 |
| warm/5/BA | 30 | 77 | 88 | 92 | 0 | 27778 |
| warm/5/T1 | 30 | 92 | 104 | 114 | 0 | 10697 |
| warm/5/P1 | 30 | 956 | 985 | 1009 | 0 | 7818 |

## Kết luận và phần chưa làm

0/305 lỗi trong phép đo này. Parent portal chậm hơn các đường khác (p95 khoảng 1 giây ở nhóm 5); chưa có query tracing để quy nguyên nhân. Không tự suy ra do Next hoặc CPU.

First-touch không phải cold cache được kiểm soát, mỗi actor chỉ 1 mẫu nên không dùng làm thống kê cold. Chưa đo query count, chưa profiling N+1/index/joins, chưa dùng dữ liệu giao dịch sâu trên toàn bộ 500 học viên, chưa chạy 10-user smoke.

**Rehearsal 60 phút: NOT_RUN.** Lần gọi script rehearsal đầu lỗi cú pháp, đã sửa và kiểm tra cú pháp; chưa chạy lại cả 60 phút. Baseline này mất khoảng 61 giây và không được tính là rehearsal. Full technical gate vẫn FAIL; chưa sẵn sàng đưa người thật vào vận hành. Không có tuyên bố ổn định nhiều ngày.

Bằng chứng: `baseline-performance.json`, `raw/baseline-samples.jsonl`, `raw/baseline-runner.txt`, `raw/baseline-final.log`, `raw/rehearsal.log`.
