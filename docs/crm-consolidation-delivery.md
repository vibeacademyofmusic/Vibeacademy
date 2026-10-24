# CRM → main consolidation delivery — 2026-09-28

**A. STATUS: PARTIAL.** Local integration is running; external provider UAT and the full regression gate are not PASS.

**B. AUTHORITATIVE REPO:** `/Users/macbookair/vibe-academy-system`, branch `feature/learning-report-v2`, HEAD `45822a4d9dd56317324f9c554df76b42f55c1199` plus uncommitted integration. No commit/push performed; unrelated dirty work preserved.

**C. LOCAL PORT:** http://localhost:3000/admin/business/registrations. Main `npm run dev` left running, listener PID 7784 at handoff. Verified working directory. `npm run preview` was also verified at 3000, then stopped before dev restarted.

**D. LOCAL DB:** main Supabase API 54321, PostgreSQL 54322, Studio 54323. Main local `admin@vibe.local` SUPER_ADMIN session verified in browser. No credential changes in this task.

**E. FEATURES MOVED:** counter/academic registration; explicit subject selection; student code sequence; CRM interest and consolidated routing; quote/discount/payment-option snapshots; MoMo signed IPN; payOS signed checkout/webhook/status reconciliation; authoritative payment posting/allocation; explicit Zalo consent; outbox; durable credential rotation and send attempts; ambiguous-result/replay protection; registration history and admin recovery UI.

**F. FILES:** exact edited/new inventory in [crm-consolidation-inventory.md](crm-consolidation-inventory.md). Baseline snapshots include both HEADs/status/diffs and file hashes. Main 22 existing files edited, 47 added before this delivery report; ignored env names also added.

**G. CONFLICTS:** main navigation/lifecycle/permissions/finance/Z1 security won. No preview auto-consent, pilot/demo rows, placement override or old finance collections UI. New academic registration must pass payment gate; old no-invoice manual contract preserved. Explicit anonymous grants removed for new RPC/trigger helpers; current anonymous SECURITY DEFINER execution count is zero.

**H. MIGRATIONS:** five forward main migrations `20260928010000` through `20260928050000`, all applied to main local only. Each includes rollback guidance. No reset or fake source ledger entries.

**I. DRIFT:** source `20260925090000` absent from its ledger while consent schema/9 rows exist. Exact DDL frozen and compared. Historical origin cannot be established from catalog/ledger alone. Reference untouched; main reconciled forward, without its rows.

**J. PAYMENT:** signed provider/receipt/allocation/idempotency tests pass. Browser quote succeeds and both missing-config guards display correctly. Actual payOS/MoMo sandbox checkout/payment/webhook remains BLOCKED: main provider credentials, service role and public callback origin are empty. No new provider orders or payments. Existing payment count remains 1.

**K. ZALO:** durable/mock/DB tests pass, explicit consent required, unknown acceptance cannot resend. Browser shows connection/history/recovery and retained main audit/template panels. Actual provider send/refresh/delivery not performed. Credentials missing and registration template remains disabled; no claim of a real successful send. Existing 6 notification jobs retained, webhook events 0, new phone consents/attempts 0.

**L. REGISTRATION:** browser created `DK-20260928-B642E9B0892C` (`c5fbae4f-d710-4cb2-97c9-b642e9b0892c`), named `CONSOLIDATION TEST 20260928`, via main UI. DRAFT → SUBMITTED → VERIFIED, selected Guitar — Test / Grade 5 / Technique Foundation 5, quoted VND 5,500,000 with VND 2,750,000 due. No student/parent/enrollment/payment was created for it. It remains VERIFIED for owner inspection, with one quote and three status events; no consent. Complete paid registration was exercised in rollback DB tests, not claimed as live browser payment acceptance.

**M. CRM:** single sidebar destination, three workspace tabs, legacy redirect preserves repeated query params and lifecycle tabs, filter submit preserves workspace. Main source/interest filters and permission logic retained. No CRM preview leads imported (main count remains 0).

**N. MAIN REGRESSION:** browser opened Student Operations, Programs/Academic, HR, Learning Reports and Finance payments successfully. Main Academic/HR/Student/Finance source files were not overwritten. 252 registration/Student Operations/provider DB assertions passed after the compatibility repair. Broader failures described below prevent a global PASS.

**O. TESTS:**
- Focused application run: 93/93 passed; later redirect/strict OA checks: 22/22 passed; durable DB-backed Node tests: 2/2 passed.
- Broader application regression: 140/141 passed. `tests/programs-workspace.test.cjs` fails in its test loader on `./business/workspaces`; reproduced using the pre-consolidation navigation backup. Not caused by the CRM target change.
- Payment/Zalo pgTAP batch: 121/121 passed before adding two final assertions, which pass in the final full run. Legacy registration/Student Operations/provider batch: 252/252 passed. Security regression: 59/59 passed after grant correction.
- Final full DB: 94 files, 1,589 executed assertions, FAIL. 41 files abort on `CLASS_SCOPE_UNCONFIGURED`; legacy migration test produces 31 failed assertions and aborts its rollback due to the same fixture setup failure. Its additional error is `Source batch requires correction, not rollback`. Scope guard body is byte-equivalent after whitespace normalization to the pre-consolidation schema; these fixtures lack existing main mixed-level scope setup. No attempt to disable the guard or reset DB.
- TypeScript: PASS. `npm run build`: PASS, verified-build marker recorded.
- Lint changed application/integration scope: 0 errors; 3 unused-parameter/variable warnings (two present in main baseline, one in imported widget callback helper).
- Evidence logs: `/tmp/vibe-consolidation-20260928/{final-focused,regression-node,programs-baseline,durable-node-db,batch23-db,compat-db,grants-db,full-db-final,final-ts,lint-final,build}.log`.

**P. BROWSER 3000:** local UI smoke/UAT PASS for pages, subject selection, draft/submit/verify/quote, missing-provider guards, CRM filters, main module navigation and Zalo history. Rendered screenshots inspected at desktop and 390×844: VIBE navy/gold/white cards retained; corrected mobile horizontal clipping. Full Registration + Payment + Zalo external UAT remains BLOCKED, so overall browser acceptance is PARTIAL. Login HTTP 200; authenticated page visibly loaded after final dev restart.

**Q. 3010 REQUIRED:** NO. Nothing listens there. All daily UI is 3000.

**R. CRM REFERENCE:** preserved, documented ARCHIVE / READ-ONLY REFERENCE. Hash comparison: 0 changed and 0 added files. Source database not migrated or reset. Do not remove it before owner approval.

**S. PRODUCTION:** NOT TOUCHED.

**T. STAGING:** NOT TOUCHED.

## Remaining gates

Owner must configure sandbox/dev values in main `.env.local` (not in chat), approve the intended template activation and provide a sandbox recipient/public callback route before live provider UAT. Full legacy DB fixtures and the pre-existing Programs test loader need separate regression cleanup. No PASS until these gates and a complete paid Registration + Payment + Zalo workflow are verified on 3000.

Daily policy is recorded in [local-development-workflow.md](local-development-workflow.md). Use main only: `npm run dev`; or stop dev, `npm run build`, `npm run preview`. Both use port 3000 and must not compete.
