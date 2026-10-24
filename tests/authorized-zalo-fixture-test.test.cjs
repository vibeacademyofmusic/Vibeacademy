const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript')
const root=path.resolve(__dirname,'..')
let providerCalls=0,finishCalls=[]
const credential={app_id:'1355275380325944240',oa_id:'4520912928458797082',access_token:'test'}
const admin={rpc:async(_fn,args)=>{finishCalls.push(args);return {data:args.p_state,error:null}}}
const moduleObject={exports:{}}
const c={
 result:'CLAIMED',id:'synthetic-test',phone:'84900000001',template_id:'645192',
 tracking_id:'a'.repeat(32),payment_link_cancelled:false,
 parameters:{
  student_name:'KIỂM THỬ HP - HỌC VIÊN MẪU',student_code:'TEST-STUDENT-001',
  days_left:'16',period:'29/07/2026-28/10/2026',amount:'5500000',due_date:'28102026',
 },
}
const req=id=>id==='server-only'?{}
 :id==='./oauth'?{getZaloCredential:async()=>credential}
 :id==='./service'?{zaloServiceClient:()=>admin}
 :id==='./app-secret-proof'?{zaloAccessHeaders:()=>({})}
 :id==='./pilot-outbound'?{zaloPilotOutboundBlocked:()=>false}
 :id==='./errors'?{DEFINITIVE_PHONE_REJECTIONS:new Set([-108])}
 :id==='./phone'?{normalizeVnPhone:phone=>/^84\d{9}$/.test(phone)?phone:null}
 :id==='./tuition-test-send'?{tuitionManualMatches:x=>x.templateId==='645192'&&x.parameters.student_code==='TEST-STUDENT-001'}
 :id==='../tuition/payment-send'?{tuitionPaymentParametersAccepted:(id,p)=>id==='645028'&&p.payment_status==='Chờ thanh toán'}
 :require(id)
let networkUnknown=false
vm.runInNewContext(
 ts.transpileModule(fs.readFileSync(root+'/lib/integrations/zalo/authorized-fixture-test.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:moduleObject,exports:moduleObject.exports,require:req,process:{env:{ZALO_APP_SECRET:'test'}},AbortSignal,
  fetch:async(url)=>{providerCalls++;if(networkUnknown)throw Error('timeout');return {ok:true,status:200,json:async()=>url.includes('/template/info')?{error:0,data:{status:'ENABLE',templateId:645192}}:{error:0,data:{msg_id:'verified1'}}}}},
 )
const {authorizedFixturePayloadValid,dispatchAuthorizedFixtureTest}=moduleObject.exports

test('a database-claimed fixture still needs valid phone and test-only payload',()=>{
 assert.equal(authorizedFixturePayloadValid(c),true)
 assert.equal(authorizedFixturePayloadValid({...c,phone:'not-a-phone'}),false)
 assert.equal(authorizedFixturePayloadValid({...c,parameters:{...c.parameters,student_name:'Học viên thật'}}),false)
 assert.equal(authorizedFixturePayloadValid({...c,parameters:{...c.parameters,student_code:'BAD CODE'}}),false)
})
test('payment sample requires a cancelled test link',()=>{
 const payment={...c,template_id:'645028',parameters:{student_name:c.parameters.student_name,student_code:c.parameters.student_code,invoice_code:'TEST-INVOICE-001',payment_status:'Chờ thanh toán'}}
 assert.equal(authorizedFixturePayloadValid(payment),false)
 assert.equal(authorizedFixturePayloadValid({...payment,payment_link_cancelled:true}),true)
})
test('duplicate and expired claims never call Zalo',async()=>{
 providerCalls=0
 for(const result of ['ALREADY_CLAIMED','EXPIRED']){
  const r=await dispatchAuthorizedFixtureTest({rpc:async()=>({data:{result},error:null})},'synthetic-test')
  assert.equal(r.state,result)
 }
 assert.equal(providerCalls,0)
})
test('accepted result is persisted once',async()=>{
 providerCalls=0;finishCalls=[]
 const r=await dispatchAuthorizedFixtureTest({rpc:async()=>({data:c,error:null})},'synthetic-test')
 assert.equal(r.state,'ACCEPTED')
 assert.equal(r.messageId,'verified1')
 assert.equal(finishCalls.length,1)
 assert.equal(finishCalls[0].p_state,'ACCEPTED')
})
test('invalid claimed payload is rejected without calling Zalo',async()=>{
 providerCalls=0;finishCalls=[]
 const r=await dispatchAuthorizedFixtureTest({rpc:async()=>({data:{...c,phone:'not-a-phone'},error:null})},'synthetic-test')
 assert.equal(r.state,'REJECTED')
 assert.equal(providerCalls,0)
 assert.equal(finishCalls[0].p_state,'REJECTED')
})
test('uncertain provider result is retained without retry',async()=>{
 networkUnknown=true;providerCalls=0;finishCalls=[]
 const r=await dispatchAuthorizedFixtureTest({rpc:async()=>({data:c,error:null})},'synthetic-test')
 assert.equal(r.state,'UNKNOWN')
 assert.equal(providerCalls,1)
 assert.equal(finishCalls[0].p_state,'UNKNOWN')
 networkUnknown=false
})
test('wrong OA never reserves a test',async()=>{
 credential.oa_id='wrong'
 let claims=0
 await dispatchAuthorizedFixtureTest({rpc:async()=>{claims++;return {data:c,error:null}}},'synthetic-test')
 assert.equal(claims,0)
 credential.oa_id='4520912928458797082'
})
