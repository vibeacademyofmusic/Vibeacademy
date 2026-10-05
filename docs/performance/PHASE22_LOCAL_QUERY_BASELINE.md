# Phase 22 — initial local query measurements

2026-09-17. **PARTIAL performance pass; no production-scale claim.**

Measured on existing small synthetic localhost data using PostgreSQL
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` under `authenticated` with the
synthetic global-admin JWT subject. Fixture profile/role activation happened
inside a transaction that ended with ROLLBACK; no persistent account activation
or credentials, and no staging/production query. Three successive samples
include initial and warm planning/cache behavior, not an estimated p95.

| Query | Rows | Execution ms (three samples) | Planning ms (three samples) |
|---|---:|---|---|
| learning_version_analytics | 1 | 21.328, 4.319, 3.168 | 0.013, 0.004, 0.004 |
| branch_finance_summary | 3 | 20.247, 13.093, 13.263 | 26.743, 3.22, 2.188 |
| attendance_day_bounded | 1 | 2.043, 1.752, 2.348 | 5.1, 0.502, 0.507 |

All three reported zero shared physical-read blocks. The analytics result is one
aggregate JSON row for the existing synthetic version; Finance returned three
branch/currency rows; Attendance returned one session for 2026-08-17 with the
actual-teacher projection and 200-row limit. These are populated but very small
fixtures. Finance selected representative dashboard fields with stable branch/
currency ordering; this does not measure all five dashboard requests together.

No optimization or new index was introduced from these measurements. Current
values do not establish a bottleneck; adding speculative indexes would not meet
the measure-first requirement. Analytics indexes were part of its implementation,
not an asserted measured before/after speedup.

Remaining: route end-to-end latency including Supabase/network, realistic volume,
concurrency, slow-query plans, all listed master-plan modules, and authorization
helper cost under branch/teacher/family roles. Repeat on representative staging
data after recovery and migration prerequisites; do not manufacture a production
SLA from local test results. Phase 22 is not complete.
