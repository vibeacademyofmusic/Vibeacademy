# Local reconciliation and upgrade procedure

This procedure targets disposable local clones only. It is not authorization to change a shared database. It preserves the source and stops when an input or object contract cannot be verified.

## Reproduce the isolated platform

Run from the repository root:

```sh
python3 scripts/pilot/prepare-isolated.py
SUPABASE_DISABLE_TELEMETRY=1 node_modules/.bin/supabase start --workdir /private/tmp/vibe-execution-20260930
node scripts/pilot/isolated-platform-check.cjs
```

The fixed project ID is `vibe-execution-20260930`; API, database, Studio and captured-mail ports are 56321, 56322, 56323 and 56324. Auth, PostgREST, gateway, Storage and local mail are real platform services. Analytics, vector Storage and edge runtime are not required by these application migrations and are disabled in this test configuration. The existing projects on 543xx and 553xx are not reset. The initializer refuses an incompatible existing configuration; `supabase start` does not upgrade an already running stack. For a different source revision, use a new isolated project ID and unused ports, rather than silently overwriting the recorded test stack.

Keep the generated migration manifest with the evidence. The execution stack was created from 191 migrations through `20260929220000`. The pause/makeup foundation is now included with the two forward repairs `20260930100000` and `20260930101000`. A second disposable project on 573xx ports replayed all 193 migrations normally from zero; its ledger and internal-helper privilege checks are in `raw/final-migration-privileges.log`. The two repairs were also applied transactionally to the existing isolated execution stack, with application records retained. That stack still has its original 191-entry ledger: direct SQL rehearsal is not a falsely recorded migration-ledger upgrade. No shared stack was migrated.

The platform probe creates only an `example.test` local Auth user and a synthetic private Storage object. It does not send invitations, read user browser sessions, grant application roles or save passwords. HTTP is limited to the exact isolated API origin. It checks password sign-in, exact downloaded bytes and rejection of an unprivileged read. It retains the synthetic object for inspection; it is not a restore of source files.

## Inputs needed for a preserving restore

Capture one consistent source recovery set before rehearsing an upgrade: public and private application schemas/functions/data, Auth schemas/users/identities, Storage metadata, migration ledger, owners, grants, default privileges, RLS policies, extensions and relevant platform versions. Preserve role mappings and user IDs; creating replacement users does not restore existing references or permissions. Service configuration, JWT signing material and Vault encryption keys require a separate protected recovery plan. Do not place them in Git or logs.

**Database metadata and Storage object bytes are different assets.** `storage.objects` identifies objects and ownership; it does not contain the uploaded files. Back up the object store separately with a manifest of bucket, path, version where available, length and content SHA-256. Reconcile that manifest against metadata at the same recovery boundary. Restore bytes into a private object store, verify each checksum and test signed/download access with the original permissions. Bucket public flags and policies must be preserved. A public-schema dump, or even a complete database dump without object bytes, is not full recovery.

The saved public dump used in the previous experiment is insufficient: it has no real Auth data, no Storage schema/bytes, no migration ledger and no private trigger implementations. Its 20 substitutes all have body MD5 `c86e1272f9dbdfdc013ed94c4b8f92c9`. They allow writes that the original guards may forbid. Never use that restored database as an upgrade source or as evidence of preserved authorization.

## Diagnose before applying SQL

1. Restore the complete set into a newly named local clone using the matching platform roles, extensions and database version. Keep the original backup and snapshot unchanged. Preserve owners and ACLs; do not solve owner errors with a blanket `--no-owner`, dropped policies, disabled constraints or invented trigger bodies.
2. Run `scripts/pilot/upgrade-preflight.sql` with `ON_ERROR_STOP=1`. It requires real Auth users/identities/sessions, Storage buckets/objects, migration ledger and JWT-backed `auth.uid`, and rejects the known placeholder trigger bodies. It is a prerequisite check, not proof of backup completeness. Independently verify all Auth references, all foreign keys and object bytes.
3. Capture `scripts/pilot/drift-catalogue.sql` from that clone and a clean reference built from the pinned migration files. Compare columns/defaults, constraints/indexes, RLS and policy role names, triggers, function arguments/results/body/security/search path, owners and ACLs. The script is read-only and does not inspect user credentials.
4. Compare **every ledger version** with the source files. Do not infer a continuous history from the maximum version. The saved source ledger has 150 entries and 41 missing local versions. It has holes below its maximum `20260923052000`, including `20260922310000`.

