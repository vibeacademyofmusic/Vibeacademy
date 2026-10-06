const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file) {
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports);return module.exports
}
const recovery=load('lib/auth/password-recovery.ts')
const site=load('lib/auth/site-url.ts')
function fake(overrides={}) {
 const calls=[]
 const auth={
 resetPasswordForEmail:async(...args)=>{calls.push(['request',...args]);return {error:null}},
 exchangeCodeForSession:async(...args)=>{calls.push(['exchange',...args]);return {data:{session:{},redirectType:'recovery'},error:null}},
 verifyOtp:async args=>{calls.push(['otp',args]);return {error:null}},
 setSession:async args=>{calls.push(['session',args]);return {error:null}},
 getUser:async()=>({data:{user:{id:'own-user'}},error:null}),
 getClaims:async()=>({data:{claims:{sub:'own-user',session_id:'recovery-session',amr:[{method:'recovery',timestamp:1}]}},error:null}),
 updateUser:async args=>{calls.push(['update',args]);return {error:null}},
 ...overrides};return {auth,calls}
}
test('canonical staging redirect, local fallback and production domain are explicit',()=>{
 assert.equal(site.recoveryRedirectUrl({VIBE_PILOT_ENVIRONMENT:'staging'}),'https://staging.vibe.edu.vn/auth/update-password')
 assert.equal(site.recoveryRedirectUrl({NEXT_PUBLIC_SITE_URL:'https://staging.vibe.edu.vn',NEXT_PUBLIC_APP_URL:'http://localhost:3000'}),'https://staging.vibe.edu.vn/auth/update-password')
 assert.equal(site.recoveryRedirectUrl({NODE_ENV:'development'}),'http://localhost:3000/auth/update-password')
 assert.equal(site.recoveryRedirectUrl({NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:'https://portal.example.com'}),'https://portal.example.com/auth/update-password')
 assert.equal(site.recoveryRedirectUrl({NODE_ENV:'production',VERCEL:'1',NEXT_PUBLIC_SUPABASE_URL:'https://owpfqwdrmyzcmjahehek.supabase.co',NEXT_PUBLIC_APP_URL:'https://vibeacademy-staging.vercel.app'}),'https://staging.vibe.edu.vn/auth/update-password')
})
test('missing/unsafe deployed URL does not become localhost or a Preview domain',()=>{
 for(const env of [{NODE_ENV:'production'},{VERCEL:'1',NODE_ENV:'development'},{NEXT_PUBLIC_SITE_URL:'http://localhost:3000'},{NEXT_PUBLIC_SITE_URL:'https://user:pass@staging.vibe.edu.vn'},{NEXT_PUBLIC_SITE_URL:'https://preview.vercel.app'},{NEXT_PUBLIC_SITE_URL:'https://staging.vibe.edu.vn/x'},{NEXT_PUBLIC_SITE_URL:'https://staging.vibe.edu.vn?next=evil'}])assert.throws(()=>site.recoveryRedirectUrl(env))
 assert.equal(site.recoveryRedirectUrl({VIBE_PILOT_ENVIRONMENT:'staging',NEXT_PUBLIC_SITE_URL:'https://wrong.example'}),'https://staging.vibe.edu.vn/auth/update-password')
})
test('valid request specifies the update-password route and trims email',async()=>{
 const {auth,calls}=fake();assert.deepEqual(await recovery.requestPasswordRecovery(auth,'  fixture@example.invalid  ','https://staging.vibe.edu.vn/auth/update-password'),{error:null});assert.deepEqual(calls,[['request','fixture@example.invalid',{redirectTo:'https://staging.vibe.edu.vn/auth/update-password'}]])
})
test('invalid email does not call Auth and success is non-enumerating',async()=>{
 const {auth,calls}=fake();assert.ok((await recovery.requestPasswordRecovery(auth,'not an email','unused')).error);assert.equal(calls.length,0)
 assert.deepEqual(await recovery.requestPasswordRecovery(auth,'unknown@example.invalid','https://example.com/auth/update-password'),{error:null});assert.match(recovery.recoveryEmailMessage,/Nếu email thuộc/)
})
test('expired/access_denied callback never consumes any credential',async()=>{
 for(const suffix of ['?error_code=otp_expired&code=unused','#error=access_denied&error_description=raw-secret','?error_description=raw']){
 const {auth,calls}=fake();assert.equal(await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password'+suffix)),false);assert.equal(calls.length,0)
 }
})
test('PKCE callback exchanges its own flow verifier and validates recovery identity',async()=>{
 const {auth,calls}=fake();assert.equal(await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password?code=synthetic&sb_flow_id=flow-slot')),true);assert.deepEqual(calls,[['exchange','synthetic',{flowId:'flow-slot'}]])
})
test('single-use or foreign-browser exchange fails closed',async()=>{
 const {auth}=fake({exchangeCodeForSession:async()=>({error:{code:'otp_expired'}})});assert.equal(await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password?code=used')),false)
})
test('fresh implicit and token-hash recovery links use the isolated Auth client',async()=>{
 const one=fake();assert.equal(await recovery.beginPasswordRecovery(one.auth,new URL('https://example.com/auth/update-password#type=recovery&access_token=test-access&refresh_token=test-refresh')),true);assert.equal(one.calls[0][0],'session')
 const two=fake();assert.equal(await recovery.beginPasswordRecovery(two.auth,new URL('https://example.com/auth/update-password?type=recovery&token_hash=test-hash')),true);assert.deepEqual(two.calls[0],['otp',{type:'recovery',token_hash:'test-hash'}])
})
test('forged recovery query or normal login session is not a recovery session',async()=>{
 const {auth}=fake({getClaims:async()=>({data:{claims:{sub:'own-user',session_id:'recovery-session',amr:[{method:'password'}]}},error:null})});assert.equal(await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password?type=recovery')),false)
})
test('revoked user, invalid signature and different identity are rejected',async()=>{
 for(const overrides of [{getUser:async()=>({data:{user:null},error:{}})},{getClaims:async()=>({data:null,error:{}})},{getClaims:async()=>({data:{claims:{sub:'another-user',amr:[{method:'recovery'}]}},error:null})}])assert.equal(await recovery.verifiedRecoveryUser(fake(overrides).auth),null)
})
test('required fields, mismatch and short passwords never update',async()=>{
 for(const [password,confirmation] of [['',''],['abcdefgh','different'],['short','short']]){
 const {auth,calls}=fake();assert.ok((await recovery.changeRecoveredPassword(auth,password,confirmation)).error);assert.equal(calls.length,0)
 }
})
test('verified recovery updates only the current user password',async()=>{
 const {auth,calls}=fake();await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password?code=fresh'));calls.length=0;assert.deepEqual(await recovery.changeRecoveredPassword(auth,'synthetic-only-password','synthetic-only-password'),{error:null});assert.deepEqual(calls,[['update',{password:'synthetic-only-password'}]])
})
test('invalid session and provider password policy remain enforced',async()=>{
 const invalid=fake({getUser:async()=>({data:{user:null},error:{}})});assert.equal((await recovery.changeRecoveredPassword(invalid.auth,'abcdefgh','abcdefgh')).error,recovery.expiredRecoveryMessage);assert.equal(invalid.calls.length,0)
 for(const code of ['weak_password','same_password']){
 const {auth}=fake({updateUser:async()=>({error:{code,message:'SECRET raw provider error'}})});await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password?code=fresh'));const r=await recovery.changeRecoveredPassword(auth,'abcdefgh','abcdefgh');assert.ok(r.error);assert.doesNotMatch(r.error,/SECRET|raw provider/)
 }
})
test('friendly errors do not expose provider strings',()=>{
 assert.equal(recovery.recoveryError({code:'otp_expired'}),recovery.expiredRecoveryMessage)
 assert.match(recovery.recoveryError({status:429}),/quá nhiều/)
 assert.doesNotMatch(recovery.recoveryError({code:'unknown',message:'sensitive'}),/sensitive/)
})
test('login keeps sign-in and offers forgot password; recovery pages are present',()=>{
 const login=fs.readFileSync('app/login/page.tsx','utf8')
 assert.match(login,/Quên mật khẩu\?/);assert.match(login,/Sign in/);assert.match(login,/action=\{login\}/)
 assert.match(fs.readFileSync('app/forgot-password/page.tsx','utf8'),/Quên mật khẩu/)
 assert.match(fs.readFileSync('app/forgot-password/ForgotPasswordForm.tsx','utf8'),/Gửi liên kết đặt lại mật khẩu/)
 assert.match(fs.readFileSync('app/auth/update-password/page.tsx','utf8'),/Đặt mật khẩu mới/)
 assert.match(fs.readFileSync('app/auth/update-password/UpdatePasswordForm.tsx','utf8'),/Cập nhật mật khẩu/)
 assert.match(fs.readFileSync('app/page.tsx','utf8'),/\/auth\/update-password/)
})
test('public recovery code contains no admin credentials or role writes; session is separate',()=>{
 const client=fs.readFileSync('lib/supabase/recovery-client.ts','utf8');assert.match(client,/isSingleton: false/);assert.match(client,/vibe-password-recovery/);assert.match(client,/detectSessionInUrl: false/);assert.match(client,/scope: 'local'/)
 const form=fs.readFileSync('app/auth/update-password/UpdatePasswordForm.tsx','utf8');assert.match(form,/await endRecoverySession/);assert.match(form,/location.replace\('\/login\?recovery=success'\)/);assert.match(form,/history.replaceState/)
 const source=client+form+fs.readFileSync('lib/auth/password-recovery.ts','utf8')
 assert.doesNotMatch(source,/SERVICE_ROLE|auth\.admin|updateUserById|role_code|branch_id/)
})

test('a successful OTP recovery is supported even when Supabase labels its AMR otp',async()=>{
 const {auth}=fake({getClaims:async()=>({data:{claims:{sub:'own-user',session_id:'otp-session',amr:[{method:'otp'}]}},error:null})});assert.equal(await recovery.beginPasswordRecovery(auth,new URL('https://example.com/auth/update-password?type=recovery&token_hash=valid')),true);assert.ok(await recovery.verifiedRecoveryUser(auth))
})
test('non-recovery code and absent or wrong reload proof are rejected',async()=>{
 const other=fake({exchangeCodeForSession:async()=>({data:{session:{},redirectType:'signup'},error:null})});assert.equal(await recovery.beginPasswordRecovery(other.auth,new URL('https://example.com/auth/update-password?code=signup')),false)
 const {auth}=fake();const url=new URL('https://example.com/auth/update-password');assert.equal(await recovery.beginPasswordRecovery(auth,url),false);assert.equal(await recovery.beginPasswordRecovery(auth,url,{get:()=> 'different-session',set:()=>{}}),false)
 const store={value:null,get(){return this.value},set(v){this.value=v}};assert.equal(await recovery.beginPasswordRecovery(auth,new URL(url+'?code=recovery'),store),true);assert.equal(await recovery.beginPasswordRecovery(auth,url,store),true)
})
