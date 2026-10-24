# Admin shell role gate V1

Status: business routes are open to an active user who passes `crm_shell_may_enter()`. Every other `/admin` route stays `SUPER_ADMIN` only.

## Choice

Option A, auditing every admin module before admitting `BRANCH_ADMIN`, is larger than this gate. Option B, a second route tree, would move every business URL and still leave the old `/admin/business` paths to secure.

The implementation is a path boundary inside the current tree:

- `proxy.ts` overwrites `x-vibe-pathname` from the real request URL. A caller cannot supply that header.
- `app/admin/layout.tsx` still requires a signed-in session and `has_role('SUPER_ADMIN')` for every path outside `/admin/business`.
- A non-super-admin is admitted only when the path is exactly `/admin/business` or a child of it, and `crm_shell_may_enter()` is true.
- A missing path header denies the non-super-admin.
- The business-only menu contains the six business links. Finance, payroll, academic, students, HR, and system links are not rendered. The logo points at `/admin/business`.
- Login sends a `BRANCH_ADMIN` who may enter the shell to `/admin/business`. A teacher, and a branch admin without `crm.view`, still go to their existing destinations and cannot open the business shell.

`crm_shell_may_enter()` is true for an active super admin, or for an active user with `crm.view` on a real branch. A null branch on `BRANCH_ADMIN` does not qualify. Data access remains `crm_can` and row policies.

## Tests

`tests/admin-shell-access.test.cjs` covers the path rule and rendered navigation:

- super admin reaches business, finance, and payroll
- a user with shell permission reaches `/admin/business/crm` and does not see unaudited links
- the same user is denied `/admin/finance`, `/admin/payroll`, `/admin/academic`, `/admin/students`, `/admin/hr`, and `/admin`
- a user without the permission, a missing path header, and a signed-out user are denied

`supabase/tests/database/crm_shell_access_test.sql` covers the database decision:

- super admin may enter and can view branch A
- branch admin A may enter, can view branch A, and cannot view branch B
- branch admin B cannot view branch A
- an authenticated account with no role, a teacher, a student, a parent, a disabled user, and an anonymous session are denied

Backend RLS remains the final authority for rows. This gate does not make unaudited admin modules safe for a branch admin.
