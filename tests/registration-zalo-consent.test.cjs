const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
function compile(file, mocks) {
  const m = {exports:{}}
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n => n in mocks ? mocks[n] : require(n),m,m.exports)
  return m.exports
}
function actions() {
  const calls=[], paths=[]
  const client={auth:{getClaims:async()=>({data:{claims:{sub:'synthetic'}}})},rpc:async(name,args)=>{calls.push({name,args});return{data:'record-id',error:null}}}
  return {calls,paths,actions:compile('app/admin/business/registrations/actions.ts',{
    'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:url=>{throw Object.assign(Error('redirect'),{url})}},
    '@/lib/supabase/server':{createClient:async()=>client},'@supabase/supabase-js':{},
    '@/lib/integrations/momo/signature':{},'@/lib/integrations/payos/client':{},
  })}
}
async function submit(action,data) {const f=new FormData();for(const [k,v]of Object.entries(data))f.set(k,v);await assert.rejects(action(f),e=>!!e.url)}
for(const checked of [false,true]) test('new registration forwards explicit consent '+checked+' in the same RPC',async()=>{const h=actions();await submit(h.actions.createRegistration,{parent_phone:'+84 900 000 000',consent_method:'WRITTEN',...(checked?{phone_consent:'yes'}:{})});assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'create_registration_with_zalo_consent');assert.equal(h.calls[0].args.p_consent,checked);assert.equal(h.calls[0].args.p_parent_phone,'+84 900 000 000');assert.equal(h.calls[0].args.p_consent_method,'WRITTEN')})
test('detail forwards expected consent, actual source and explicit withdrawal; refreshes both screens',async()=>{const h=actions();await submit(h.actions.recordRegistrationZaloPhoneConsent,{application_id:'app-id',expected_consent:'consent-id',phone_consent:'yes',operation:'REVOKE'});assert.equal(h.calls[0].name,'update_registration_zalo_consent');assert.equal(h.calls[0].args.p_expected,'consent-id');assert.equal(h.calls[0].args.p_operation,'REVOKE');assert.equal(h.calls[0].args.p_source,'REGISTRATION_RECORD');assert.deepEqual(h.paths,['/admin/business/registrations/app-id','/admin/system/integrations/zalo'])})
const {ConsentPanel}=compile('app/admin/business/registrations/ConsentPanel.tsx',{
 '@/app/admin/_components/vibe':{SectionCard:({children,title})=>React.createElement('section',null,title,children),InlineNotice:({children})=>React.createElement('p',null,children)},
 './actions':{recordRegistrationZaloPhoneConsent:()=>{}},
})
test('permission and read errors never expose a writable consent form',()=>{for(const props of [{allowed:false,error:false},{allowed:true,error:true}])assert.doesNotMatch(renderToStaticMarkup(React.createElement(ConsentPanel,{applicationId:'app',history:[],...props})),/<form/)})
test('active consent renders masked audit and explicit unchecked withdrawal',()=>{const html=renderToStaticMarkup(React.createElement(ConsentPanel,{applicationId:'app',allowed:true,error:false,history:[{id:'consent',phone:'8490…000',at:'2026-09-28T01:00:00Z',actor:'Synthetic Admin',source:'REGISTRATION_RECORD',method:'WRITTEN',revokedAt:null}]}));assert.match(html,/Synthetic Admin/);assert.match(html,/Văn bản \/ tin nhắn/);assert.match(html,/Ghi nhận rút đồng ý/);assert.doesNotMatch(html,/checked=""/);assert.match(html,/name="expected_consent" value="consent"/)})
