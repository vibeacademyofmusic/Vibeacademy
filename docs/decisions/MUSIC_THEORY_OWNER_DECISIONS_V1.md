# VIBE Academy — Music Theory E-learning Owner Decisions V1

Status: OWNER_APPROVED

These decisions are binding for Music Theory E-learning V1 unless superseded by a later approved decision record.

## D01 — Module Checkpoint
Approved: Formative only.

Rule:
- Module checkpoints do not complete Academic Progress.
- counts_toward_academic_progress = false.
- Only approved Final Assessments may affect Music Theory subject completion.

## D02 — Pass Threshold
Approved: Configurable by Grade and assessment version.

Initial Grade 1 recommendation:
- 70%

Rule:
- Do not hardcode a single global threshold.
- Threshold must be stored as configurable assessment policy.

## D03 — Attempts and Cooldown
Approved:
- Practice: unlimited attempts.
- Final Test: maximum 3 attempts.
- After failed Final Test attempts, apply 24-hour cooldown.
- Academic Admin or SUPER_ADMIN may reopen with audit trail.

## D04 — Prerequisites
Approved: Soft gate with authorized override.

Rule:
- Missing prerequisites may show warnings.
- Do not hard-lock the entire curriculum by default.
- Placement/migration/authorized academic override must be supported.
- Final assessment may define stricter prerequisites separately.

## D05 — Manual Review SLA
Approved:
- HYBRID/MANUAL grading target: 2 working days.

Rule:
- Reviews exceeding the SLA should become overdue/attention-required.
- Academic Admin must be able to identify outstanding manual reviews.

## D06 — MT5.15 Source Missing
Approved:
- Keep MT5.15 Revision Notes in curriculum structure.
- Status = SOURCE_MISSING.
- Do not infer or fabricate missing content.
- Missing Grade 5 source does not block Grade 1 implementation.

## D07 — Notation Engine Scope
Approved:
- V1 focuses on Grade 1 notation requirements.
- Architecture must remain extensible for higher grades.

Rule:
- Alto clef, tenor clef, SATB and advanced notation may be deferred until required by later grades.

## D08 — Final Test Security
Approved:
- Identity confirmation before assessment.
- Question randomization where appropriate.
- Answer randomization where appropriate.
- Audit attempt/session.
- Do not reveal correct answers during active Final Test.
- No camera proctoring required in V1.

## D09 — Academic Progress Mapping
Approved:
- Music Theory Grade N Final Test PASS maps to Music Theory N requirement for the same Grade.

Rule:
- Academic writeback must initially run in shadow/reconciliation mode.
- Do not automatically promote Grade.
- Academic Progress Engine remains final authority.

## D10 — Content Language
Approved:
- Vietnamese is the primary instructional language for V1.
- Preserve standard English/Italian music terminology where appropriate.
- Provide glossary/term support.
- Full bilingual content is deferred.

## D11 — Copyright Review
Approved:
- Content must be original VIBE-authored learning material.
- Do not scan or reproduce textbook pages as course content.
- Prefer two-layer review where resources allow:
  1. music pedagogy/content review
  2. originality/assets/copyright review

## D12 — Accessibility
Approved:
- Target WCAG 2.2 AA for primary user flows.
- Notation-heavy interactions may require specific accommodations.

Rule:
- Accessibility must be considered during UI/interaction design, not added only after implementation.

## D13 — Data Retention
Approved:
- Retention policies differ by data category.
- Do not hardcode one retention period globally.

Initial direction:
- authored content: long-term retention
- assessment results/attempts: learner lifecycle plus defined retention period
- telemetry/raw interaction data: shorter retention and/or anonymization

Final legal retention periods must be confirmed before production rollout.

## D14 — Legacy Learners
Approved:
- Initial migration uses authorized manual academic credit/baseline.
- Do not force existing learners to repeat earlier Music Theory content.
- Placement-test automation may be introduced later.

Rule:
- Grade baseline and migrated academic credit require reason/evidence and auditability.

# Curriculum Structure Rule

Music Theory E-learning must follow the textbook Contents structure.

- Each major Contents item = one learner-facing module.
- Preserve textbook order.
- Preserve source page ranges as reference metadata.
- Do not reorganize learner-facing curriculum primarily by abstract domains such as Rhythm, Harmony, or Notation.
- Such domains may be used only as tags, analytics, search, or prerequisite metadata.

# Grading Rule

AUTO grading is allowed only when the system has structured validation capable of evaluating the musical answer correctly.

If structured notation validation is insufficient:
- downgrade the activity to HYBRID or MANUAL.
- do not fake AUTO grading using image/pixel comparison.

# Grade 1 Implementation Gate

Before publishing Grade 1:
- content model must be approved
- question engine must support required interaction types
- notation engine must support Grade 1 structured notation
- pilot MT1.01–MT1.05 must pass content and technical review
- academic writeback must pass shadow reconciliation

