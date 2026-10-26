#!/usr/bin/env node
// One entry point; no command defaults to a write. Private inputs stay outside Git.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { PROJECT, digest, same, literal, buildPlan } = require('./lib/production-rollout.cjs')
const { assertPlan, applySql } = require('./lib/production-rollout-sql.cjs')
const { scheduleSql } = require('./lib/production-rollout-schedule.cjs')
const ROOT = path.resolve(__dirname, '..')
const TEAM = 'team_y2GkHFTH08Wieo2XQ4QMRPRn'
const PROJECT_ID = 'prj_NAIBJsctlaU316pQge3O63aAd9Fr'
const JOURNAL_MIGRATION = 'supabase/migrations/20261026171740_production_rollout_journal.sql'
const COMMANDS = ['plan','verify','run','status','resume','rollback-plan']

function parse(argv) {
  const command = argv[0]
  if (!command || ['help','--help','-h'].includes(command)) return { command: 'help' }
  if (!COMMANDS.includes(command)) throw Error('UNKNOWN_COMMAND')
  const options = { command }
  const allowed = ['source','original','plan','out','snapshot','container','database','vercel-cli','python','approval','schedule-evidence']
  for (let i=1;i<argv.length;i+=2) {
    const name = argv[i]?.replace(/^--/,'')
    if (!argv[i]?.startsWith('--') || !allowed.includes(name) || !argv[i+1] || argv[i+1].startsWith('--') || options[name]) throw Error('INVALID_ARGUMENT')
    options[name] = argv[i+1]
  }
  return options
}

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true, mode:0o700 })
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n', { mode:0o600 })
  fs.chmodSync(file,0o600)
}
const read = file => JSON.parse(fs.readFileSync(file,'utf8'))
const shaFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function runnerHash() {
  return digest(['scripts/production-rollout.cjs','scripts/production-rollout-source.py','scripts/lib/production-rollout.cjs','scripts/lib/production-rollout-sql.cjs','scripts/lib/production-rollout-schedule.cjs','scripts/sql/production-rollout-snapshot.sql',JOURNAL_MIGRATION].map(f=>[f,shaFile(path.join(ROOT,f))]))
}

function execute(command,args,dir,input) {
  const r=spawnSync(command,args,{cwd:ROOT,input,encoding:'utf8',maxBuffer:32*1024*1024})
  if (r.status !== 0 || r.error) {
    const output=(r.stdout||'')+(r.stderr||'')+(r.error?.message||'')
    save(path.join(dir,'last-error.private.log'),output)
    throw Error(output.match(/ROLLOUT_[A-Z_]+/)?.[0] || 'TOOL_FAILED_SEE_PRIVATE_LOG')
  }
  return r.stdout.trim()
}

function query(sql,options,dir) {
  if (options.container) {
    if (!/^supabase_db_vibe-[a-z0-9-]+$/.test(options.container) || !/^caday_[a-z0-9_]+$/.test(options.database||'')) throw Error('ISOLATED_DATABASE_REQUIRED')
    const output=execute('docker',['exec','-i','-u','postgres',options.container,'psql','-U','supabase_admin','-d',options.database,'-XAt','-v','ON_ERROR_STOP=1'],dir,`set role postgres;\n${sql}`)
    const lines=output.split('\n').filter(l=>l.startsWith('{')||l.startsWith('['))
    return lines.length ? JSON.parse(lines.at(-1)) : null
  }
  const file=path.join(dir,'query.private.sql');save(file,sql)
  const output=execute('npx',['--no-install','supabase','db','query','--linked','--project-ref',PROJECT,'--file',file],dir)
  const response=JSON.parse(output)
  if (!Array.isArray(response.rows)) { save(path.join(dir,'last-error.private.log'),output);throw Error('DATABASE_QUERY_RESPONSE_INVALID') }
  return response.rows[0] || null
}

