# Phase 14–15 — Theory model and assessment contracts

Continue locally while Phase 13 assessment integration remains open. Production
HOLD; no official learning content is approved by synthetic validation accounts.

`lib/learning/theory-contents.json` extracts exact code/title/order/page references
from the approved repository specification, with SHA-256 provenance. It contains
87 module references: G1 22, G2 16, G3 17, G4 17, G5 15. MT5.15 remains
SOURCE_MISSING. This is metadata, not original instructional content.

Assessment policies are immutable/versioned and explicit per Grade/assessment:
PRACTICE unlimited; CHECKPOINT formative only; FINAL initially three attempts,
24-hour cooldown after failure, explicit identity confirmation. Pass thresholds
are stored, not a global hardcoded 70%. Grade 1 starts from an explicit 70%
policy. Later Grades require explicit policy values rather than inferred rates.

Keep answer keys inaccessible to learners. Delivered questions and student
responses are structured versioned snapshots. Deterministic grading only for
implemented validators; unsupported notation/construction/composition goes to
HYBRID/MANUAL and cannot silently PASS. Preserve grading evidence and audited
manual/regrade/override actions. Results propose shadow Academic outcomes only;
never invoke live Grade progression or edit old Academic records.

Reviewer/author provenance, attempt ownership, policy snapshots, idempotency,
limits/cooldown, cross-student denial, active account/enrollment/grant expiry and
published content requirements are database rules. UI uses the same contracts.

Original content authoring and pedagogical approval remain separate from
technical engine verification. MT1.01–05 pilot must pass its content/technical
gate before expanding. No synthetic fixture can satisfy official content review.
