"""Sequential local gates, preserving failures instead of short-circuiting evidence."""
import pathlib,subprocess,json,datetime,time,hashlib
out=pathlib.Path('docs/verification/system-pilot-20260928T032001Z');records=[]
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],text=True).splitlines()
runtime=[p for p in sorted(set(files)) if pathlib.Path(p).is_file() and (p.startswith(('app/','lib/','public/','supabase/migrations/')) or p in ['package.json','package-lock.json','next.config.ts','tsconfig.json','eslint.config.mjs'])]
fingerprint=hashlib.sha256('\n'.join(p+':'+hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in runtime).encode()).hexdigest()
commands=[('typecheck',['npm','run','typecheck']),('lint',['npx','eslint','.','--format','json','--output-file',str(out/'raw/lint-final.json')]),('node',['node','--test','--test-concurrency=1',*map(str,sorted(pathlib.Path('tests').glob('*.test.cjs'))),*map(str,sorted(pathlib.Path('tests').glob('*.test.mjs')))]),('db',['npx','supabase','test','db']),('build',['npm','run','build'])]
for name,args in commands:
 start=time.monotonic(); at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (out/f'raw/{name}-final.log').open('w') as log:r=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
 record={'name':name,'command':args,'started_at':at,'elapsed_seconds':round(time.monotonic()-start,3),'exit_code':r.returncode,'fingerprint':fingerprint,'evidence':f'raw/{name}-final.log'}
 records.append(record);(out/'gates.json').write_text(json.dumps(records,indent=2)+'\n');print(name,r.returncode,flush=True)
