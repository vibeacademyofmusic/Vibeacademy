# Phase 17 — read-only analytics checkpoint

2026-09-17. Technical analytics scope PASS; complete instructional pilot PARTIAL.
Production HOLD. No push, deployment or cloud database mutation.

## Semantics and authorization

`learning_version_analytics(uuid)` is stable, SECURITY INVOKER with fixed search
path, explicit ACTIVE SUPER_ADMIN checks and underlying RLS retained. Anonymous
and service-role execution are revoked. It returns one requested content version;
no question payload, answer keys, rubric, learner identity or per-student marks.

Lesson acknowledgements are distinct student counts for each immutable version
and lesson, not evidence of mastery or Academic completion. Assessment statistics
separate attempts from distinct learners, in-progress from pending review, and
passed from failed. They use effective regraded results without double-counting
correction history. Only completed attempts contribute to the average; no completed
attempt means null, displayed “Chưa có”, not zero. These are attempt averages, not
student final grades. Historical evidence remains included after access expires.

No Academic, financial, enrollment or assessment result is written by analytics.
No percentage completion is inferred from grants or class membership.

## Validation

- Full application/bootstrap: **266 PASS**; five analytics UI cases.
- Full pgTAP: **58 files / 1,517 PASS**; analytics file **29 PASS**, including
  setup lifecycle assertions, corrected results, null scores, version isolation,
  idempotent lesson acknowledgement, student/inactive-admin/anonymous denial.
- Webpack build, relevant ESLint and diff check PASS. Default Turbopack remains
  the recorded environment port restriction, not a claimed PASS.
- Browser on localhost: existing synthetic published version showed one lesson
  acknowledgement, Final 100%, regraded checkpoint 75%, notation checkpoint 100%,
  and an unattempted draft with no average. No new learner outcome created.
- Desktop 1280 and mobile 390 showed matching document widths; console errors empty.
  Synthetic admin disabled and temporary credential/script removed after validation.
- Local migration ledger **93** after `20260917013000`; no staging/production apply.

## Performance and remaining scope

Catalogue pagination fetches 26 rows to display 25. Catalogue and selected-version
analytics load concurrently; no full history is sent to the client. Indexes support
version/lesson and assessment lookups. Aggregates inspect the selected version's
history; this is not a measured production load benchmark, and a version with very
many assessments may need assessment pagination later.

The original twelve-lesson draft is separately available in
`drafts/grade1-pilot-review.md`, with private answer keys and explicit pending
pedagogical/originality review. It is not imported, approved or published. Browser
tests use synthetic fixtures only. Analytics PASS does not authorize advancing the
instructional pilot gate, publish later modules, or assert classroom accessibility
acceptance. Delegated Academic Admin and real subject mappings remain unverified.
