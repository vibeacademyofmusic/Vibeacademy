const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
function loader() {
 const cache = new Map()
 return function load(file) {
  file = path.resolve(file); if(cache.has(file)) return cache.get(file)
  const m={exports:{}}; cache.set(file,m.exports)
  new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,id=>id==='server-only'?{}:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id))
  return m.exports
 }
}
const load=loader(), manager=load('lib/integrations/zalo/oauth.ts'), auth=load('lib/integrations/zalo/authorization.ts'), {maintainZaloCredentials}=load('lib/integrations/zalo/maintenance.ts')
const env={ZALO_APP_ID:'123456789',ZALO_OA_ID:'987654321',ZALO_APP_SECRET:'synthetic-app-secret',ZALO_OA_ACCESS_TOKEN:'old-env',ZALO_OA_REFRESH_TOKEN:'old-env-refresh',ZALO_CREDENTIAL_OWNER:'main',ZALO_TOKEN_RENEWAL_ENABLED:'true',ZALO_OAUTH_REDIRECT_URI:'http://localhost:3000/api/integrations/zalo/oauth/callback'}
function store(now) {
 const db={c:{app_id:env.ZALO_APP_ID,oa_id:env.ZALO_OA_ID,version:1,state:'READY',access_token:'access-1',refresh_token:'refresh-1',expires_at:new Date(now+1000).toISOString()},states:new Map(),health:null}
 db.rpc=async(fn,a)=>{
  if(fn==='zalo_scheduler_health'){db.health=a;return {data:db.health,error:null}}
  if(fn==='zalo_oauth_state') {
   if(a.p_action==='CREATE'){db.states.set(a.p_hash,{...a});return {data:{state:'CREATED'}}}
   const s=db.states.get(a.p_hash)
   if(!s||s.used||s.p_user!==a.p_user||s.p_oa!==a.p_oa)return {error:{}}
   s.used=true;return {data:{version:s.p_version,verifier:s.p_verifier}}
  }
  assert.equal(fn,'zalo_credential_command');const c=db.c
  if(a.p_action==='READ')return {data:c?{...c}:null}
  if(a.p_action==='BOOTSTRAP')throw Error('must never bootstrap over stored pair')
  if(a.p_version!==c.version)return {data:{state:'STALE'}}
  if(a.p_action==='REAUTH_CLAIM'){if(c.state==='REFRESHING')return {data:{state:'BUSY'}};Object.assign(c,{state:'REFRESHING',operation_id:a.p_operation,operation_started_at:new Date(now).toISOString()});return {data:{state:'CLAIMED',version:c.version}}}
  if(a.p_action==='CLAIM'){if(c.state!=='READY'||c.operation_id)return {data:{state:'BUSY'}};Object.assign(c,{state:'REFRESHING',operation_id:a.p_operation,operation_started_at:new Date(now).toISOString()});return {data:{state:'CLAIMED'}}}
  if(a.p_action==='COMMIT'){if(c.operation_id!==a.p_operation)return {data:{state:'STALE'}};Object.assign(c,{access_token:a.p_access,refresh_token:a.p_refresh,expires_at:a.p_expires_at,version:c.version+1,state:'VERIFYING',operation_id:null,committed_operation:a.p_operation});return {data:{state:'COMMITTED'}}}
  if(a.p_action==='VERIFY'){c.state='READY';return {data:{state:'VERIFIED'}}}
  if(a.p_action==='BLOCK'){c.state='UNCERTAIN';c.error_code=a.p_error;return {data:{state:'BLOCKED'}}}
  if(a.p_action==='REPLACE'){Object.assign(c,{access_token:a.p_access,refresh_token:a.p_refresh,expires_at:a.p_expires_at,version:c.version+1,state:'VERIFYING'});return {data:{state:'COMMITTED'}}}
  throw Error(a.p_action)
 };return db
}
const json=b=>({ok:true,json:async()=>b})
const verify=async u=>json(u.includes('getoa')?{error:0,data:{oa_id:env.ZALO_OA_ID}}:{error:0})
test('two simulated cycles consume replacement refresh tokens; restarted manager ignores old env',async()=>{
 let now=Date.now();const db=store(now),used=[]
 const request=async(u,i)=>{if(!u.includes('access_token'))return verify(u);used.push(i.body.get('refresh_token'));return json({access_token:'access-'+(used.length+1),refresh_token:'refresh-'+(used.length+1),expires_in:90000})}
 await manager.getZaloCredential(db,env,request,{now:()=>now})
 now+=90000*1000-900000
 await manager.getZaloCredential(db,env,request,{now:()=>now})
 assert.deepEqual(used,['refresh-1','refresh-2'])
 const restarted=loader()('lib/integrations/zalo/oauth.ts')
 const result=await restarted.getZaloCredential(db,env,async()=>{throw Error('not due')},{now:()=>now})
 assert.equal(result.access_token,'access-3');assert.equal(result.version,3)
})
test('concurrent preflights reuse winning refresh rather than consume again',async()=>{
 const now=Date.now(),db=store(now);let calls=0,release;const gate=new Promise(r=>release=r)
 const request=async(u)=>{if(!u.includes('access_token'))return verify(u);calls++;await gate;return json({access_token:'access-2',refresh_token:'refresh-2',expires_in:90000})}
 const first=manager.getZaloCredential(db,env,request)
 await new Promise(r=>setImmediate(r));const second=manager.getZaloCredential(db,env,request,{sleep:async()=>{release();await new Promise(r=>setImmediate(r))}})
 const result=await Promise.all([first,second]);assert.equal(calls,1);assert.equal(result[0].version,result[1].version)
})
test('idle scheduled check and downtime recovery use same manager without notification traffic',async()=>{
 const db=store(Date.now()-3600000);let rotations=0
 const result=await maintainZaloCredentials(db,env,async u=>{if(!u.includes('access_token'))return verify(u);rotations++;return json({access_token:'new',refresh_token:'new-refresh',expires_in:90000})})
 assert.equal(result.result,'READY');assert.equal(rotations,1);assert.equal(db.health.p_interval,600)
 await maintainZaloCredentials(db,env,async()=>{throw Error('unnecessary refresh')});assert.equal(db.health.p_result,'READY')
})
test('ownership guard prevents independent manager from calling provider',async()=>{
 const db=store(Date.now());assert.equal((await maintainZaloCredentials(db,{...env,ZALO_CREDENTIAL_OWNER:''},async()=>{throw Error('must not call')})).result,'OWNERSHIP_UNCONFIRMED')
})
test('expired in-flight lock after process death becomes uncertain without reusing token',async()=>{
 const db=store(Date.now());Object.assign(db.c,{state:'REFRESHING',operation_id:'op',operation_started_at:new Date(Date.now()-120000).toISOString()})
 await assert.rejects(manager.getZaloCredential(db,env,async()=>{throw Error('never refresh')}),/UNCERTAIN/);assert.equal(db.c.state,'UNCERTAIN')
})
test('OAuth uses unique PKCE and one-use user-bound state; callback replay and wrong OA fail',async()=>{
 const db=store(Date.now()),start=await auth.startAuthorization(db,'admin',env),url=new URL(start.url)
 assert.equal(url.searchParams.get('redirect_uri'),env.ZALO_OAUTH_REDIRECT_URI);assert.equal(url.searchParams.get('code_challenge').length,43)
 const input={state:start.state,cookieState:start.state,code:'synthetic-code',oaId:env.ZALO_OA_ID};let calls=0
 const request=async(u,i)=>{if(!u.includes('access_token'))return verify(u);calls++;assert.equal(i.body.get('grant_type'),'authorization_code');assert.equal(i.body.get('code_verifier').length,43);return json({access_token:'authorized',refresh_token:'authorized-refresh',expires_in:90000})}
 await assert.rejects(auth.finishAuthorization(db,'admin',{...input,oaId:'111111111'},env,request),/INVALID/)
 await assert.rejects(auth.finishAuthorization(db,'other-admin',input,env,request),/INVALID/)
 assert.equal(await auth.finishAuthorization(db,'admin',input,env,request),'READY')
 await assert.rejects(auth.finishAuthorization(db,'admin',input,env,request),/INVALID/);assert.equal(calls,1)
})
test('reconnection racing with a newer credential version cannot replace it',async()=>{
 const db=store(Date.now()),start=await auth.startAuthorization(db,'admin',env);db.c.version=8
 await assert.rejects(auth.finishAuthorization(db,'admin',{state:start.state,cookieState:start.state,code:'code',oaId:env.ZALO_OA_ID},env,async u=>u.includes('access_token')?json({access_token:'late',refresh_token:'late-r',expires_in:90000}):verify(u)),/CHANGED/)
 assert.equal(db.c.version,8);assert.equal(db.c.access_token,'access-1')
})
test('callback route requires admin; maintenance checks secret; scheduler never dispatches notifications',()=>{
 const route=fs.readFileSync('app/api/integrations/zalo/oauth/callback/route.ts','utf8');assert.match(route,/requireIntegrationAdmin/);assert.match(route,/httpOnly|cookie|cookies/)
 assert.match(fs.readFileSync('app/api/internal/zalo/maintenance/route.ts','utf8'),/timingSafeEqual/)
 assert.doesNotMatch(fs.readFileSync('lib/integrations/zalo/maintenance.ts','utf8'),/dispatchPreview|claim_zalo_registration_attempt/)
})

test('legacy UID path cannot send without a durable claim', async()=>{
 const {dispatchPreviewRegistrationZalo}=load('lib/integrations/zalo/preview-dispatch.ts')
 const db={rpc:async()=>({data:{decision:'SEND',job_id:'job',provider_user_id:'uid',idempotency_key:'key',parameters:{},delivery_channel:'UID'}})}
 assert.equal(await dispatchPreviewRegistrationZalo(db,1,async()=>{throw Error('must not send')},env),'ZALO_UID_DURABLE_CLAIM_REQUIRED')
})
