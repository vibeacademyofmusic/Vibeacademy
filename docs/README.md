# VIBE Academy System — Project Documentation

This folder contains the approved architecture, deployment, migration, and e-learning specifications for the VIBE Academy System.

## Documentation Status

### Security
- `security/VIBE_Security_Role_Architecture_V1.docx`
  - Status: APPROVED
  - Purpose: Security, roles, permissions, RLS, RPC authorization, audit, and go-live security requirements.

### Deployment
- `deployment/VIBE_Internal_Production_Deployment_Specification_V1.docx`
  - Status: APPROVED
  - Purpose: Local → Staging → Production architecture, Vercel, Supabase Cloud, migration, cutover, pilot, rollback, and operational rollout.

### Migration
- `migration/VIBE_Legacy_Student_Migration_Specification_V1.docx`
  - Status: APPROVED
  - Purpose: Legacy student/current-state migration, academic baseline, tuition opening state, debt/opening balance, reconciliation, rollback, and audit.

### E-learning
- `elearning/VIBE_Academy_Music_Theory_Elearning_Curriculum_Specification_V1.docx`
  - Status: OWNER REVIEWED
  - Purpose: Music Theory Grade 1–5 curriculum architecture based on the textbook Contents structure.

- `elearning/VIBE_Academy_Music_Theory_Elearning_Owner_Review_Pack_V1.docx`
  - Status: OWNER APPROVED
  - Purpose: Grade 1 detailed implementation review and owner decisions D01–D14.

## Canonical Rules

1. Codex must read the relevant specification before implementing a major feature.
2. Approved specifications are treated as project contracts unless superseded.
3. Do not invent business rules when the specification already defines them.
4. Music Theory E-learning must follow the textbook Contents structure.
5. Missing source content must remain marked as missing; do not infer or fabricate it.
6. Security must be enforced in backend/RLS/RPC/server actions, not only by UI visibility.
7. Migration must use current/opening state and must not fabricate historical records.
8. Production deployment must pass reconciliation, security, and restore checks before rollout.

## Status Values

- DRAFT
- REVIEW
- OWNER_APPROVED
- APPROVED
- IMPLEMENTED
- SUPERSEDED
- SOURCE_MISSING

## Usage

Before implementation, Codex should inspect:
- this README
- the relevant specification document
- any related decision records in `docs/decisions/`
