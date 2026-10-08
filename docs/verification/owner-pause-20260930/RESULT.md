# Owner pause browser execution — 30 September 2026

Outcome: **PASS for the requested two-request pause approval journey**, not acceptance of the entire product or recovery. Implementation commit: `f63c294`, continued from `3a27456` (includes `3193b84`); no migration or deployment was run.

## Actual browser and persisted evidence

Owner remained signed in on `localhost:3000`, Chrome session **🧪 VIBE-LOCAL-TEST**. Initial REQUESTED empty state was correct: there were zero pause requests globally. The query filters status, orders created_at descending, and limits 50. There is no extra branch filter; existing RLS permits SUPER_ADMIN/ACADEMIC_MANAGER through academic_ops_may_manage. Main query errors render an alert, independently of the zero-row state. Query-failure and empty-state tests both pass.

Created two explicitly synthetic learners, valid academic programs and active enrollments with class level scope, teacher, room and timetable. Used the existing authenticated `request_enrollment_pause` RPC request-creation workflow; no request rows were inserted directly. This is API creation, not a claim that a request-creation browser form was tested. Both persisted requests appeared together under **Cần quyết định** ([snapshot](raw/requested-browser.txt), [image](raw/requested-browser.jpg)).

| Request | UI decision | Persisted actor | Persisted timestamp UTC |
| --- | --- | --- | --- |
| 66ff6ae9-e35a-4b5d-9b1e-a3dfe900e785 / APPROVE | APPROVED | 25073c07-90f9-415a-8862-8dbdadd9c8b0 / Local Developer Admin | 2026-09-30 08:41:18.226566 |
| 9c6a74f9-db6c-4abd-9815-ae1e3463d05d / REJECT | REJECTED | same Owner | 2026-09-30 08:41:37.418369 |

Clicked Duyệt and Từ chối in the Owner UI with labelled decision notes. Reloaded both final tabs: each contained its correct request, actor, timestamp and note; neither exposed decision buttons. REQUESTED then contained zero requests. Database checks separately confirmed exact persisted status/actor/time, one active pause for approval, and no change from retries ([decisions](raw/decisions.json), [verification](raw/verify.log)).

STAFF signed in normally using a temporary synthetic local identity on the separate 127.0.0.1 origin. Direct navigation to the approval page redirected to **Bạn không có quyền truy cập** ([browser evidence](raw/unauthorized-browser.txt)). STAFF API decisions failed for both choices; RLS exposed no requests. Owner's localhost session remained authenticated.

Repeated same approval is an existing idempotent RPC response (same pause ID), not another mutation. Repeated rejection and opposite decisions are rejected. All retries preserved original Owner decisions and added zero events. The server action now rejects stale or already decided submissions, and reports a concurrent idempotent response as already decided rather than new success. Authorization still precedes reads and mutations; RPC locking remains authoritative. Stale-form/race handling is verified by action tests, not a claim of clicking a cached browser form.

Rendered desktop evidence inspected: shared navigation, navy type, white cards, restrained gold active state and consistent spacing retained. No layout redesign or permission changes.

## Guards, regression and cleanup

The initial replacement dev-server process lacked the intended guard flags. Before creating or deciding fixtures it was restarted locally with the loopback network preload and ZALO_PILOT_OUTBOUND=disabled. Both settings are present on the Next parent process; Next overwrites the child process title ([guard ancestry](raw/runtime-guards.json)). No outbound messaging was invoked. No payment record or reception permission was changed. This evidence concerns local code, not the older deployed Preview.

- 20/20 action and outbound-guard regression tests pass ([log](raw/regression.log)); lint and TypeScript checks exit 0.
- Pause engine SQL: 10/10 pass. Security catalogue SQL: 16/16 pass ([security log](raw/security-regression.log)). An initially combined CLI invocation failed to parse later file paths; individual reruns supersede it. A guessed nonexistent academic security test ran zero checks and is not evidence of PASS.
- Supported cancellation ran first. Exact fixture IDs were then removed using the repository's local fixture cleanup pattern: exclusive pause-table lock, a single transaction, narrowly scoped removal of cancelled synthetic history, and deletion guard restored before commit. Removed only this run's two local Auth identities and business fixtures. Every public table's row count and sorted row digest exactly matched its pre-run baseline, including notification/finance data. Guard enabled afterward ([cleanup](raw/cleanup.json)). Final browser reload showed the synthetic rows gone and Owner still authenticated.

## Independent SQL / recovery status

The earlier per-file list has 21 passing and 21 remaining failing files; those historical passes were not all rerun here. Two failures were individually reproduced on local rollback-only fixtures with assertions unchanged:

- `student_ops_shell_test.sql`: 97/98 pass; check 42 fails because a genuinely full class remains offered. Migration 20260928190000 replaces list_placement_class_options and removes the earlier capacity predicate. The placement mutation still denies CLASS_FULL. This is a product list/mutation inconsistency, not a permission grant defect or missing timetable.
- `legacy_migration_review_test.sql`: 73/77 pass; check 54 fails with PLACEMENT_CLASS_DENIED, and 55–57 cascade. Import creates a learner with PAUSED status and attempts an ACTIVE enrollment; the enrollment guard requires ACTIVE learner status. This is an import/guard integration conflict, not grounds to grant rights or change the paused fixture to ACTIVE. Approved historical-import behavior needs reconciliation before a product fix.

The other 19 remaining failing files retain their exact entries in [the prior per-file diagnosis](../execution-20260930/raw/sql-fixture-rerun.txt): missing temporary refund/void helpers, invalid capacity/start/branch fixtures, duplicate program fixture setup, and remaining learning/finance assertions. This run does not classify all 21 as mere fixture defects and does not claim broader acceptance.

Read-only platform preflight on localhost passes: real Auth users/identities/sessions, Storage buckets/objects, migration ledger, platform auth.uid and no known placeholder private trigger bodies ([log](raw/local-upgrade-preflight.log)). This does not establish ledger completeness or certify recovery. The existing isolated Auth/Storage environments and [repeatable reconciliation procedure](../execution-20260930/UPGRADE.md) remain separate from a restore certification; manually skipping function creation is not an upgrade procedure.

Recovery remains incomplete: existing restored database has schema/default-privilege/vault errors; live sign-in against the restored database and Storage API restoration of object bytes are unverified. Storage metadata is not object bytes. A public-schema restore is not full recovery. Shared databases and deployed Preview were untouched.

Next user action: none is needed for this completed pause browser workflow. Remaining SQL and isolated recovery verification are engineering work; the available private database dump and privately copied Storage bytes have not yet been verified as a complete, functioning Auth/Storage recovery. No secret values should be pasted into chat.
