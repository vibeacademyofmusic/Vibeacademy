/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict')
const {dispatch,mockProvider}=require('./helpers/zalo-module-loader.cjs')()('lib/notifications/worker.ts')
const job={id:'job',channel:'EMAIL',delivery_mode:'MOCK',idempotency_key:'stable',lease_token:'lease',recipient_id:'user',payload:{title:'Hello',href:'/'}}
function queue(j=job){const calls=[];return {calls,claim:async()=>j,complete:async(...args)=>calls.push(args)}}
test('unconfigured provider fails closed without SENT',async()=>{const q=queue();assert.equal(await dispatch(q,'job',{}),'FAILED');assert.equal(q.calls[0][2],null);assert.equal(q.calls[0][3],'PROVIDER_NOT_CONFIGURED')})
test('Zalo channel fails closed with typed outbound code',async()=>{const q=queue({...job,channel:'ZALO',delivery_mode:'LIVE'});const provider={send:async()=>{throw Error('provider must not be called')}};assert.equal(await dispatch(q,'job',{ZALO:provider}),'FAILED');assert.equal(q.calls[0][2],null);assert.equal(q.calls[0][3],'ZALO_PILOT_OUTBOUND_DISABLED')})
test('mock confirms success with stable idempotency receipt',async()=>{const p=mockProvider();assert.deepEqual(await p.send(job),await p.send(job));const q=queue();assert.equal(await dispatch(q,'job',{EMAIL:p}),'SENT');assert.equal(q.calls[0][2],'mock:stable')})
test('mock refuses live job',async()=>{const q=queue({...job,delivery_mode:'LIVE'});assert.equal(await dispatch(q,'job',{EMAIL:mockProvider()}),'FAILED')})
test('provider failure is sanitized',async()=>{const q=queue();await dispatch(q,'job',{EMAIL:{send:async()=>{throw Error('SECRET-ADDRESS')}}});assert.equal(q.calls[0][3],'PROVIDER_REJECTED');assert.doesNotMatch(JSON.stringify(q.calls),/SECRET/)})
test('provider response without confirmation cannot mark SENT',async()=>{const q=queue();assert.equal(await dispatch(q,'job',{EMAIL:{send:async()=>({receipt:'unconfirmed'})}}),'FAILED')})
test('unclaimed job never calls provider',async()=>{let called=false;assert.equal(await dispatch(queue(null),'job',{EMAIL:{send:async()=>{called=true}}}),'NOT_CLAIMED');assert.equal(called,false)})
test('database acknowledgement failure does not resend or falsely record failure',async()=>{let sent=0,acked=0;const q={claim:async()=>job,complete:async()=>{acked++;throw Error('DB unavailable')}};await assert.rejects(dispatch(q,'job',{EMAIL:{send:async()=>{sent++;return {confirmed:true,receipt:'ok'}}}}));assert.equal(sent,1);assert.equal(acked,1)})
