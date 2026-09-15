# Legacy Migration V1 — implementation gate

Date: 2026-09-16. Status: **OWNER DECISION PENDING**.

Phase 3 is complete at staging ledger 59 with 43 database files / 858 tests and 118 application/bootstrap tests passing. Production remains HOLD. No Legacy Migration business tables or import functions have been created at this checkpoint.

## Confirmed contract

Use the approved summary and full `VIBE_Legacy_Student_Migration_Specification_V1.docx`: current/opening state only, durable `(source_system, source_entity_type, source_reference)` identity, immutable raw payload, explicit reviews, dry-run without business writes, atomic student import, resume, exact reconciliation, no fabricated earlier Grade passes, and non-cash opening receivables/settlements. These rules do not need renewed approval.

## Decision required: financial baseline without a mapped class

The specification describes unmatched class/teacher assignment as a warning when core student/enrollment/finance can import safely. The existing schema requires:

- `public.enrollments.class_id NOT NULL` (migration `20260901101225`).
- `public.enrollment_tuition.enrollment_id NOT NULL` (migration `20260908125034`).

Consequently an unassigned learner with opening tuition/debt cannot be imported as a complete student unit using current enrollment/tuition invariants. Creating a placeholder class, silently matching a class or committing only half of the financial unit would violate the approved rules. Making class optional would change normal enrollment, tuition and relationship authorization behavior beyond a parser implementation choice.

Owner options:

1. **Recommended V1:** classify this whole row `NEEDS_REVIEW` until an exact class is approved. Raw/normalized data and dry-run evidence remain available, but no student-unit business writes occur. This explicitly makes missing class blocking for rows requiring class enrollment/tuition; it does not create fake classes.
2. Support full import before class assignment: explicitly approve an enrollment/tuition model for unassigned learners, including the activation anchor and branch security scope, then implement and test that model before enabling import.

Neither option has been selected by Codex. A question has been sent to the owner. No schema relaxation or implicit business default has been applied.

## Implementation sequence after the decision

1. Add scoped migration permissions, batch/row versioning, durable source mappings and append-only audit, reusing existing authorization helpers.
2. Implement controlled CSV ingestion, immutable raw payload, explicit source/cutover/template metadata, exact mappings, validation and duplicate review. Preserve unknown fields as review issues.
3. Implement per-student import through a migration-specific authorized transaction, including academic starting baseline and a distinct opening ledger excluded from cash/forecast calculations. Require independent financial/academic review before execution.
4. Add resumable results, zero-difference reconciliation and rollback eligibility checks; deny destructive rollback after downstream activity.
5. Build batch/row review UI, regression tests and local browser validation; commit only after validation.

A real legacy source package, approved mapping dictionary and final cutover metadata have not been provided in the repository. Synthetic local fixtures can be used for implementation; real-data pilot and production sign-off cannot be claimed without those materials. No production push, deployment or database action is authorized by this document.
