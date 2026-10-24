begin;
-- Same credential table/RPC; encrypt values with a key protected by Supabase Vault.
-- No business data or notification gate changes.
alter table notification_private.zalo_credentials add column last_refreshed_at timestamptz;
alter table notification_private.zalo_credentials add column refresh_expires_at timestamptz;
do $$ begin
 if not exists(select 1 from vault.secrets where name='vibe_zalo_credentials_v1') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'vibe_zalo_credentials_v1','Zalo credential encryption key');
 end if;
end $$;
create function notification_private.zalo_encrypt(v text) returns text language sql security definer set search_path='' as $$
 select case when v is null then null else 'enc:v1:'||encode(extensions.pgp_sym_encrypt(v,(select decrypted_secret from vault.decrypted_secrets where name='vibe_zalo_credentials_v1'),'cipher-algo=aes256'),'base64') end
$$;
create function notification_private.zalo_decrypt(v text) returns text language sql security definer set search_path='' as $$
 select case when v is null then null else extensions.pgp_sym_decrypt(decode(substr(v,8),'base64'),(select decrypted_secret from vault.decrypted_secrets where name='vibe_zalo_credentials_v1')) end
$$;
revoke all on function notification_private.zalo_encrypt(text),notification_private.zalo_decrypt(text) from public,anon,authenticated,service_role;
update notification_private.zalo_credentials set access_token=notification_private.zalo_encrypt(access_token),refresh_token=notification_private.zalo_encrypt(refresh_token);
create or replace function public.zalo_credential_command(
 p_action text, p_app text, p_oa text, p_version bigint default null,
 p_operation uuid default null, p_access text default null, p_refresh text default null,
 p_expires_at timestamptz default null, p_error text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c notification_private.zalo_credentials; result jsonb;
begin
 if p_app is null or p_app !~ '^[0-9]{8,32}$' or p_oa is null or p_oa !~ '^[0-9]{8,32}$' then raise exception 'INVALID_IDENTITY'; end if;
 if p_action='BOOTSTRAP' then
  insert into notification_private.zalo_credentials(app_id,oa_id,access_token,refresh_token,expires_at,state,error_code)
  values(p_app,p_oa,notification_private.zalo_encrypt(nullif(p_access,'')),notification_private.zalo_encrypt(nullif(p_refresh,'')),p_expires_at,
   case when nullif(p_refresh,'') is null then 'REAUTH_REQUIRED' else 'NEEDS_REFRESH' end,
   case when nullif(p_refresh,'') is null then 'ZALO_REFRESH_TOKEN_MISSING' else null end)
  on conflict do nothing;
 end if;
 select * into c from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa for update;
 c.access_token := notification_private.zalo_decrypt(c.access_token);
 c.refresh_token := notification_private.zalo_decrypt(c.refresh_token);
 if p_action='READ' or p_action='BOOTSTRAP' then
  if c.app_id is null then return null; end if;
  return to_jsonb(c);
 end if;
 if p_action in ('REPLACE','REAUTH_CLAIM') and c.app_id is null and p_version=0 then
  insert into notification_private.zalo_credentials(app_id,oa_id,state) values(p_app,p_oa,'REAUTH_REQUIRED') on conflict do nothing;
  select * into c from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa for update;
  if c.version<>1 or c.access_token is not null then return jsonb_build_object('state','STALE'); end if;
 elsif c.version is distinct from p_version then return jsonb_build_object('state','STALE');
 end if;
 if p_action='REAUTH_CLAIM' then
  if p_operation is null then raise exception 'INVALID_OPERATION'; end if;
  if c.state='REFRESHING' and c.operation_started_at>clock_timestamp()-interval '1 minute' then return jsonb_build_object('state','BUSY'); end if;
  update notification_private.zalo_credentials set state='REFRESHING',operation_id=p_operation,operation_started_at=clock_timestamp(),error_code=null,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','CLAIMED','version',c.version);
 elsif p_action='CLAIM' then
  -- A lease is never stolen: a single-use refresh may already have been consumed.
  if c.state not in ('READY','NEEDS_REFRESH') or c.operation_id is not null then return jsonb_build_object('state','BUSY_OR_BLOCKED'); end if;
  if c.refresh_token is null or p_operation is null then return jsonb_build_object('state','REAUTH_REQUIRED'); end if;
  update notification_private.zalo_credentials set state='REFRESHING',operation_id=p_operation,
   operation_started_at=clock_timestamp(),error_code=null,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','CLAIMED');
 elsif p_action='COMMIT' then
  if c.committed_operation=p_operation and c.state='READY' then return jsonb_build_object('state','COMMITTED'); end if;
  if c.state<>'REFRESHING' or c.operation_id is distinct from p_operation then return jsonb_build_object('state','STALE'); end if;
 elsif p_action='REPLACE' then
  if c.refresh_token is not null and c.refresh_token=p_refresh then return jsonb_build_object('state','REAUTH_REQUIRED'); end if;
  -- Reauthorization must not race an in-flight refresh. An old uncertain lock can
  -- only be replaced explicitly after the 15s network timeout has passed.
  if c.state='REFRESHING' and c.operation_started_at>clock_timestamp()-interval '1 minute' then return jsonb_build_object('state','BUSY'); end if;
 elsif p_action='VERIFY' then
  if c.state<>'VERIFYING' then return jsonb_build_object('state','STALE'); end if;
  update notification_private.zalo_credentials set state='READY',error_code=null,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','VERIFIED');
 elsif p_action='BLOCK' then
  if p_error is null or p_error not in ('ZALO_TOKEN_INVALID','ZALO_PROOF_INVALID','ZALO_REFRESH_UNCERTAIN','ZALO_RECONNECT_REQUIRED','ZALO_REFRESH_TOKEN_MISSING') then raise exception 'INVALID_ERROR'; end if;
  if p_operation is null and c.state='REFRESHING' then return jsonb_build_object('state','STALE'); end if;
  if p_operation is not null and c.operation_id is distinct from p_operation then return jsonb_build_object('state','STALE'); end if;
  update notification_private.zalo_credentials set state=case
   when p_error='ZALO_TOKEN_INVALID' and refresh_token is not null then 'NEEDS_REFRESH'
   when p_error='ZALO_PROOF_INVALID' then 'PROOF_INVALID'
   when p_error='ZALO_REFRESH_UNCERTAIN' then 'UNCERTAIN' else 'REAUTH_REQUIRED' end,
   error_code=p_error,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','BLOCKED');
 else raise exception 'INVALID_COMMAND';
 end if;
 if nullif(btrim(p_access),'') is null or nullif(btrim(p_refresh),'') is null or length(p_access)>8192 or length(p_refresh)>8192 then raise exception 'INVALID_CREDENTIAL_PAIR'; end if;
 if (p_action='COMMIT' or p_expires_at is not null) and (p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '26 hours') then raise exception 'INVALID_EXPIRY'; end if;
 update notification_private.zalo_credentials set access_token=notification_private.zalo_encrypt(p_access),refresh_token=notification_private.zalo_encrypt(p_refresh),expires_at=p_expires_at,
  last_refreshed_at=case when p_action='COMMIT' then clock_timestamp() else last_refreshed_at end,
  refresh_expires_at=clock_timestamp()+interval '3 months',
  version=c.version+1,state=case when p_action='REPLACE' and p_expires_at is null then 'NEEDS_REFRESH' else 'VERIFYING' end,
  operation_id=null,operation_started_at=null,committed_operation=p_operation,error_code=null,updated_at=clock_timestamp()
 where app_id=p_app and oa_id=p_oa;
 return jsonb_build_object('state','COMMITTED');
end $$;
revoke all on function public.zalo_credential_command(text,text,text,bigint,uuid,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.zalo_credential_command(text,text,text,bigint,uuid,text,text,timestamptz,text) to service_role;

create table notification_private.zalo_scheduler (
 id boolean primary key default true check(id), checked_at timestamptz not null,
 result text not null, next_check_at timestamptz not null
);
alter table notification_private.zalo_scheduler enable row level security;
revoke all on notification_private.zalo_scheduler from public,anon,authenticated,service_role;
create function public.zalo_scheduler_health(p_result text default null,p_interval integer default 600)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_result is not null then
  if p_result !~ '^[A-Z][A-Z0-9_-]{1,79}$' or p_interval<60 or p_interval>3600 then raise exception 'INVALID_HEALTH'; end if;
  insert into notification_private.zalo_scheduler values(true,clock_timestamp(),p_result,clock_timestamp()+make_interval(secs=>p_interval))
  on conflict(id) do update set checked_at=excluded.checked_at,result=excluded.result,next_check_at=excluded.next_check_at;
 end if;
 return (select to_jsonb(s)-'id' from notification_private.zalo_scheduler s where id);
end $$;
revoke all on function public.zalo_scheduler_health(text,integer) from public,anon,authenticated;
grant execute on function public.zalo_scheduler_health(text,integer) to service_role;

create table notification_private.zalo_oauth_states (
 state_hash text primary key, administrator uuid not null references auth.users(id),
 app_id text not null,oa_id text not null,version bigint not null,verifier text not null,
 expires_at timestamptz not null,consumed_at timestamptz
);
alter table notification_private.zalo_oauth_states enable row level security;
revoke all on notification_private.zalo_oauth_states from public,anon,authenticated,service_role;
create function public.zalo_oauth_state(p_action text,p_hash text,p_user uuid,p_app text,p_oa text,p_verifier text default null,p_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s notification_private.zalo_oauth_states;
begin
 if p_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_user and r.code='SUPER_ADMIN') then raise exception 'OAUTH_DENIED'; end if;
 if p_action='CREATE' then
  if p_verifier is null or length(p_verifier)<>43 or p_version is null then raise exception 'OAUTH_INVALID'; end if;
  delete from notification_private.zalo_oauth_states where expires_at<clock_timestamp()-interval '1 day';
  insert into notification_private.zalo_oauth_states values(p_hash,p_user,p_app,p_oa,p_version,notification_private.zalo_encrypt(p_verifier),clock_timestamp()+interval '10 minutes',null);
  return jsonb_build_object('state','CREATED');
 elsif p_action='CONSUME' then
  select * into s from notification_private.zalo_oauth_states where state_hash=p_hash for update;
  if s.administrator is distinct from p_user or s.app_id is distinct from p_app or s.oa_id is distinct from p_oa or s.consumed_at is not null or s.expires_at<=clock_timestamp() then raise exception 'OAUTH_INVALID'; end if;
  update notification_private.zalo_oauth_states set consumed_at=clock_timestamp() where state_hash=p_hash;
  return jsonb_build_object('verifier',notification_private.zalo_decrypt(s.verifier),'version',s.version);
 end if;
 raise exception 'OAUTH_INVALID';
end $$;
revoke all on function public.zalo_oauth_state(text,text,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.zalo_oauth_state(text,text,uuid,text,text,text,bigint) to service_role;
commit;