function snapshot(options,dir) {
  const result=query(fs.readFileSync(path.join(ROOT,'scripts/sql/production-rollout-snapshot.sql'),'utf8'),options,dir)
  const value=options.container ? result : result?.snapshot
  if (!value?.opening_rows) throw Error('SNAPSHOT_RESPONSE_INVALID')
  return value
}

function vercelCli(options) {
  if (options['vercel-cli'] || process.env.VERCEL_CLI_PATH) return options['vercel-cli'] || process.env.VERCEL_CLI_PATH
  const cache=path.join(os.homedir(),'.npm','_npx')
  const found=fs.existsSync(cache) ? fs.readdirSync(cache).map(d=>path.join(cache,d,'node_modules/vercel/dist/index.js')).filter(p=>fs.existsSync(p)) : []
  if (found.length !== 1) throw Error('SET_VERCEL_CLI_PATH_TO_INSTALLED_CLI')
  return found[0]
}

function liveTarget(options,dir) {
  const output=execute(process.execPath,[vercelCli(options),'api','/v4/aliases/manage.vibe.edu.vn','--method','GET','--scope',TEAM],dir)
  const r=JSON.parse(output)
  if (r.projectId !== PROJECT_ID || !r.deploymentId) throw Error('PRODUCTION_ALIAS_TARGET_CHANGED')
  return r.deploymentId
}

function checkSources(plan) {
  if (!plan.source_file || !plan.original_file || shaFile(plan.source_file)!==plan.source_sha256 || shaFile(plan.original_file)!==plan.original_sha256) throw Error('WORKBOOK_CHANGED_REPLAN_REQUIRED')
  if(plan.schedule_evidence&&shaFile(plan.schedule_evidence.pdf_file)!==plan.schedule_evidence.pdf_sha256)throw Error('SCHEDULE_PDF_CHANGED_REPLAN_REQUIRED')
}

function scheduleJournal(plan,options,dir) {
  if(!plan.schedule_import_batch_id)return []
  const response=query(`select coalesce(jsonb_agg(to_jsonb(a) order by source_reference),'[]') as actions from maintenance_private.ct_schedule_import_rows a where import_batch_id=${literal(plan.schedule_import_batch_id)}::uuid;`,options,dir)
  return Array.isArray(response)?response:response?.actions||[]
}

function validateSchedules(plan,current,recorded) {
  for(const a of plan.schedule_actions||[]) {
    const done=recorded.find(r=>r.source_reference===a.key)
    const membership=(current.enrollments||[]).find(r=>r.id===a.enrollment_id)
    if(done) {
      if(!membership||!same(membership,done.enrollment_after))throw Error('ROLLOUT_APPLIED_MEMBERSHIP_DRIFT')
    } else {
      if(!same(current.classes.find(r=>r.id===a.class_id),a.class_before)||!same(current.schedules.find(r=>r.id===a.schedule_before.id),a.schedule_before)||!same(current.rooms.find(r=>r.id===a.room_before.id),a.room_before)||!same(current.students.find(r=>r.id===a.student_id),a.student_before)||!same(current.academic_enrollments.find(r=>r.id===a.academic_before.id),a.academic_before))throw Error('ROLLOUT_MEMBERSHIP_PREREQUISITE_CHANGED')
      if((current.enrollments||[]).some(r=>r.student_id===a.student_id&&r.class_id===a.class_id&&['ACTIVE','PAUSED'].includes(r.status)))throw Error('ROLLOUT_MEMBERSHIP_ALREADY_EXISTS_REPLAN')
    }
  }
}

function journal(plan,options,dir) {
  const exists=query("select jsonb_build_object('exists',to_regclass('maintenance_private.production_rollout_actions') is not null) as result;",options,dir)
  const result=exists?.result || exists
  if (!result?.exists) return []
  const response=query(`select coalesce(jsonb_agg(to_jsonb(a) order by source_excel_row),'[]') as actions from maintenance_private.production_rollout_actions a where batch_key=${literal(plan.batch_key)};`,options,dir)
  return Array.isArray(response) ? response : response?.actions || []
}

