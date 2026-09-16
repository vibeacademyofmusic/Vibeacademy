# Phase 13 — protected learning foundation

Production HOLD. Phase 11 `846f0cb`, Phase 12 `c82bb1c` are local commits.
CRM conversion remains independently deferred; it does not block this foundation.

## Approved sources read

- Music Theory E-learning Curriculum Specification V1: sections 12–17 define
  assessment/content separation, membership expiry, authoring and versioning.
- `docs/decisions/MUSIC_THEORY_OWNER_DECISIONS_V1.md`: D01–D14 supersede older
  suggestions. Checkpoints never complete Academic; only reviewed final results
  may propose shadow outcomes. No automatic promotion or live writeback.
- Exact textbook Contents module order remains authoritative; question-bank
  capabilities and original instructional content are subsequent phases.

## Foundation contract

Versioned Grade → Module → Lesson → Content Block. Draft authoring, independent
review and published immutable content. Store provenance/review metadata and
accessible text. No raw HTML execution. No draft content for learners.

Protected delivery requires an authenticated ACTIVE student identity, eligible
ACTIVE business enrollment, matching curriculum and an explicit unexpired access
grant for the Grade. Grant start/end dates are entered explicitly by authorized
admin with reason/audit; do not invent a subscription duration, infer payment
status, or change tuition. Enrollment dates/status and expiry are rechecked on
every content/progress request. Membership expiry denies protected payloads while
preserving attempts/feedback/history. Parent historical access does not imply
permission to submit learner attempts or access paid course content as a student.

Lesson completion and practice/assessment attempt evidence are separate from
Academic status. Server resolves student identity; ignores caller scores and
Academic completion flags. Question scoring, attempt policy and manual grading
belong to Phases 14–15; foundation must not pretend they are complete.

Admin authoring/access management and learner resume flow use reusable RPCs,
RLS and least-privilege grants. Version/row locks protect review and completion;
idempotent submission identities prevent duplicate history. Bounded reads.

## Gates

Regression: draft/expired/inactive/cross-student denial, linked eligible learner,
curriculum mismatch, immutable published content, independent review, preserved
history after expiry, repeat-safe lesson progress, no Academic mutation. Full
pgTAP/app/bootstrap/build/lint/diff, synthetic localhost student browser flow and
desktop/mobile review. Do not label Phase 13 PASS until implementation and these
gates are actually complete.
