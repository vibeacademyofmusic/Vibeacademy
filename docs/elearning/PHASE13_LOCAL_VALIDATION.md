# Phase 13 — protected content and progress checkpoint

2026-09-16. **PASS for the local foundation scope**, including assessment-attempt integration.
Protected text delivery, review, grants, lesson/practice evidence and assessment
workflow are implemented and locally verified. This is not full Theory content readiness.
Production HOLD; no push/deploy/staging/production mutation.

## Verified implementation

- Versioned Grade → Module → Lesson → Block document, source/author metadata.
  Draft → independent review → approved → published → retired, immutable content.
- Separate admin preview displays the full draft before review. Typed text is
  rendered as text, not HTML; media references are metadata, not public URLs.
- Explicit, audited Grade access grant tied to a matching business enrollment;
  supplied start/end times, no invented subscription or tuition calculation.
- Delivery rechecks ACTIVE account/role/student/enrollment/course/curriculum,
  course delivery dates, enrollment dates, canonical pause engine and grant expiry.
- Lesson completion is idempotent. Practice reflection is append-only and clearly
  `RECORDED_UNGRADED`; caller cannot supply grade/score/student identity.
- Expiry blocks protected content and submissions; own historical evidence stays.
  No Academic progress writeback. The generic lesson-activity RPC still rejects FINAL: finals use a separate
  independently approved policy, protected attempt and canonical grading workflow.

## Evidence

- Full pgTAP **54 files / 1,404 PASS**, foundation **35**, assessment **60** tests.
- Full app/bootstrap **220 PASS**, including 7 foundation action, 10 assessment action/render
  and 7 source/model tests.
- `npm run build -- --webpack`, relevant ESLint and diff check PASS. Default
  Turbopack build was blocked by environment port creation (`Operation not permitted`);
  it is not reported as a default-build PASS. No build configuration was changed.
- Browser localhost: synthetic author creates draft, submits; self-approval denied.
  Different synthetic reviewer previews full content, approves and publishes.
  Student with explicit matching grant sees lesson, records completion and practice.
  SQL confirms one completion / one ungraded attempt. Test grant then expired;
  browser reload removes content and controls, retaining completion history.
- Desktop 1440×900 and mobile 390×844 inspected, mobile document width 390,
  no console errors. No official curriculum content was published by this test.
- Local ledger **89**, latest `20260916235000`. Staging and production untouched.
- All three temporary local identities banned/INACTIVE with zero active roles;
  credential JSON files deleted, browser logged out/closed and memory cleared.
  Synthetic learning and stock history retained as audit evidence.

## Issues found and resolved

TypeScript checks found untyped transition-map indexing and nullable closure
access; fixed before browser work. Expanded tests initially used obsolete
enrollment `PAUSED` status; fixture now uses canonical `enrollment_pauses`.
Course end-date review added an explicit delivery-window migration and tests,
so a still-live grant cannot keep a finished course accessible.

## Remaining work

Protected media delivery in the relevant media phase;
multi-module curriculum authoring using exact approved Contents metadata.
The initial admin authoring form creates one module/lesson per immutable version;
the underlying document contract supports multiple modules and lessons.
No complete E-learning, Theory, Aural or production-readiness claim is made.

## Assessment browser extension

Synthetic author created Final and manual checkpoint policies. Self-approval was
rejected; a different reviewer inspected and approved both. Student identity
confirmation preceded Final; submission produced PASSED / 100, immutable answers
and one shadow outcome. Manual checkpoint stayed PENDING_REVIEW with no score;
reviewer saw the response/rubric and scored 3/4, producing PASSED / 75 and no
Academic shadow. Database readback matches browser values exactly.

Expiry then removed all delivered content and direct attempt payloads while the
student retained both outcome summaries. Desktop 1440×900 and mobile 390×844
inspected; document widths match viewports; console errors empty. Temporary
synthetic identities disabled again, credential file deleted and browser closed.

No real educational results, money, invoices or Academic progress were created.

Final review corrected the overdue-label render lint failure by reading an RLS-protected
manual-review queue with database-computed urgency. Regression tests cover admin
queue visibility, student denial, and rendering the canonical overdue flag.