The specific collision is not just an existing function name. Missing `20260922310000` creates `registration_zalo_connection(p_registration uuid)` with four output fields. The installed function uses `p_application` and five fields, reflecting a later replacement. Its body MD5 is `8b7f3b87027d97f8adb92efd7b9f678f`; the current repository's `20260923040000` body is `40519529fc5c0195078462abf3ca8d26`. The installed body raises separate errors for nonexistent and out-of-scope registrations; the repository body returns an empty result for both. The three other admin projections from the missing migration are absent. Therefore neither replaying the old function nor marking the entire version applied establishes reconciliation.

## Reconcile and upgrade transactionally

Classify each missing version as absent, fully equivalent, superseded, or partial/conflicting. Compare the expected historical effects as well as the canonical final contract; a latest clean schema is not automatically the expected intermediate schema. Explicitly account for out-of-order versions and for later migrations that intentionally replace an earlier object.

For a fully equivalent version, create a reviewed, version-specific reconciliation transaction with assertions for **all** its effects: full function definitions and ACLs, both parent and child tables, policies, constraints, indexes, triggers and any data changes. Only after those checks succeed may it insert the ledger entry. Function existence alone is insufficient. The existing conversation reconciliation script is not by itself this stronger proof: it checks existence of four functions, not their complete definitions or the complete child-table contract.

For the partial Zalo version, a reproducible reconciliation needs an explicit, reviewed SQL transaction that:

- Asserts the complete restored platform and original ledger entries, the exact installed function body/signature/owner/ACL, and the absence or exact expected definitions of the three projections.
- Creates the missing projections from pinned canonical source, with the original restricted grants.
- Handles the superseded connection function explicitly. Preserve its installed signature and permissions while bringing its body to the approved canonical contract in a separate asserted repair step; never replay the incompatible four-field declaration or silently omit it from a migration.
- Verifies all postconditions before recording the reconciled migration version, preserving an audit record of source file hashes and the repair SQL. An unexpected object, body or privilege aborts the transaction.

That repair has **not** been applied or certified against the source: the available source recovery set is incomplete. Do not extrapolate the earlier hand-edited three-function experiment into a verified upgrade. No shared ledger repair or migration was run in this execution.

Once reconciled, apply each genuinely absent migration in order with errors fatal and its ledger update in the same transaction. Keep original migration files immutable. Stop at the first failure, inspect the catalog and roll back that step; do not resume by deleting failing statements, using blanket `IF NOT EXISTS`, dropping dependent functions with `CASCADE` or recording a version without proving its effects. Migrations that cannot be transactional need their own reviewed resumable procedure.

Before and after, compare every original business record ID and stable-value digest, counts and amounts for students, payments, allocations and conversations/messages, Auth IDs and role/branch mappings, FK validity and explicit grant/RLS/function ACL contracts. Expected transformations must be listed individually; counts alone cannot prove preservation. New tables must not hide lost rows. Re-run authorization and synthetic workflow tests using existing approved roles, with external traffic blocked.

Repeat the entire restore/reconcile/upgrade on a second untouched clone. Re-running the completed reconciliation must produce a verified no-op; changing a guard input must abort without a ledger entry or data change. Restore a pre-upgrade recovery set into a separate clone for rollback rehearsal and verify database records, object bytes and permissions again. Application rollback requires a compatible source revision; it does not reverse SQL migrations or recover files.

## Pending workflow protection and payment permissions

The local app on port 3000 now runs with `ZALO_PILOT_OUTBOUND=disabled` and `NODE_OPTIONS=--require=/Users/macbookair/vibe-academy-system/scripts/pilot/local-network-guard.cjs`. This test-only preload blocks non-loopback fetch and TCP connections, including Zalo, PayOS and MoMo, and rejects redirects. It is not imported into deployment code. Its test verifies blocked provider calls and a working loopback request. Database tests use the separate 563xx stack and roll back their fixtures.

The user must authenticate normally in the controlled Chrome tab before UI tests. Verify navigation to a protected page and reload that page successfully; do not equate a filled form, cookie presence or a service-role API probe with authenticated browser navigation. Do not copy cookies, impersonate the user or use stored synthetic passwords to bypass this handoff.

Counter receipts call `create_payment_once`, which delegates to `create_payment`; the latter requires `SUPER_ADMIN` before writing. `FINANCE`, `BRANCH_ADMIN` and ordinary reception `STAFF` cannot record these payments through that path under the current policy. Viewing a finance screen or having a named finance permission does not override the RPC's role check. This is an operational gap: intake staff need an existing authorized SUPER_ADMIN to complete a counter payment. No reception role was granted administrator access and no new authorization policy was introduced. Authenticated API denial tests and synthetic counter-to-receipt ownership checks are complete. The synthetic STAFF browser session authenticated normally, then `/admin/finance/payments` returned “Bạn không có quyền truy cập”. This is documented as an operational gap; only the owner may decide an intended replacement role policy. No permissions were expanded.
