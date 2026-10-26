-- Admin-only audit journal. No application grants or student writes.
create schema if not exists maintenance_private;

create table maintenance_private.production_rollout_batches (
  batch_key text primary key,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  project_ref text not null,
  state text not null check (state in ('RUNNING', 'PARTIAL_WITH_HOLDS', 'DONE', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table maintenance_private.production_rollout_actions (
  batch_key text not null references maintenance_private.production_rollout_batches(batch_key),
  action_key text not null,
  target_table text not null check (target_table = 'public.legacy_student_opening_rows'),
  target_id uuid not null,
  source_excel_row integer not null check (source_excel_row > 5),
  preimage jsonb not null,
  postimage jsonb not null,
  before_hash text not null check (before_hash ~ '^[0-9a-f]{64}$'),
  after_hash text not null check (after_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'APPLIED' check (state = 'APPLIED'),
  applied_at timestamptz not null default now(),
  primary key (batch_key, action_key),
  unique (batch_key, target_id)
);

alter table maintenance_private.production_rollout_batches enable row level security;
alter table maintenance_private.production_rollout_actions enable row level security;
revoke all on maintenance_private.production_rollout_batches from public, anon, authenticated, service_role;
revoke all on maintenance_private.production_rollout_actions from public, anon, authenticated, service_role;
