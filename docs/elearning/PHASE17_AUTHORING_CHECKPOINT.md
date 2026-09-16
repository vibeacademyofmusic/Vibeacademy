# Phase 17 — canonical pilot authoring checkpoint

2026-09-17. **PARTIAL: authoring infrastructure verified, instructional pilot not
approved or published.** Production HOLD; no push/deploy/cloud mutation.

## Source and contract

The approved specification defines 87 Contents modules. Migration
`20260917010000_learning_theory_contents_contract.sql` stores their exact code,
Grade, order, title, page reference and missing-source state. It does not seed
instructional material. The source document SHA-256 is fixed in the contract and
cross-checked by application tests.

Theory content (declared `theory_grade` or reserved MT module codes) must carry the
approved source fingerprint, match an ACTIVE numeric Academic Grade, retain exact
module identity/pages/order, and keep lesson codes within their module. MT5.15
remains SOURCE_MISSING and cannot receive invented lesson payloads. Generic non-MT
content remains supported by the existing foundation. Published/history immutability
is unchanged. Canonical metadata changes require a reviewed migration/version change.

The pilot authoring page supports exactly MT1.01–MT1.05 and the 12 lesson blueprints
in section 18 of the approved specification. It retains objectives and requires
original explanation, worked example, misconception contrast, guided practice,
independent practice and summary for every included lesson. Catalogue text/order
comes from the server, not submitted editable labels. The form creates DRAFT only;
existing independent review/publishing controls remain separate.

Soft prerequisites remain soft: a selected subset keeps Contents order, without
forcing migrated learners through earlier modules. This is not permission to skip
the Grade 1 pilot content gate or publish an incomplete full Grade curriculum.

## Validation

- Full pgTAP **57 files / 1,488 PASS**, including **18 Theory contract cases**.
- Full application/bootstrap **255 PASS**, including **6 pilot authoring cases**.
- Relevant ESLint, `git diff --check`, Webpack build PASS. Default Turbopack remains
  the previously recorded environment port restriction; it is not reported PASS.
- Browser desktop/mobile: selected MT1.03 then MT1.01, supplied explicitly synthetic
  text for each section, saved only DRAFT. SQL readback showed MT1.01 then MT1.03,
  two lessons each. Mobile width 390/390 and console errors empty.
- Isolated LOCAL curriculum/Grade fixture used; no real curriculum was edited.
  No access grant, assessment or official outcome created by this authoring test.
- Synthetic admin disabled, temporary credential/script removed, browser tab closed
  and viewport reset. Synthetic draft remains local audit evidence, explicitly
  marked not for approval/publication. Local migration ledger advanced to **92**.

## Gates still open

The scaffold and synthetic fixture are not authored teaching content. Real original
MT1.01–MT1.05 explanations, notation assets, guided/independent question sets,
pedagogical and originality/assets review, classroom/accessibility evaluation and
content-linked assessment analytics remain required. Text practice sections do not
automatically become question-bank policies. Grade 1 expansion MT1.06–MT1.22 and
Grades 2–5 remain gated; the reference catalogue is not evidence they are complete.

No reviewer authorization is inferred from a synthetic test account. Real Academic
subject mappings need verified owner data. Delegated Academic Admin scope and legal
retention/holiday calendar remain separate readiness items.

## Source extraction correction

During draft authoring, source cross-check found that two prerequisite references
had been extracted as lesson rows (duplicating L01 and omitting L03 in MT1.02 and
MT1.04). Corrected to MT1.02.L03 “Complete bars” and MT1.04.L03 “Same pitch across
clefs”, with the exact approved objectives. Tests now assert all twelve unique
lesson codes and those titles, not only aggregate counts. Browser confirmed the
six distinct lessons of modules 2 and 4; no draft was created or published during
this correction check. Earlier synthetic saved fixture used modules 1 and 3 and
was unaffected. Fake author disabled and temporary credential removed afterward.
