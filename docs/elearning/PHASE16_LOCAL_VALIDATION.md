# Phase 16 — structured notation editor checkpoint

2026-09-16. Local notation editing/rendering scope verified. This is not approval
of original curriculum content, automated musical grading or a production release.
Production HOLD; no push/deploy/staging/production writes.

## Implemented

- Versioned structured model for treble/bass, absolute spelled pitches, key/time
  signatures, rests, rational durations, dots/double dots, stems, explicit beams,
  fixed triplets/duplets, chords, ties/slurs and up to eight measures.
- Exact duration arithmetic; rejects overfull bars, incomplete bars marked complete,
  duplicate IDs/pitches, invalid groups and ties between differently spelled pitches.
  Explicit partial bars accommodate editing/pickup bars without pretending completion.
- Keyboard-operable controls for notes/rests/pitches/durations, chords/intervals,
  selected groups and relation marks. Generic sequential input supports scales and
  rhythm/rewrite responses. No automatic compositional quality evaluation.
- Lazy-loaded VexFlow 5.0.0 Bravura bundle; embedded fonts, no CDN font request.
  Rendering is separate from validation and grading. Public license notices include
  VexFlow MIT plus Bravura/Academico OFL from exact upstream font packages.
- Protected learner notation questions now submit validated structured JSON through
  server actions; private scores/keys cannot be smuggled in the parsed payload.
  Unsupported automatic notation grading remains MANUAL/HYBRID. Reviewers can see
  the structured response rendered alongside evidence; no pixel comparison.
- Admin-only notation workbench saves no business or educational result.

## Browser evidence

Synthetic local admin exercised treble/bass, key signature, accidental, triad,
rest, single/double dots, beams, triplet, tie and slur. Changed a tied note to a
new pitch: invalid response warning and no misleading preview. High ledger-note
example remains inside the dynamically sized staff region. Selected a note using
keyboard Space. Desktop, 390×844 mobile and 768×1024 tablet inspected; document
width matches viewport, only the staff scrolls horizontally. Console errors empty.
The new notation submission action is covered by regression tests; a full student
notation assessment/reviewer round trip remains part of the Grade 1 pilot gate.

## Validation and limitations

- Application/bootstrap: 239 PASS, including 17 notation model cases and two new
  structured-submission cases.
- Relevant ESLint, diff check and Webpack build PASS. Default Turbopack remains an
  environment port restriction recorded in the foundation report.
- Database schema unchanged by this checkpoint; latest full suite is 54 files /
  1,404 PASS, local migration count 89. No database reset performed.
- npm dependency installation audit reported zero vulnerabilities.
- Synthetic local account disabled and temporary credential removed after testing.
- No alto/tenor/SATB, MIDI/playback, drag notation, automatic transposition/grading
  or expert engraving guarantee. Manual notation assessment grading remains the
  authority. Pedagogical approval, golden examples and complete learner/reviewer
  notation workflow still gate Phase 17. Full Phases 14–16 are not claimed closed.

Reference: https://github.com/vexflow/vexflow/wiki/Tutorial
