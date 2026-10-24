const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRecoveryServer}=require('../scripts/local-admin-recovery.cjs');
const id='25073c07-90f9-415a-8862-8dbdadd9c8b0';
async function fixture(t){
 const updates=[],verified=[];let clock=1000;
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{id,email:'admin@vibe.local'}}}),updateUserById:async(user,attributes)=>{updates.push({user,attributes});return {data:{user:{id}}};}}},from:table=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({data:table==='profiles'?{id,status:'ACTIVE'}:{id:'role'}}),then:resolve=>resolve({data:[{id:'assignment'}]})};return q;}};
 const server=createRecoveryServer({admin,now:()=>clock,ttlMs:10000,onVerified:r=>verified.push(r),createSessionClient:()=>({auth:{signInWithPassword:async()=>({data:{user:{id}}}),signOut:async()=>({})},rpc:async()=>({data:true})})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 async function form(cookie){const r=await fetch(origin,{headers:cookie?{cookie}:{}});const html=await r.text();return {r,html,cookie:r.headers.get('set-cookie').split(';')[0],csrf:html.match(/name="csrf" value="([a-f0-9]+)"/)[1]};}
 async function submit(f,{requestOrigin=origin,cookie=f.cookie,csrf=f.csrf}={}){return fetch(origin+'/reset',{method:'POST',headers:{origin:requestOrigin,cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,password:'Synthetic-Not-A-Real-Credential',confirm:'Synthetic-Not-A-Real-Credential'})});}
 return {form,submit,updates,verified,expire:()=>clock+=10001};
}
test('same-origin form preserves independent browser sessions and validates real-login result before success',async t=>{
 const f=await fixture(t),first=await f.form(),second=await f.form();
 assert.equal(first.r.headers.get('referrer-policy'),'same-origin');
 assert.match(first.r.headers.get('content-security-policy'),/form-action 'self'/);
 assert.notEqual(first.cookie,second.cookie);
 const reload=await f.form(first.cookie);assert.equal(reload.csrf,first.csrf);
 const r=await f.submit(first);assert.equal(r.status,200);assert.match(await r.text(),/Kiểm tra đăng nhập thật/);
 assert.equal(f.updates.length,1);assert.equal(f.updates[0].user,id);assert.deepEqual(Object.keys(f.updates[0].attributes),['password']);
 assert.deepEqual(f.verified,[{user_id:id,login:'PASS',SUPER_ADMIN:true}]);
 const replay=await f.submit(second);assert.equal(replay.status,200);assert.match(await replay.text(),/SUPER_ADMIN thành công/);assert.equal(f.updates.length,1);
});
test('cross-origin and null-origin requests, missing cookie and tampered form are denied without Auth writes',async t=>{
 const f=await fixture(t),form=await f.form();
 for(const options of [{requestOrigin:'null'},{requestOrigin:'https://example.test'},{cookie:''},{csrf:'invalid'}]){
  const r=await f.submit(form,options);assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/^Forbidden$/);
 }
 assert.equal(f.updates.length,0);assert.equal(f.verified.length,0);
});
test('expired form gives a recoverable error and fresh form works',async t=>{
 const f=await fixture(t),old=await f.form();f.expire();
 const r=await f.submit(old);assert.equal(r.status,403);assert.match(await r.text(),/Mở lại biểu mẫu/);assert.equal(f.updates.length,0);
 const fresh=await f.form(old.cookie);assert.notEqual(fresh.cookie,old.cookie);
 assert.equal((await f.submit(fresh)).status,200);assert.equal(f.updates.length,1);
});
test('browser connection check validates cookie and CSRF without changing any credential',async t=>{
 const f=await fixture(t),first=await f.form();
 const origin=new URL(first.r.url).origin;
 const r=await fetch(origin+'/check',{method:'POST',headers:{origin,cookie:first.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:first.csrf})});
 assert.equal(r.status,200);assert.match(await r.text(),/Kết nối biểu mẫu đã xác minh/);
 assert.equal(f.updates.length,0);assert.equal(f.verified.length,0);
 const reload=await f.form(first.cookie);assert.match(reload.html,/name="password"/);assert.equal(reload.csrf,first.csrf);
});
