"""Read-only aggregate comparison; never prints row values or credentials."""
import subprocess,json,pathlib,hashlib,datetime
CONTAINER='supabase_db_vibe-academy-system'
OUT=pathlib.Path('docs/verification/system-pilot-20260928T032001Z/raw')
def query(db,sql):
 return subprocess.check_output(['docker','exec',CONTAINER,'psql','-U','supabase_admin','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',sql],text=True).strip()
def snapshot(db):
 tables=query(db,"select quote_ident(n.nspname)||'.'||quote_ident(c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','auth','storage','supabase_migrations') order by 1").splitlines()
 rows={}
 for table in tables:
  count,digest=query(db,f"select count(*),md5(coalesce(string_agg(h,'' order by h),'')) from (select md5(row_to_json(t)::text) h from {table} t) r").split('|')
  rows[table]={'rows':int(count),'digest':digest}
 return rows
source=snapshot('postgres'); restored=snapshot('vibe_pilot_restore_20260928_032001')
result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'postgres','restore':'vibe_pilot_restore_20260928_032001','tables':len(source),'mismatches':[t for t in source.keys()|restored.keys() if source.get(t)!=restored.get(t)],'source':source,'restored':restored}
(OUT/'restore-row-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['source','restored']}))
