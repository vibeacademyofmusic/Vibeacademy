const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs')
function sql(input){return cp.execFileSync('docker',['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'})}
function worker(){return new Promise((resolve,reject)=>{const events=[];const c=cp.fork('tests/helpers/zalo-renewal-process.cjs',[],{silent:true});c.on('message',m=>events.push(m));c.on('exit',code=>code===0?resolve(events):reject(Error('Fixture process failed')));c.on('error',reject)})}
test('real PostgreSQL: two processes, encrypted rotation, restart and second cycle with no browser',async()=>{
 const filter="app_id='777770000000001' and oa_id='777770000000002'"
 assert.equal(sql('select count(*) from notification_private.zalo_credentials where '+filter).trim(),'0','fixture must not preexist')
 try {
  sql("select public.zalo_credential_command('BOOTSTRAP','777770000000001','777770000000002',p_access=>'fixture-access-1',p_refresh=>'fixture-refresh-1');")
  const results=await Promise.all([worker(),worker()]),events=results.flat();assert.equal(events.filter(e=>e.kind==='refresh').length,1);assert.deepEqual(events.filter(e=>e.kind==='result').map(e=>e.version),[2,2])
  assert.equal(sql("select access_token like 'enc:v1:%' and refresh_token like 'enc:v1:%' and access_token not like '%fixture-access%' from notification_private.zalo_credentials where "+filter).trim(),'t')
  const restarted=await worker();assert.equal(restarted.filter(e=>e.kind==='refresh').length,0);assert.equal(restarted.find(e=>e.kind==='result').version,2)
  sql("update notification_private.zalo_credentials set expires_at=clock_timestamp()-interval '1 minute' where "+filter)
  const second=await worker();assert.equal(second.find(e=>e.kind==='refresh').used,'fixture-refresh-2');assert.equal(second.find(e=>e.kind==='result').version,3)
 }finally {sql('delete from notification_private.zalo_credentials where '+filter)}
})
test('private storage and OAuth state access restrictions, expiry/replay and identity binding',()=>{
 const out=sql(fs.readFileSync('supabase/tests/database/zalo_automatic_renewal_test.sql','utf8'));assert.doesNotMatch(out,/(^|\n)not ok|Looks like you/);assert.match(out,/ok 10/)
})