function validateCurrent(plan,current,recorded) {
  for (const action of plan.actions) {
    const row=current.opening_rows.find(r=>r.id===action.target_id)
    const applied=recorded.find(a=>a.action_key===action.key)
    if (!row || !same(row,applied ? applied.postimage : action.before)) throw Error(applied?'ROLLOUT_APPLIED_ROW_DRIFT':'ROLLOUT_PREIMAGE_CHANGED')
  }
}

function report(plan,current,recorded,schedules=[]) {
  validateCurrent(plan,current,recorded)
  validateSchedules(plan,current,schedules)
  const summary={}
  for(const part of ['reference_action','tuition_date_action','academic_action','schedule_action'])summary[part]=plan.rows.reduce((out,r)=>{
    let state=r[part].state
    if(part==='reference_action'&&recorded.some(a=>a.source_excel_row===r.source_excel_row))state='APPLIED'
    if(part==='schedule_action'&&schedules.some(a=>a.source_reference===r.schedule_action.action_key))state='APPLIED'
    out[state]=(out[state]||0)+1;return out
  },{})
  return { status:'PARTIAL_WITH_HOLDS',batch_key:plan.batch_key,source_sha256:plan.source_sha256,
    reference_actions_applied:recorded.length,reference_actions_planned:plan.actions.length,
    reference_level_ids_changed:recorded.filter(a=>a.preimage.level_id!==a.postimage.level_id).length,
    reference_date_pairs_changed:recorded.filter(a=>a.preimage.fee_starts_on!==a.postimage.fee_starts_on||a.preimage.source_effective_ends_on!==a.postimage.source_effective_ends_on).length,
    operational_tuition_updated:0,operational_academic_updated:0,schedule_enrollments_created:schedules.filter(s=>s.action==='CREATED').length,
    summary,side_effect_counts:current.side_effect_counts }
}

