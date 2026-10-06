# Academic Journey video links — actual Mac verification, 2026-10-05

Applied candidate patch from the supplied ZIP to the dirty working tree at /Users/macbookair/vibe-academy-system. HEAD remains c843cc6618c721ba37d70d1054e1b1e7ea0ee6c0; feature is uncommitted local code. No push/deploy. Existing report, finance, employee card and Zalo changes preserved.

## Database
Actual application target: http://127.0.0.1:54321, container supabase_db_vibe-academy-system. Backup: /tmp/vibe-video-import/local-before-video.dump (pg_dump custom; never committed). Supabase CLI migration up applied only 20261004183000_academic_video_links.sql using a temporary runner containing the complete history through this version. Previous ledger head: 20261003181000. The separately applied staff-position migration 20261005003000 is still absent from the ledger; deliberately excluded, not reapplied or repaired here.

## Checks actually performed
- Lockfile installation, 65/65 specified tests, next typegen, tsc --noEmit, npm run build: PASS.
- Changed application lint: 0 errors; one existing unused vietnamToday warning in AcademicPrograms.tsx.
- Actual authenticated browser: TEST Pilot S1 / Minh An, add video, invalid URL retains inputs, choose Grade 1 and Repertoire Lesson 01, save. Actual SQL row checked for enrollment, level, item, actor and internal default.
- Actual Supabase Auth sessions for pre-existing TEST identities via generated local magic links (no mail sent, no password changes), not mocked permission helpers.
- P1/P2/S1/T1/T3 mutation RPC rejected. Internal direct SELECT returned zero rows for those identities. P1/S1 context excluded internal link.
- Duplicate insert rejected, version-stale edit rejected. Explicit share exposed link and note to P1/S1; other family P2 denied in RPC and direct SELECT.
- Update/share and soft removal persisted through authenticated RPCs; audit actions CREATED/UPDATED/REMOVED verified. Enrollment and level-progress snapshots identical before/after update/removal.
- Refresh in real browser confirms removed link disappears.
- Desktop 1280x900 and mobile form 390x844 rendered in actual Next application. VIBE shared components, no modal horizontal clipping. Evidence: desktop.png, mobile-form.png.

## Remaining boundaries
No full parent/teacher browser acceptance was performed. Existing tested teacher identities had no readable access to this student at current date; currently assigned-teacher positive read remains unverified on Mac. No physical video existence or YouTube access tested. No claim of overall pilot acceptance.

## Remaining objects
One synthetic video link TEST VIDEO LOCAL 20261005 attached to TEST-P032001-S1 is soft-deleted; its three audit events remain intentionally. No academic/tuition/payment record was changed by the verification. No external YouTube video opened, no Zalo message, no payment link, no migration outside local.

## Local preview
http://localhost:3000/admin/students/edce00bc-e945-401e-854b-7e2e4cf0e630#learning
Next dev remains running on port 3000.
