-- Restore a missing source dependency of 20261026211911. This private audit
-- table already exists on production; schema verified from catalogs 2026-10-29.
-- Ordered immediately before its dependent migration for clean installations.
begin;
create schema if not exists maintenance_private;
create table if not exists maintenance_private.production_rollout_batches (
  batch_key text primary key,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  project_ref text not null,
  state text not null check (state in ('RUNNING','PARTIAL_WITH_HOLDS','DONE','FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table maintenance_private.production_rollout_batches enable row level security;
revoke all on maintenance_private.production_rollout_batches from public,anon,authenticated,service_role;
commit;
