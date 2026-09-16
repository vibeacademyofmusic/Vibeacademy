# Phase 19 — Aural draft interchange contract

2026-09-17. **PARTIAL — contract only, no delivered Aural course or audio.**
Independent preparation while Theory content review and staging recovery approval
remain pending. Production HOLD.

The master plan supplies the 1A–3D module structure and five named question types.
`lib/learning/aural.ts` preserves those names and enforces module/type compatibility:
metre in A, echo in B, change detection in C, features in D, tonality only in 3D.
This does not invent lessons or recordings from missing educational source material.

Draft metadata uses opaque asset UUID, SHA-256, supported audio MIME, duration and
provenance. URLs/object paths are rejected rather than turned into fetch targets.
Change detection carries an ordered ORIGINAL/COMPARISON pair; their digests may
match for an intentionally unchanged comparison, so no invented change policy.
Every draft supplies an explicit maximum play count. Technical bounds prevent
unbounded descriptors; they are not default business replay/exam policies.

Echo carries a bounded recording descriptor and private manual rubric. No automatic
singing grade, pixel/audio similarity score, approval flag or Academic outcome is
accepted. Objective choices carry only options here; private answer keys belong in
the future protected assessment policy. The **authoring** contract contains private
rubrics and must not be sent wholesale to learners.

## Tested scope

Seven unit cases cover source catalogue order, descriptor roundtrip, paired audio,
Grade 3 tonality boundary, manual echo requirements, forbidden fetch/score/approval
fields, duplicate options and malformed/oversized metadata. Fixtures contain no
audio and do not assert an actual asset exists or has passed originality review.
No migration, route, storage bucket or external provider added. No microphone or
recording permission requested; no browser workflow can be claimed for this scope.

Full application/bootstrap suite: **273 PASS** (266 previous + seven contract
cases). Relevant ESLint and diff check PASS. Latest database suite remains
**59 files / 1,533 PASS**, unchanged by this pure TypeScript contract. Webpack
build PASS; default Turbopack's previously recorded environment limitation remains.

## Required implementation before Phase 19 PASS

- Reviewed original audio/source material and actual asset digest/MIME/duration
  verification; metadata submitted by an author is not trusted file validation.
- Private storage and server authorization per eligible enrollment/attempt; short
  lived delivery, revocation, original/comparison playback and error recovery.
- Atomic server play accounting tied to attempt/question, including retries;
  `maxPlays` in this contract is **not enforcement** and is not DRM.
- Recording consent, protected upload, safe decoding/limits, retention/deletion,
  playback and human review; no automatic echo score or feedback-to-payroll link.
- Integrate approved question types into immutable assessment snapshots and private
  grading policies. Preserve checkpoint/formative vs Final shadow-only semantics.
- Populated positive/negative RLS/RPC tests and actual desktop/mobile audio/recording
  browser validation. Grade 1–3 contents are not considered authored by this scaffold.

This contract may be extended by reviewed adapters; it cannot grant access, approve
content, prove ownership, enforce playback counts, or certify curriculum completion.
