create table maintenance_private.student_assignment_actions (
 batch_key text not null references maintenance_private.production_rollout_batches(batch_key),
 action_key text not null, target_table text not null check(target_table in ('public.student_curriculum_enrollments','public.enrollments')),
 target_id uuid not null, source_excel_row integer not null check(source_excel_row>5),
 preimage jsonb not null, postimage jsonb not null,
 before_hash text not null check(before_hash ~ '^[0-9a-f]{64}$'), after_hash text not null check(after_hash ~ '^[0-9a-f]{64}$'),
 applied_at timestamptz not null default now(), primary key(batch_key,action_key), unique(batch_key,target_id)
);
alter table maintenance_private.student_assignment_actions enable row level security;
revoke all on maintenance_private.student_assignment_actions from public,anon,authenticated;
comment on table maintenance_private.student_assignment_actions is 'Private audit for owner-authorized programme and class assignments; no application access.';
