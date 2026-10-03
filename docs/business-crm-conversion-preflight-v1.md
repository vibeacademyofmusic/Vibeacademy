# CRM conversion preflight

Read-only. Local schema after Sprint 2. No identity table was changed.

## Current contracts

`students` holds the learner: `student_code` is required and unique, plus `full_name`, `date_of_birth`, `phone`, `email`, and `default_branch_id`. The app creates a student in `createStudent` by a direct insert. That action is limited to `SUPER_ADMIN` and requires a student code, name, branch, and admission date. It does not set date of birth or phone. There is no student-create RPC.

`parents` holds `user_id`, `parent_code`, `occupation`, and `status`. It has no name, phone, or email. `user_id` may be null, so a parent row can exist without a login, but that row has no contact identity.

`profiles` holds `full_name` and `phone`, and its id is an auth user. Parent contact exists only when that parent has a login and a profile.

`student_parents` links an existing student to an existing parent. The current write policy is super-admin management of that link. Later columns are `is_active`, `valid_from`, and `valid_until`.

No application path creates a parent. Enrollment creation is a separate class workflow and is not part of this conversion.

## Answers

- An existing student is matched only when the lead has both a name and a date of birth and those equal the student name and date of birth. A phone or email by itself is not a match.
- An existing parent is not matched from a phone. The operator may attach a parent who already exists, and only as part of confirming a student.
- A parent row does not require a login, and it also cannot store the lead's name or phone. Creating one from a lead would drop the contact identity.
- The authoritative parent contact source remains `profiles` for a parent who can log in. Until then, the lead keeps the contact.
- `student_parents` is an existing link. Conversion may insert that link when both ids already exist. It does not insert a parent.
- `createStudent` is not reused. It is a super-admin form insert, not an idempotent RPC, and it does not carry the lead's date of birth.
- Enrollment stays out of Sprint 3.

## Decision

Automatic creation of a student or parent is not safe. Sprint 3 keeps the lead as the contact record and adds a human review:

- `PENDING` or `BLOCKED` records the review and creates nobody.
- `LINKED` writes `converted_student_id`, optional `converted_parent_id`, and `converted_at` only for an existing student. A strong name-and-date match can be linked directly. Any other explicit student requires a review note. A conflicting name and date of birth is rejected.

Repeated conversion to a different student is rejected. The same request does not create a second student, parent, or link.
