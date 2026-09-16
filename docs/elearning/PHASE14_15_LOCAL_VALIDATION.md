# Phase 14–15 — source model and assessment foundation checkpoint

2026-09-16. Supported local scope verified; **full Phases 14–15 remain PARTIAL**
until the remaining notation integration, canonical Theory authoring
and the content gates are complete. Do not label this as full Grade 1 readiness.
Production HOLD. No staging/production mutation, push or deploy.

## Implemented

- Exact approved Contents metadata, 87 modules with document SHA-256 provenance.
  Grade counts 22/16/17/17/15; MT5.15 explicitly SOURCE_MISSING. No textbook body
  copied or invented; no synthetic approval stands in for pedagogy approval.
- Immutable policy per published learning version: configurable pass threshold,
  independent author/reviewer, practice unlimited, Final three attempts and
  24-hour cooldown after failure; final identity confirmation required.
- Protected keys/rubrics; randomized delivered question/options snapshot without
  keys. Exactly one active attempt per policy/student, idempotent requests and
  submissions, immutable completed evidence. Direct client DML denied.
- Canonical SQL grading for single/multiple choice and true/false. Remaining
  declared types require HYBRID/MANUAL review; no image grading or fabricated score.
  No competing client grading engine. Manual UI accepts text and structured music
  responses; the supported notation editor is recorded in PHASE16_LOCAL_VALIDATION.md.
- Weighted manual review retains auto points, validates manual ranges and requires
  reason. Monday-Friday Vietnam two-working-day target displayed, overdue visible.
  Holiday calendar is not configured and this limitation is visible in UI.
- SUPER_ADMIN reopening with reason/expiry/extra-attempt evidence. Scope remains
  restricted to SUPER_ADMIN; delegated Academic Admin workflow is not yet exposed.
- Final PASS produces append-only SHADOW proposal; checkpoints/practice cannot.
  No Grade promotion, tuition changes or live Academic completion.
- Active account, enrollment/course dates, canonical pauses and explicit grant
  checked on delivery/start/submit. Expiry blocks question snapshots and preserves
  only own outcome projection; unrelated students cannot read or submit.

## Validation

- Full pgTAP: **54 files / 1,404 PASS** (assessment 60, foundation 35).
- Full application/bootstrap: **220 PASS**.
- Relevant ESLint and `git diff --check`: PASS.
- `npm run build -- --webpack`: PASS. Default Turbopack build environment failure
  (port creation denied), not a source compilation failure and not reported PASS.
- Browser: author/self-review denial/independent approval/Final 100/manual pending/
  manual 75/readback/expiry history isolation PASS. Desktop and mobile inspected,
  no horizontal overflow, no console errors. See PHASE13_LOCAL_VALIDATION.md.
- Local migration ledger 89; latest 20260916235000.
- Synthetic accounts banned, profiles inactive, roles disabled; temporary secrets
  deleted. Audit evidence remains local. No real student evaluation was performed.

## Remaining gates

Delegated academic reviewer scope,
multi-question UI authoring (database already accepts up to 100 questions),
canonical multi-module Theory authoring and MT1.01–05 pedagogical/content approval,
full shadow mapping/reconciliation to the same Grade's Music Theory requirement,
legal retention periods and holiday calendar before production readiness.

CRM trial/LOST decisions remain deferred separately; they do not block notation.

Final review corrected the overdue-label render lint failure by reading an RLS-protected
manual-review queue with database-computed urgency. Regression tests cover admin
queue visibility, student denial, and rendering the canonical overdue flag.

## 2026-09-17 — append-only regrade checkpoint

Migration `20260917000000_learning_assessment_regrades.sql` adds immutable manual
regrade events with previous revision, original/effective scores, marks, reason,
reviewer and timestamp. Exact request retry is idempotent; stale revision fails.
Automatic points cannot be manually replaced. An incorrect automatic key requires
a new assessment version. SUPER_ADMIN only; own-student review is forbidden.

Effective result/history, retry cooldown and Final shadow projection consume the
latest correction. Original attempts and initial shadow proposals remain historical
evidence. Cooldown stays anchored to original attempt completion time, never the
correction time. No live Academic writeback or financial posting is introduced.

- Full pgTAP: **55 files / 1,440 PASS**, including **36 regrade tests**.
- Application/bootstrap: **241 PASS**; relevant ESLint and diff check PASS.
- Browser desktop and mobile 390px: synthetic manual result 75 → 25 → 75;
  original score remains 75, two linked corrections retained. No horizontal page
  overflow or console errors. This is synthetic technical verification only.
- Local ledger: **90 migrations**. No staging/production migration applied.
- Reviewer fake account banned, profile/role inactive; temporary credential and
  setup script removed. No credentials added to the repository.
- Full Phases 14–15 remain **PARTIAL** for the remaining gates above.
