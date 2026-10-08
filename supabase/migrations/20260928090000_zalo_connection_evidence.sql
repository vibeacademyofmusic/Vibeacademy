begin;
create table if not exists notification_private.zalo_connection_checks (
 app_id text not null, oa_id text not null, source text not null check(source in ('MAIN','REFERENCE')),
 checked_at timestamptz not null default clock_timestamp(),
 result text not null check(result ~ '^[A-Z][A-Z0-9_-]{1,79}$'),
 http_status integer, provider_error integer, oa_matches boolean,
 primary key(app_id,oa_id,source)
);
alter table notification_private.zalo_connection_checks enable row level security;
revoke all on notification_private.zalo_connection_checks from public,anon,authenticated,service_role;
create or replace function public.zalo_connection_evidence(p_app text,p_oa text,p_source text default null,p_result text default null,p_http integer default null,p_error integer default null,p_match boolean default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_result is not null then
  insert into notification_private.zalo_connection_checks(app_id,oa_id,source,result,http_status,provider_error,oa_matches)
  values(p_app,p_oa,p_source,p_result,p_http,p_error,p_match)
  on conflict(app_id,oa_id,source) do update set checked_at=clock_timestamp(),result=excluded.result,http_status=excluded.http_status,provider_error=excluded.provider_error,oa_matches=excluded.oa_matches;
 end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by checked_at desc),'[]'::jsonb) into result from notification_private.zalo_connection_checks c where app_id=p_app and oa_id=p_oa;
 return result;
end $$;
revoke all on function public.zalo_connection_evidence(text,text,text,text,integer,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.zalo_connection_evidence(text,text,text,text,integer,integer,boolean) to service_role;
commit;
