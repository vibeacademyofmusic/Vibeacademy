// Real two-connection race tests, restricted to the disposable GitHub CI database.
// Synthetic ledger records remain until CI destroys this database; never delete receipts.
const { execFileSync, spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')
assert.equal(process.env.GITHUB_ACTIONS,'true','Only run on the disposable GitHub Actions database')
const args=['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-XAtq','-v','ON_ERROR_STOP=1']
const query=sql=>execFileSync('docker',args,{input:sql,encoding:'utf8'}).trim()
const auth="select set_config('request.jwt.claim.sub','e9500000-0000-4000-8000-000000000002',true); select set_config('request.jwt.claim.role','authenticated',true);"
function session(sql, held=false) {
  const child=spawn('docker',args);let output='';let signal
  const ready=new Promise(resolve=>{signal=resolve})
  child.stdout.on('data',data=>{output+=data;if(output.includes('CASH_RACE_HELD'))signal()})
  child.stderr.on('data',data=>{output+=data})
  const done=new Promise(resolve=>child.on('close',code=>{signal();resolve({code,output})}))
  // psql consumes an open stdin pipe line by line: flush the complete batch
  // with a newline while keeping the transaction/connection alive for the race.
  if(held) child.stdin.write(sql+'\n');else child.stdin.end(sql+'\n')
  return {ready,done,finish:()=>child.stdin.end('commit;'),abort:()=>child.kill('SIGTERM')}
}
function application() {
  const id=randomUUID()
  query(`begin;${auth}
    select create_registration_application_with_academics('${id}',(select id from branches where code='V01'),null,
      'Synthetic race ${id}','2015-03-03','Synthetic parent','0909000001',
      'e9500000-0000-4000-8000-000000000020','e9500000-0000-4000-8000-000000000021','e9500000-0000-4000-8000-000000000022',current_date+7,'CN 09:00');
    select transition_registration_application('${randomUUID()}','${id}',1,'SUBMIT');
    select transition_registration_application('${randomUUID()}','${id}',2,'VERIFY');
    select set_registration_deposit_quote('${id}',3,(select id from tuition_plans where code='VIBE_3_MONTHS'),'NONE',0,null,'DEPOSIT_50');commit;`)
  return id
}
const cash=(app,request=randomUUID())=>`select record_counter_cash('${request}','REGISTRATION','${app}',2750000,0,true,current_date+30,'Synthetic CI race');`
async function race(firstSql,secondSql,expected) {
  const first=session(`begin;set local statement_timeout='15s';${auth}${firstSql}select 'CASH_RACE_HELD';`,true)
  let second,timer
  try {
    await Promise.race([first.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('First connection never acquired its locks')),20000)})])
    clearTimeout(timer)
    second=session(`begin;set local statement_timeout='15s';${auth}${secondSql}commit;`)
    // Verify a real blocked connection, without assuming a scheduling delay.
    const deadline=Date.now()+10000
    while(Date.now()<deadline) {
      if(Number(query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%record_counter_cash%'"))>0)break
      await new Promise(resolve=>setTimeout(resolve,50))
    }
    assert.ok(Number(query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'"))>0,'Second transaction must actually wait on the first')
    first.finish()
    const [a,b]=await Promise.all([first.done,second.done])
    assert.equal(a.code,0,a.output)
    if(expected==='duplicate'){assert.equal(b.code,0,b.output);assert.match(b.output,/duplicate/)}
    else {assert.notEqual(b.code,0,b.output);assert.match(b.output,new RegExp(expected))}
  } finally {clearTimeout(timer);first.abort();second?.abort()}
}
async function main() {
  assert.equal(query("select count(*) from auth.users where id='e9500000-0000-4000-8000-000000000002'"),'0','Fixture must be absent')
  query(`begin;${readFileSync('tests/fixtures/counter-cash.sql','utf8')}commit;`)
  const same=application(),key=randomUUID()
  await race(cash(same,key),cash(same,key),'duplicate')
  assert.equal(query(`select count(*) from counter_cash_receipts where application_id='${same}'`),'1')
  const stale=application()
  await race(cash(stale),cash(stale),'CASH_STALE_BALANCE')
  assert.equal(query(`select sum(amount) from counter_cash_receipts where application_id='${stale}'`),'2750000.00')
  const qr=application()
  await race(`select reserve_registration_payos_order('${qr}','${randomUUID()}',3);`,cash(qr),'CASH_ONLINE_ORDER_OPEN')
  assert.equal(query(`select count(*) from counter_cash_receipts where application_id='${qr}'`),'0')
  console.log('PASS: real concurrent retries, stale cash balance, and QR versus cash (3/3)')
}
main().catch(error=>{console.error(error);process.exitCode=1})
