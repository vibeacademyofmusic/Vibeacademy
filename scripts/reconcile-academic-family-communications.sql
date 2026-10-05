-- Reviewed reconciliation for migration 20260928200000.
-- Use only after the catalog assertions below succeed. This file does not
-- create, replace, or drop learning_conversations. It records the version
-- when the existing objects already are that migration's result.
begin;

do $reconcile$
declare
  column_list text;
  constraint_list text;
  anon_select boolean;
  auth_select boolean;
  conversations bigint;
  messages bigint;
begin
  select string_agg(column_name || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by ordinal_position)
    into column_list
  from information_schema.columns
  where table_schema = 'public' and table_name = 'learning_conversations';

  if column_list is distinct from
    'id:uuid:NO:gen_random_uuid(),kind:text:NO:,entity_id:uuid:NO:,source_version:int4:NO:,student_id:uuid:NO:,branch_id:uuid:NO:,state:text:NO:''OPEN''::text,assignee_id:uuid:YES:,version:int4:NO:1,created_by:uuid:NO:,created_at:timestamptz:NO:now(),updated_at:timestamptz:NO:now()'
  then
    raise exception 'LEARNING_CONVERSATIONS_COLUMNS_DIFFER: %', column_list;
  end if;

  select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname)
    into constraint_list
  from pg_constraint
  where conrelid = 'public.learning_conversations'::regclass;

  if constraint_list is distinct from
    'learning_conversations_assignee_id_fkey:FOREIGN KEY (assignee_id) REFERENCES profiles(id)|learning_conversations_branch_id_fkey:FOREIGN KEY (branch_id) REFERENCES branches(id)|learning_conversations_created_by_fkey:FOREIGN KEY (created_by) REFERENCES profiles(id)|learning_conversations_kind_check:CHECK ((kind = ANY (ARRAY[''REPORT''::text, ''FEEDBACK''::text])))|learning_conversations_kind_entity_id_source_version_key:UNIQUE (kind, entity_id, source_version)|learning_conversations_pkey:PRIMARY KEY (id)|learning_conversations_state_check:CHECK ((state = ANY (ARRAY[''OPEN''::text, ''IN_PROGRESS''::text, ''RESOLVED''::text])))|learning_conversations_student_id_fkey:FOREIGN KEY (student_id) REFERENCES students(id)'
  then
    raise exception 'LEARNING_CONVERSATIONS_CONSTRAINTS_DIFFER: %', constraint_list;
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.learning_conversations'::regclass and relrowsecurity and not relforcerowsecurity
  ) then
    raise exception 'LEARNING_CONVERSATIONS_RLS_DIFFERS';
  end if;

  if exists (select 1 from pg_policy where polrelid = 'public.learning_conversations'::regclass) then
    raise exception 'LEARNING_CONVERSATIONS_UNEXPECTED_POLICY';
  end if;

  select has_table_privilege('anon', 'public.learning_conversations', 'SELECT'),
         has_table_privilege('authenticated', 'public.learning_conversations', 'SELECT')
    into anon_select, auth_select;
  if anon_select or auth_select then
    raise exception 'LEARNING_CONVERSATIONS_PRIVILEGE_DIFFERS';
  end if;

  if to_regprocedure('public.learning_conversation_read(text,uuid)') is null
     or to_regprocedure('public.learning_conversation_write(text,uuid,uuid,integer,text,boolean,boolean,uuid)') is null
     or to_regprocedure('public.learning_report_document(uuid)') is null
     or to_regprocedure('public.learning_source_access(text,uuid)') is null
  then
    raise exception 'LEARNING_CONVERSATION_FUNCTION_MISSING';
  end if;

  if (select count(*) from notification_templates
      where template_key in ('LEARNING_REPORT_THREAD_UPDATED','LESSON_FEEDBACK_UPDATED','LESSON_FEEDBACK_REQUESTED')
        and provider = 'ZALO' and status = 'PENDING' and enabled = false) <> 3
  then
    raise exception 'LEARNING_CONVERSATION_TEMPLATES_DIFFER';
  end if;

  select count(*) into conversations from public.learning_conversations;
  select count(*) into messages from public.learning_conversation_messages;
  if conversations is null or messages is null then
    raise exception 'LEARNING_CONVERSATION_COUNTS_UNREADABLE';
  end if;
end
$reconcile$;

insert into supabase_migrations.schema_migrations(version, name)
select '20260928200000', 'academic_family_communications'
where not exists (
  select 1 from supabase_migrations.schema_migrations where version = '20260928200000'
);

commit;
