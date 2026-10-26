// Opt-in real-connection check. Only a named isolated Docker database is allowed.
const fs=require('node:fs')
const {spawn,spawnSync}=require('node:child_process')
const assert=require('node:assert/strict')
const {literal}=require('./lib/production-rollout.cjs')
const {assertPlan,applySql}=require('./lib/production-rollout-sql.cjs')

async function main() {
  const args=process.argv.slice(2),options={}
  for(let i=0;i<args.length;i+=2) {
    if(!['--plan','--container','--database'].includes(args[i])||!args[i+1])throw Error('EXPECTED_PLAN_CONTAINER_DATABASE')
    options[args[i].slice(2)]=args[i+1]
  }
  if(!/^supabase_db_vibe-[a-z0-9-]+$/.test(options.container||'')||!/^caday_[a-z0-9_]+$/.test(options.database||''))throw Error('ISOLATED_DATABASE_REQUIRED')
  const plan=JSON.parse(fs.readFileSync(options.plan,'utf8'));assertPlan(plan)
  const command=['exec','-i','-u','postgres',options.container,'psql','-U','supabase_admin','-d',options.database,'-XAt','-v','ON_ERROR_STOP=1']
  const held=spawn('docker',command,{stdio:['pipe','pipe','pipe']})
  let out='',error=''
  held.stderr.on('data',c=>{error+=c})
  const done=new Promise(resolve=>held.on('close',code=>resolve(code)))
  const ready=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('LOCK_CHECKPOINT_TIMEOUT')),10000)
    held.stdout.on('data',c=>{out+=c;if(out.includes('ROLLOUT_LOCK_HELD')){clearTimeout(timeout);resolve()}})
    held.once('error',reject)
  })
  held.stdin.end(`begin;select pg_advisory_xact_lock(hashtextextended(${literal(plan.batch_key)},0));select 'ROLLOUT_LOCK_HELD';select pg_sleep(3);rollback;`)
  await ready
  const challenger=spawnSync('docker',command,{input:applySql(plan,plan.actions.slice(0,3)).replace(/commit;\s*$/i,'rollback;'),encoding:'utf8',timeout:10000})
  assert.notEqual(challenger.status,0)
  assert.match(challenger.stderr,/ROLLOUT_BATCH_BUSY/)
  assert.equal(await done,0,error)
  console.log('PASS: concurrent connection refused by the database batch lock; challenger uses ROLLBACK and creates no production writes.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
