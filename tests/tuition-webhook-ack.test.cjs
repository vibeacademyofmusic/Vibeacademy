const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const load=require('./helpers/zalo-module-loader.cjs')()
const webhook=load('lib/integrations/zalo/webhook.ts')

function loadRoute(rpc){
 const loaded={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('app/api/integrations/zalo/webhook/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','exports',code)(name=>{
  if(name==='node:fs')return {appendFileSync(){},mkdirSync(){}}
  if(name==='@supabase/supabase-js')return {createClient(){return {rpc}}}
  if(name==='next/server')return {NextResponse:{json:(body,init)=>Response.json(body,init)}}
  if(name==='@/lib/integrations/zalo/webhook')return webhook
  throw Error(name)
 },loaded.exports)
 return loaded.exports
}

function clickRequest(button='Tiếp tục học', messageId='fixtureMessage'){
 const raw=JSON.stringify({app_id:process.env.ZALO_APP_ID,oa_id:process.env.ZALO_OA_ID,event_name:'user_click_response_button',msg_id:messageId,timestamp:'1790800000000',message:{tracking_id:'fixtureTracking',button_type:'response',data:button,submit_time:'1790800000000'}})
 const signature='mac='+webhook.zaloEventMac(process.env.ZALO_APP_ID,raw,'1790800000000','isolated-secret')
 return new Request('http://localhost/api/integrations/zalo/webhook',{method:'POST',body:raw,headers:{'x-zevent-signature':signature}})
}

test('stored click is applied before HTTP success; a storage failure is not acknowledged',async()=>{
 const calls=[]
 const savedEnv={...process.env}
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SERVICE_ROLE_KEY:'isolated-fixture',ZALO_APP_ID:'1355275380325944240',ZALO_OA_ID:'4520912928458797082',ZALO_OA_SECRET_KEY:'isolated-secret'})
 const original=console.info; console.info=()=>{}
 try{
  const recorded=loadRoute(async(name,args)=>{
   calls.push({name,args})
   if(name==='record_integration_webhook_event')return {data:{event_id:'fixture-event',event_status:'ACCEPTED',is_duplicate:false},error:null}
   if(name==='process_tuition_zalo_webhook')return {data:'recorded',error:null}
   return {data:null,error:null}
  })
  const response=await recorded.POST(clickRequest())
  assert.equal(response.status,200)
  assert.deepEqual(calls.map(call=>call.name).filter(name=>name!=='record_zalo_webhook_receipt'),['record_integration_webhook_event','process_tuition_zalo_webhook'])
  const failedStore=loadRoute(async()=>{throw new Error('db down')})
  const stored=await failedStore.POST(clickRequest('Dừng học','otherMessage'))
  assert.equal(stored.status,500)
  assert.equal((await stored.json()).error,'WEBHOOK_NOT_RECORDED')
 }finally{
  console.info=original
  for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key]
  Object.assign(process.env,savedEnv)
 }
})

test('apply failure and an early click stay retryable; a repeated stored event is idempotent',async()=>{
 const calls=[]
 const savedEnv={...process.env}
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SERVICE_ROLE_KEY:'isolated-fixture',ZALO_APP_ID:'1355275380325944240',ZALO_OA_ID:'4520912928458797082',ZALO_OA_SECRET_KEY:'isolated-secret'})
 const original=console.info; console.info=()=>{}
 try{
  let seen=false
  const route=loadRoute(async(name,args)=>{
   calls.push({name,args})
   if(name==='record_integration_webhook_event'){
    const duplicate=seen
    seen=true
    return {data:{event_id:'fixture-event',event_status:'ACCEPTED',is_duplicate:duplicate},error:null}
   }
   if(name==='process_tuition_zalo_webhook')return {data:calls.filter(call=>call.name==='process_tuition_zalo_webhook').length===1?'unknown_tracking':'duplicate',error:null}
   return {data:null,error:null}
  })
  const early=await route.POST(clickRequest())
  assert.equal(early.status,503)
  assert.equal((await early.json()).error,'WEBHOOK_PENDING')
  const again=await route.POST(clickRequest())
  assert.equal(again.status,200)
  const broken=loadRoute(async(name)=>{
   if(name==='record_integration_webhook_event')return {data:{event_id:'fixture-event',event_status:'ACCEPTED',is_duplicate:false},error:null}
   if(name==='process_tuition_zalo_webhook')return {data:null,error:{code:'isolated-failure'}}
   return {data:null,error:null}
  })
  const failed=await broken.POST(clickRequest('Yêu cầu khác','thirdMessage'))
  assert.equal(failed.status,503)
 }finally{
  console.info=original
  for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key]
  Object.assign(process.env,savedEnv)
 }
})
