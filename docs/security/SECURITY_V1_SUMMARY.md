# VIBE Academy — Security V1 Summary

Status: APPROVED

## Core Authorization Rule

A request is allowed only when all relevant conditions are satisfied:

authenticated user
+
active account
+
role assignment
+
action permission
+
branch scope
+
relationship scope
+
record-state rule

## Canonical Roles

- SUPER_ADMIN
- BRANCH_ADMIN
- ACADEMIC_ADMIN
- FINANCE
- TEACHER
- STUDENT
- PARENT

## Security Principles

1. UI visibility is not security.
2. Backend authorization must be enforced through Server Actions, RPC, PostgreSQL functions, grants, and RLS.
3. SUPER_ADMIN remains globally authorized but still requires an authenticated, active account.
4. Branch scope must not rely only on students.default_branch_id.
5. Teacher access must be based on actual class/session relationships.
6. Parent access must require explicit active parent-student relationship.
7. Student access must be restricted to own records.
8. Financial writes must use authorized RPC/workflows rather than direct unrestricted DML.
9. SECURITY DEFINER functions must use explicit safe search_path and internal authorization.
10. Sensitive actions require auditability.

## High-Risk Areas

- Finance
- Payroll
- Refund / void operations
- Parent/student privacy
- Teacher cross-class access
- Branch data leakage
- Security-definer functions
- Role/permission assignment

## Implementation Status

Security Phase 0–1:
IMPLEMENTED

Current foundation includes:
- ACTIVE account checks
- role/permission foundation
- global/branch scope foundation
- relationship foundation
- SUPER_ADMIN backward compatibility
- selected financial DML hardening

Branch-scope rollout remains incremental.

## Source Specification

See:
`VIBE_Security_Role_Architecture_V1.docx`
