# Relationship authorization consistency audit V2

Scope: existing exposed paths at the Master Plan V2 checkpoint. This is not certification of unimplemented portals. Production remains HOLD.

| Audience/path | Current enforcement | Result / follow-up |
|---|---|---|
| Parent Feedback | ACTIVE profile/parent, valid role and feedback.submit from same scoped assignment, active date-valid link, completed eligible session | Fixed in 20260916091000; staging 20 new security + 28 workflow + 14 actual-teacher assertions PASS |
| Student Feedback | ACTIVE profile/student, own identity, scoped STUDENT feedback.submit, eligible session | Existing legitimate/duplicate/forged-identity tests preserved |
| Parent/student current identity reads | Role-specific permission and identity/link helper; related_student_profiles returns only id/code/name/preferred name | 20260916092000 closes raw student SELECT of staff notes and enforces parent-link dates |
| Teacher class/student/session | ACTIVE profile/teacher/role, assignment and same-role scoped permission; actual-teacher session precedence | Mixed-role scope borrowing removed; 20260916093000 removes completed-session access to current profiles; actual taught sessions remain accessible |
| Teacher/parent own master row | ACTIVE identity and valid role; teacher branch links require scoped classes.view | Legacy uid-only policies tightened |
| Teacher payroll | ACTIVE identity/teacher and valid scoped TEACHER role; APPROVED/FINALIZED own rows only | 20260916090000; 29 staging assertions PASS |
| Branch admin operational reads | Valid branch role must supply its own action permission; active enrollment/class membership | Helpers and schedule policy aligned; no Finance grants added |
| Journals/attendance | Staff policies delegate to session relationship helpers; existing admin mutations stay SUPER_ADMIN | Existing negative tests retained; 20260916093000 restricts former teachers to authored journals; active class/session staff scope preserved |
| Learning Reports | SUPER_ADMIN-only raw reports/list and write RPC paths in current implementation | Deny-by-default preserved; 20260916094000 exposes only approved allowlisted snapshots to students/parents; staff delegation pending |
| Finance/Tuition/Receivables | Existing SUPER_ADMIN policies/RPC; no Parent/Student/Teacher raw reads opened | 20260916094000 exposes issued own/child receivables through a fixed projection; no raw Finance grants |
| Raw Feedback/aggregates | SUPER_ADMIN-only | Respondent submission does not grant access to private feedback |
| E-learning | No current implementation | No access claims; later entitlement/assessment audit required |

`has_role_permission` binds role, permission, scope and validity to one assignment. It prevents borrowing a permission from another role in a different branch. SECURITY DEFINER helpers use public,pg_temp and authenticated-only execute; no caller-supplied user identity. Existing profile bootstrap/account metadata policies are not business-data permissions and were not expanded.

Owner historical access decisions are recorded in `../decisions/HISTORICAL_ACCESS_OWNER_DECISIONS_V1.md`. These rules are implemented by 20260916093000 and 20260916094000 at the data layer: active learners/linked parents keep their own history despite pause/end; former teachers retain actual taught sessions/authored journals, not current learner profiles. No blanket historical access is inferred from preferred branch or tuition snapshots.

No RLS was disabled; no financial DML privileges were added; no schema history was edited. This audit covers source enforcement plus the reported tests, not real-JWT browser certification for every role. Staging identity/browser rehearsal remains a separate gate.

Teacher historical boundary implementation: local **37 files / 627 pgTAP PASS**, new staging rollback suite **14/14 PASS**, staging ledger **53**. Build via Webpack PASS and 103 application/bootstrap tests plus relevant ESLint PASS. Default Turbopack initially failed binding its internal port; after deleting only generated Turbopack cache, the default build also passed. No application/config change was needed.

Student/parent history implementation: `student_attendance_history`, `student_approved_reports` and `student_debt_history` use record branch + same-role permission + identity/link checks. ACTIVE accounts with PAUSED/GRADUATED learner records retain history; no ACTIVE class enrollment is required. Parent links must remain active and date-valid. Only issued debt and approved frozen report data are returned. Report fields are allowlisted, including nested academic/journal data; admin notes, draft data and future private keys are excluded. Debt reuses invoice_receivables rather than recalculating balances. Results are paginated with a maximum of 100 rows. No financial DML grants were added.

Validation: **38 files / 684 pgTAP PASS**, **103 app/bootstrap PASS**, relevant ESLint/diff check/default build PASS; staging history replay **57/57 PASS**, ledger **54**. Portal UI integration and broader staff delegation remain subsequent increments; these data contracts are not a claim that portals are complete.
