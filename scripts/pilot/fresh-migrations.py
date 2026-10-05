import subprocess,pathlib,json,datetime,sys
root=pathlib.Path('.');out=root/'docs/verification/system-pilot-20260928T032001Z/raw'
records=[r for r in json.loads((out/'fresh-migrations.json').read_text()) if r['file'] < sys.argv[1]] if len(sys.argv)>1 else []
with (out/'fresh-migrations.log').open('a' if len(sys.argv)>1 else 'w') as log:
 for path in sorted((root/'supabase/migrations').glob('*.sql')):
  if len(sys.argv)>1 and path.name<sys.argv[1]: continue
  started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  result=subprocess.run(['docker','exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','vibe_pilot_fresh_20260928_032001','-v','ON_ERROR_STOP=1'],input=path.read_text(),text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  log.write('\nMIGRATION '+path.name+'\n'+result.stdout);log.flush()
  records.append({'file':path.name,'started_at':started,'exit_code':result.returncode})
  if result.returncode: print('FAILED',path.name,result.stdout[-1200:]);break
(out/'fresh-migrations.json').write_text(json.dumps(records,indent=2)+'\n')
print('Applied',sum(r['exit_code']==0 for r in records),'of',len(list((root/'supabase/migrations').glob('*.sql'))))

if any(r['exit_code'] for r in records): sys.exit(1)
