# Phase 8 local checkpoint — family read-only portal

2026-09-16. **Phase 8 remains IN PROGRESS. Production HOLD. No push/deploy.**

## Implemented and verified

- `/my-learning`: authenticated student/parent login destination, authorized
  learner selector, read-only multi-program journey, upcoming sessions,
  attendance, approved report comments and issued-invoice debt.
- Database projections use explicit fields, bounded pages and database permission
  checks. Academic percentages reuse the existing Academic UI helper. Optional
  and inactive definitions do not dilute completion.
- Historical parent debt now respects `student_parents.can_view_finance`.
  The regression failed before migration `20260916190000` and passes after it.
- Academic has independent `academic.view_own` / `academic.view_related`
  permissions. Profile or attendance access cannot replace academic permission.
- No raw private report/academic notes, new financial posting, broad table grant,
  historical migration rewrite, reset or production access.

## Validation

| Gate | Result |
|---|---|
| Full local pgTAP | 49 files / **1177 PASS** |
| Family/history database suite | **89 PASS**, included above |
| Full application/bootstrap suite | **163 PASS** |
| New family UI tests | **7 PASS**, included above |
| Build | PASS |
| ESLint: new portal, login action, portal tests | PASS |
| `git diff --check` | PASS |
| Student login / own identity / journey | PASS in local browser |
| Parent login / linked child / journey | PASS in local browser |
| Unrelated student URL for student and parent | Denied, not-found page |
| Inactive parent after fixture cleanup | Own-child URL denied |
| Schedule, report, invoice empty states | PASS in local browser |
| Viewports | 390×844, 768×1024, 1440×900; no horizontal overflow |
| Browser console | No errors observed |

The browser fixture has no invoice, report or upcoming session. Populated history,
upcoming-session authorization, report allowlisting and debt accuracy are covered
by database/UI tests; populated end-to-end browser flows remain for phase exit.
The final independent academic permission migration was verified by full pgTAP
after the browser run; browser credentials had already been disabled.

## Temporary-account cleanup

Owner explicitly approved two synthetic STUDENT/PARENT accounts on localhost.
Both are now banned, profiles INACTIVE and role assignments inactive. Passwords
were generated, kept only in a 0600 temporary file, and never printed or committed.
Credential/setup/cleanup files were deleted, browser signed out, temporary tab
closed and viewport restored. Synthetic academic records remain for audit; no
business financial records were created.

## Remaining Phase 8 work

- Teacher portal: schedule/classes, journals, permitted current academic context,
  historical actual teaching, feedback summary and approved payroll/corrections.
- Family feedback submission/read UX using the existing secured engine.
- Opening debt/customer credit visibility; invoice tab explicitly states that it
  is not the entire customer balance.
- Complete approved report presentation and populated browser scenarios.
- Notification, assessment and e-learning entry points depend on later phases;
  do not advertise unavailable routes.
- Full phase-exit security and browser matrix before declaring Phase 8 PASS.

Local migrations added at this checkpoint: `20260916190000`,
`20260916191000`, `20260916192000`. Staging/production were not changed.
