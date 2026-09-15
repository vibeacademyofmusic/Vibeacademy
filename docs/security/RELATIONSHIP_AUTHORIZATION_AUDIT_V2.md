# Relationship authorization consistency audit V2

Scope: existing exposed paths at the Master Plan V2 checkpoint. This is not certification of unimplemented portals. Production remains HOLD.

| Audience/path | Current enforcement | Result / follow-up |
|---|---|---|
| Parent Feedback | ACTIVE profile/parent, valid role and feedback.submit from same scoped assignment, active date-valid link, completed eligible session | Fixed in 20260916091000; staging 20 new security + 28 workflow + 14 actual-teacher assertions PASS |
| Student Feedback | ACTIVE profile/student, own identity, scoped STUDENT feedback.submit, eligible session | Existing legitimate/duplicate/forged-identity tests preserved |
| Parent/student current identity reads | Role-specific permission and identity/link helper; related_student_profiles returns only id/code/name/preferred name | 20260916092000 closes raw student SELECT of staff notes and enforces parent-link dates |
| Teacher class/student/session | ACTIVE profile/teacher/role, assignment and same-role scoped permission; actual-teacher session precedence | Mixed-role scope borrowing removed; completed-session historical behavior is addressed by the new owner decision before portal rollout |
| Teacher/parent own master row | ACTIVE identity and valid role; teacher branch links require scoped classes.view | Legacy uid-only policies tightened |
| Teacher payroll | ACTIVE identity/teacher and valid scoped TEACHER role; APPROVED/FINALIZED own rows only | 20260916090000; 29 staging assertions PASS |
| Branch admin operational reads | Valid branch role must supply its own action permission; active enrollment/class membership | Helpers and schedule policy aligned; no Finance grants added |
| Journals/attendance | Staff policies delegate to session relationship helpers; existing admin mutations stay SUPER_ADMIN | Existing negative tests retained; author/history rollout follows owner decision |
| Learning Reports | SUPER_ADMIN-only raw reports/list and write RPC paths in current implementation | Deny-by-default preserved; approved-history projection and delegated workflows not yet rolled out |
| Finance/Tuition/Receivables | Existing SUPER_ADMIN policies/RPC; no Parent/Student/Teacher raw reads opened | Future account-facing projections required; never reuse raw financial queries in portals |
| Raw Feedback/aggregates | SUPER_ADMIN-only | Respondent submission does not grant access to private feedback |
| E-learning | No current implementation | No access claims; later entitlement/assessment audit required |

`has_role_permission` binds role, permission, scope and validity to one assignment. It prevents borrowing a permission from another role in a different branch. SECURITY DEFINER helpers use public,pg_temp and authenticated-only execute; no caller-supplied user identity. Existing profile bootstrap/account metadata policies are not business-data permissions and were not expanded.

Owner historical access decisions are recorded in `../decisions/HISTORICAL_ACCESS_OWNER_DECISIONS_V1.md`. The new rules must be implemented and tested before historical portal rollout: active learners/linked parents keep their own history despite pause/end; former teachers retain actual taught sessions/authored journals, not current learner profiles. No blanket historical access is inferred from preferred branch or tuition snapshots.

No RLS was disabled; no financial DML privileges were added; no schema history was edited. This audit covers source enforcement plus the reported tests, not real-JWT browser certification for every role. Staging identity/browser rehearsal remains a separate gate.
