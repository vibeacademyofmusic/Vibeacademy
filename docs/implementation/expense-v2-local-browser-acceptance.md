# Expense V2 local browser acceptance fixture

This fixture exists only for the local Supabase instance. It does not change application code, production schema, RLS, RPC authorization, or remote data.

Run:

```sh
node scripts/local-bootstrap-expense-v2-acceptance.cjs
```

The script refuses non-loopback Supabase URLs and writes through the local `supabase_db_vibe-academy-system` container only.

It creates or verifies:

- `expense.employee@vibe.local`, ACTIVE profile, genuine linked ACTIVE employee `LOCAL-EXP-V2`;
- `expense.reviewer@vibe.local`, a separate ACTIVE reviewer;
- local-only branch `LOCAL-EXP-V2` and the existing `ST` unit's local branch mapping;
- an HQ employee relationship using the existing valid HQ branch mapping;
- one trip from `HQ` to `ST`, 2026-09-15 through 2026-09-16;
- an `APPROVED` trip review authored by the separate reviewer;
- a guard that refuses completion if the trip already has an Expense Claim or active legacy reservation.

Both users receive `SUPER_ADMIN` because the existing `/admin` route requires that real role. The employee is also assigned `STAFF` and is linked directly through `employees.profile_id`; no impersonation is used. Database maker-checker rules continue to prevent the employee from approving their own claim.

Local credentials:

- Employee: `expense.employee@vibe.local` / `LocalExpenseV2-Employee-2026!`
- Reviewer: `expense.reviewer@vibe.local` / `LocalExpenseV2-Reviewer-2026!`

The script prints the exact trip UUID and relationship evidence after setup.
