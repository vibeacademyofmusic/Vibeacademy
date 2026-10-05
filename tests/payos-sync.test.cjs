const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function load({ authenticated=true, visible=true, unavailable=false }={}) {
 const calls = { provider:0, writes:0, notifications:0 }
 const query = { select(){return this}, eq(){return this}, async maybeSingle(){return { data:visible ? { payment_link_id:'link', amount:2750000 } : null }} }
 const user = { auth:{ async getClaims(){return {data: authenticated ? {claims:{sub:'staff'}} : null}}},from(){return query} }
 const deps={ 'server-only':{}, '@/lib/supabase/server':{createClient:async()=>user}, '@supabase/supabase-js':{ createClient:()=>({rpc:async()=>{calls.writes++; return {error:null}}})}, './client':{readPayosPayment:async()=>{calls.provider++; if(unavailable)throw Error('timeout');return {orderCode:12345,paymentLinkId:'link',transactionAmount:2750000,amount:2750000,reference:'ref'}}}, '@/lib/integrations/zalo/preview-dispatch':{dispatchPreviewRegistrationZalo:async()=>{calls.notifications++}} }
 const source=ts.transpileModule(fs.readFileSync('lib/integrations/payos/sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(source,{exports,require:name=>{assert.ok(name in deps,name);return deps[name]},process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'}}})
 return {calls,run:()=>exports.syncPendingPayosPayment('70154e4e-bed1-49ae-ba3b-706e5b81077c',12345,'link',2750000)}
}
test('unauthenticated caller cannot query provider or write receipts',async()=>{const x=load({authenticated:false});assert.equal(await x.run(),'SKIPPED');assert.deepEqual(x.calls,{provider:0,writes:0,notifications:0})})
test('inaccessible branch/order cannot use service authority',async()=>{const x=load({visible:false});assert.equal(await x.run(),'SKIPPED');assert.equal(x.calls.provider,0);assert.equal(x.calls.writes,0)})
test('provider outage does not crash registration detail or write a receipt',async()=>{const x=load({unavailable:true});assert.equal(await x.run(),'UNAVAILABLE');assert.equal(x.calls.writes,0)})
test('authorized matching confirmation invokes receipt RPC once',async()=>{const x=load();assert.equal(await x.run(),'RECORDED');assert.equal(x.calls.writes,1)})