function main(argv=process.argv.slice(2)) {
  const options=parse(argv)
  if (options.command==='help') {
    console.log('Usage: node scripts/production-rollout.cjs <plan|verify|run|status|resume|rollback-plan> [options]\nplan --source <xlsx> --original <original.xlsx> --out <private-directory> [--snapshot <read-only-json>]\nverify --plan <plan.json> --container <isolated-container> --database <caday_database>\nrun|resume|status|rollback-plan --plan <plan.json>\nDefault: help. Plan/status/rollback-plan never write production. Verify only writes inside an isolated ROLLBACK transaction.')
    return
  }
  if (options.command==='plan') {
    if (!options.source||!options.original||!options.out) throw Error('PLAN_INPUTS_REQUIRED')
    const dir=path.resolve(options.out);fs.mkdirSync(dir,{recursive:true,mode:0o700})
    const sourceFile=path.join(dir,'source.json')
    const python=options.python||process.env.VIBE_WORKBOOK_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')
    execute(python,[path.join(__dirname,'production-rollout-source.py'),'--source',path.resolve(options.source),'--original',path.resolve(options.original),'--output',sourceFile],dir)
    const current=options.snapshot ? read(options.snapshot) : snapshot(options,dir)
    save(path.join(dir,'snapshot.json'),current)
    const deployment=liveTarget(options,dir)
    const context=options.approval?{approval:read(options.approval),schedule_evidence:read(options['schedule-evidence'])}:{}
    if(context.schedule_evidence&&shaFile(context.schedule_evidence.pdf_file)!==context.schedule_evidence.pdf_sha256)throw Error('SCHEDULE_SOURCE_PDF_MISMATCH')
    const plan=buildPlan(read(sourceFile),current,deployment,context)
    plan.runner_release_commit=execute('git',['rev-parse','HEAD'],dir)
    plan.runner_code_hash=runnerHash()
    delete plan.plan_hash;plan.plan_hash=digest(plan)
    save(path.join(dir,'plan.json'),plan)
    console.log(JSON.stringify({status:plan.status,plan:path.join(dir,'plan.json'),planned_reference_actions:plan.actions.length,planned_schedule_actions:(plan.schedule_actions||[]).length,summary:plan.summary}))
    return
  }
  if (!options.plan) throw Error('PLAN_FILE_REQUIRED')
  const planFile=path.resolve(options.plan),dir=path.dirname(planFile),plan=read(planFile)
  assertPlan(plan);checkSources(plan)
  if(plan.runner_code_hash!==runnerHash())throw Error('RUNNER_CHANGED_REPLAN_REQUIRED')
  if (options.command==='verify') {
    if (!options.container||!options.database) throw Error('VERIFY_REQUIRES_ISOLATED_DATABASE')
    const current=snapshot(options,dir),recorded=journal(plan,options,dir),scheduled=scheduleJournal(plan,options,dir)
    validateCurrent(plan,current,recorded)
    validateSchedules(plan,current,scheduled)
    if (recorded.length||scheduled.length) throw Error('VERIFY_REQUIRES_UNAPPLIED_CLONE')
    const beforeRows=current.opening_rows
    // Replay every action in the same transaction and roll all writes back.
    let sql=plan.actions.length?applySql(plan,[...plan.actions,...plan.actions]).replace(/commit;\s*$/i,''):'begin;\n'
    if(plan.schedule_actions?.length) {
      const scheduledSql=scheduleSql(plan).replace(/^begin;/i,'').replace(/commit;\s*$/i,'')
      sql+=scheduledSql+scheduledSql.replace('create temporary table schedule_counts_before','drop table schedule_counts_before;\ncreate temporary table schedule_counts_before')
      sql+=`select maintenance_private.rollback_ct_schedule_import(${literal(plan.schedule_import_batch_id)}::uuid);\n`
    }
    sql+='rollback;\n';query(sql,options,dir)
    const after=snapshot(options,dir)
    if (!same(beforeRows,after.opening_rows)||!same(current.side_effect_counts,after.side_effect_counts)||journal(plan,options,dir).length||scheduleJournal(plan,options,dir).length) throw Error('VERIFY_ROLLBACK_OR_SIDE_EFFECT_FAILED')
    const verification={plan_hash:plan.plan_hash,runner_hash:runnerHash(),verified_at:new Date().toISOString(),container:options.container,database:options.database,reference_actions:plan.actions.length,schedule_actions:(plan.schedule_actions||[]).length,replay_and_rollback:true,side_effect_counts_unchanged:true}
    save(path.join(dir,'verification.json'),verification)
    console.log(JSON.stringify({status:'VERIFIED',reference_actions:plan.actions.length,schedule_actions:(plan.schedule_actions||[]).length,replay_and_rollback:true}))
    return
  }
  if (options.container||options.database) throw Error('THIS_COMMAND_TARGETS_VERIFIED_PRODUCTION_ONLY')
  if (liveTarget(options,dir)!==plan.deployment_id) throw Error('PRODUCTION_DEPLOYMENT_CHANGED_REVERIFY')
  const current=snapshot(options,dir),recorded=journal(plan,options,dir),scheduled=scheduleJournal(plan,options,dir)
  validateCurrent(plan,current,recorded)
  validateSchedules(plan,current,scheduled)
  if (options.command==='rollback-plan') {
    const draft={status:'DRAFT_ONLY_NO_WRITES',batch_key:plan.batch_key,requires_dependency_review:true,actions:recorded.map(a=>({action_key:a.action_key,target_id:a.target_id,source_excel_row:a.source_excel_row,preimage:a.preimage,postimage:a.postimage,current_matches_postimage:true})),schedule_memberships:scheduled,schedule_rollback_function:plan.schedule_import_batch_id?`maintenance_private.rollback_ct_schedule_import('${plan.schedule_import_batch_id}'::uuid)`:null}
    save(path.join(dir,'rollback-plan.json'),draft)
    console.log(JSON.stringify({status:draft.status,conditional_actions:recorded.length}));return
  }
  if (options.command==='status') {
    const status=report(plan,current,recorded,scheduled);save(path.join(dir,'status.json'),status);console.log(JSON.stringify(status));return
  }
  const verification=read(path.join(dir,'verification.json'))
  if (verification.plan_hash!==plan.plan_hash||verification.runner_hash!==runnerHash()||!verification.replay_and_rollback) throw Error('VERIFICATION_MISSING_OR_STALE')
  const lock=path.join(dir,'run.lock');let fd
  if(fs.existsSync(lock)) {
    const owner=read(lock)
    if(!Number.isSafeInteger(owner.pid)||owner.pid<=0) throw Error('INVALID_LOCAL_LOCK')
    try {process.kill(owner.pid,0);throw Error('LOCAL_BATCH_LOCKED_CHECK_EXISTING_PROCESS')}
    catch(error) {if(error.code!=='ESRCH')throw error;fs.unlinkSync(lock)}
  }
  try {fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid,plan_hash:plan.plan_hash}))}
  catch {throw Error('LOCAL_BATCH_LOCKED_CHECK_EXISTING_PROCESS')}
  try {
    const pending=plan.actions.filter(a=>!recorded.some(r=>r.action_key===a.key))
    let offset=0
    while(offset<pending.length) {
      if(liveTarget(options,dir)!==plan.deployment_id) throw Error('PRODUCTION_DEPLOYMENT_CHANGED_REVERIFY')
      const size=offset===0&&recorded.length===0?3:20
      const chunk=pending.slice(offset,offset+size)
      save(path.join(dir,'checkpoint.json'),{phase:'BEFORE_COMMIT',action_keys:chunk.map(a=>a.key),plan_hash:plan.plan_hash})
      query(applySql(plan,chunk),options,dir)
      const fresh=snapshot(options,dir),done=journal(plan,options,dir)
      validateCurrent(plan,fresh,done)
      if(chunk.some(a=>!done.some(r=>r.action_key===a.key))) throw Error('COMMIT_NOT_CONFIRMED_READ_STATUS_BEFORE_RETRY')
      save(path.join(dir,'checkpoint.json'),{phase:'COMMIT_VERIFIED',applied:done.length,plan_hash:plan.plan_hash})
      console.log(JSON.stringify({phase:'COMMIT_VERIFIED',applied:done.length,planned:plan.actions.length}))
      offset+=size
    }
    if(plan.schedule_actions?.length&&scheduled.length<plan.schedule_actions.length) {
      if(liveTarget(options,dir)!==plan.deployment_id)throw Error('PRODUCTION_DEPLOYMENT_CHANGED_REVERIFY')
      const before=snapshot(options,dir);validateSchedules(plan,before,scheduleJournal(plan,options,dir))
      query(scheduleSql(plan),options,dir)
      const done=scheduleJournal(plan,options,dir)
      if(done.length!==plan.schedule_actions.length)throw Error('SCHEDULE_COMMIT_NOT_CONFIRMED')
      console.log(JSON.stringify({phase:'SCHEDULE_COMMIT_VERIFIED',applied:done.length}))
    }
    const status=report(plan,snapshot(options,dir),journal(plan,options,dir),scheduleJournal(plan,options,dir));save(path.join(dir,'status.json'),status);console.log(JSON.stringify(status))
  } finally {if(fd!==undefined)fs.closeSync(fd);fs.unlinkSync(lock)}
}

if(require.main===module)try{main()}catch(error){console.error(error.message);process.exitCode=1}
module.exports={parse,main,report,validateCurrent}
