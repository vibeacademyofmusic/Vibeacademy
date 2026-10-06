-- Isolated PostgreSQL dependency fixture. No production/customer data or provider credentials.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
create function public.has_role(text) returns boolean language sql stable as $$ select current_setting('test.owner',true)='yes' $$;
create table profiles(id uuid primary key,full_name text,status text);
create table students(id uuid primary key,full_name text);
create table branches(id uuid primary key);
create table parents(id uuid primary key,user_id uuid,status text);
create table student_parents(parent_id uuid,student_id uuid,is_active boolean,is_primary boolean,valid_from timestamptz,valid_until timestamptz);
create table customer_channel_links(id uuid primary key,provider text,provider_user_id text,parent_id uuid,student_id uuid,registration_application_id uuid,status text,linked_at timestamptz,consent_at timestamptz,created_at timestamptz default now());
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table learning_reports(id uuid primary key,student_id uuid,branch_id uuid,status text,version integer,report_type text,period_start date,period_end date,snapshot_data jsonb,approved_at timestamptz,approved_by uuid);
create table learning_report_events(id uuid primary key default gen_random_uuid(),report_id uuid references learning_reports(id),event text,version integer,actor_id uuid not null references auth.users(id),created_at timestamptz default now());
create table registration_zalo_phone_consents(id uuid,application_id uuid,revoked_at timestamptz,consented_at timestamptz,normalized_phone text,notice_version text);
