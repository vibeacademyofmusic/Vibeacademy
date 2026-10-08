const http=require('node:http');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {createClient}=require('@supabase/supabase-js');
const api='http://127.0.0.1:54321';
const id='25073c07-90f9-415a-8862-8dbdadd9c8b0',email='admin@vibe.local';
function createRecoveryServer({admin,createSessionClient,onVerified=()=>{},onDenied=()=>{},now=Date.now,ttlMs=1800000,initialVerified=false}) {
const sessions=new Map();let busy=false,completed=initialVerified;
const sharedTokens=fs.readFileSync(path.resolve(__dirname,'../app/globals.css'),'utf8').match(/:root\s*\{[^}]*--vibe-navy[^}]*\}/)?.[0]||'';
const style=sharedTokens+'body{margin:0;background:var(--vibe-surface-soft);color:var(--vibe-ink);font:16px system-ui,sans-serif}main{box-sizing:border-box;width:calc(100% - 32px);max-width:536px;margin:32px auto;padding:22px;background:var(--vibe-surface);border:1px solid var(--vibe-line);border-radius:12px}h1{font-size:24px}label{display:block;margin-top:20px;font-weight:600}input{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;border:1px solid var(--vibe-line);border-radius:7px;font:inherit}button,a{display:block;margin-top:22px}button{width:100%;padding:12px;border:0;border-radius:8px;background:var(--vibe-navy);color:var(--vibe-surface);font:inherit;cursor:pointer}small{color:var(--vibe-muted);line-height:1.5}:focus-visible{outline:2px solid var(--vibe-gold);outline-offset:3px}';
function page(text,form='',status=200){return {status,html:`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VIBE LOCAL — Đặt lại mật khẩu admin</title><style>${style}</style><main><small>VIBE LOCAL · chỉ trên máy này</small><h1>Đặt lại mật khẩu admin</h1><p><strong>${email}</strong></p><p>${text}</p>${form}</main></html>`};}
function recoveryForm(csrf,checked=false){
 const check=`<form method="post" action="/check"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">Kiểm tra kết nối biểu mẫu</button></form>`;
 const password=`<form method="post" action="/reset"><input type="hidden" name="csrf" value="${csrf}"><label for="password">Mật khẩu mới</label><input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><label for="confirm">Nhập lại mật khẩu mới</label><input id="confirm" name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><button type="submit">Đặt lại mật khẩu tài khoản local</button></form>`;
 return checked?password:check;
}
function reply(res,p,extra={}){res.writeHead(p.status,{'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(p.html),'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra});res.end(p.html);}
const server=http.createServer(async(req,res)=>{
 const expectedHost='127.0.0.1:'+server.address().port;
 const expectedOrigin='http://'+expectedHost;
 const cookieName='vibe_local_recovery_'+server.address().port;
 const cookieValue=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 for(const [key,value] of sessions)if(value.expires<=now())sessions.delete(key);
 if(req.headers.host!==expectedHost)return reply(res,page('Địa chỉ không hợp lệ. Hãy dùng trang khôi phục local đã mở.', '',403));
 if(req.method==='GET'&&['/','/reset','/check'].includes(req.url)){
  if(req.url!=='/'){res.writeHead(303,{'Location':'/','Cache-Control':'no-store'});return res.end();}
  if(completed)return reply(res,page('Đã đặt lại mật khẩu. Kiểm tra đăng nhập thật và quyền SUPER_ADMIN thành công. Hãy đăng nhập lại tại VIBE local.','<a href="http://127.0.0.1:3000/login">Mở trang đăng nhập VIBE local</a>'));
  const sid=cookieValue&&sessions.has(cookieValue)?cookieValue:crypto.randomBytes(24).toString('hex');
  if(!sessions.has(sid)){if(sessions.size>=100)return reply(res,page('Có quá nhiều phiên đang mở. Hãy thử lại sau.', '',429));sessions.set(sid,{csrf:crypto.randomBytes(24).toString('hex'),expires:now()+ttlMs});}
  const csrf=sessions.get(sid).csrf;
  const checked=sessions.get(sid).connectionVerified===true;
  return reply(res,page(checked?'Kết nối biểu mẫu đã xác minh. Bạn tự nhập mật khẩu mới. ID và quyền được giữ nguyên.':'Kiểm tra kết nối trước khi nhập mật khẩu. Bước này không đổi tài khoản và không cần mật khẩu.',recoveryForm(csrf,checked)),{'Set-Cookie':`${cookieName}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(ttlMs/1000)}`});
 }
 if(req.method!=='POST'||!['/reset','/check'].includes(req.url)){res.writeHead(404);return res.end();}
 const sid=cookieValue;
 if(completed&&req.headers.origin===expectedOrigin){res.writeHead(303,{'Location':'/','Cache-Control':'no-store'});return res.end();}
 if(req.headers.origin!==expectedOrigin||!sid||!sessions.has(sid)){onDenied({reason:req.headers.origin!==expectedOrigin?'ORIGIN':!sid?'COOKIE_MISSING':'SESSION_EXPIRED',origin_null:req.headers.origin==='null'});return reply(res,page('Phiên biểu mẫu không hợp lệ hoặc đã hết hạn. Chưa đặt lại mật khẩu. Hãy mở lại biểu mẫu trong cùng trình duyệt.','<a href="/">Mở lại biểu mẫu</a>',403));}
 if(completed||busy)return reply(res,page('Yêu cầu đã hoàn tất hoặc đang xử lý. Không gửi lại thay đổi mật khẩu.','<a href="/">Xem trạng thái</a>',409));
 if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))return reply(res,page('Định dạng biểu mẫu không hợp lệ.', '',415));
 let body='',mutationAttempted=false;try{
  for await(const chunk of req){body+=chunk.toString();if(body.length>4096)throw Error('Too large');}
  const fields=new URLSearchParams(body),password=fields.get('password');
  if(fields.get('csrf')!==sessions.get(sid).csrf)return reply(res,page('Biểu mẫu không hợp lệ. Chưa đặt lại mật khẩu.','<a href="/">Mở lại biểu mẫu</a>',403));
  if(req.url==='/check'){sessions.get(sid).connectionVerified=true;return reply(res,page('Kết nối biểu mẫu đã xác minh. Cookie, Origin và bảo vệ chống giả mạo hoạt động. Bạn tự nhập mật khẩu mới.',recoveryForm(sessions.get(sid).csrf,true)));}
  if(!password||password.length<12||password.length>128||password!==fields.get('confirm'))return reply(res,page('Mật khẩu phải có ít nhất 12 ký tự và hai ô phải giống nhau.','<a href="/">Nhập lại</a>'),{});
  if(busy||completed)return reply(res,page('Yêu cầu đang được xử lý hoặc đã hoàn tất.','<a href="/">Xem trạng thái</a>',409));
  busy=true;
  const existing=await admin.auth.admin.getUserById(id);
  if(existing.error||existing.data.user.email!==email)throw Error('Identity mismatch');
  const profile=await admin.from('profiles').select('id,status').eq('id',id).single();
  const role=await admin.from('roles').select('id').eq('code','SUPER_ADMIN').single();
  if(profile.error||profile.data.status!=='ACTIVE'||role.error)throw Error('Profile mismatch');
  const assignments=await admin.from('user_roles').select('id').eq('user_id',id).eq('role_id',role.data.id).eq('is_active',true).is('branch_id',null);
  if(assignments.error||!assignments.data.length)throw Error('Role mismatch');
  mutationAttempted=true;
  const updated=await admin.auth.admin.updateUserById(id,{password});
  if(updated.error)throw Error('Reset refused');
  const client=createSessionClient();
  const login=await client.auth.signInWithPassword({email,password});
  if(login.error||login.data.user.id!==id)throw Error('Login verification failed');
  const verified=await client.rpc('has_role',{role_code:'SUPER_ADMIN'});await client.auth.signOut();
  if(verified.error||verified.data!==true)throw Error('Role verification failed');
  completed=true;sessions.clear();onVerified({user_id:id,login:'PASS',SUPER_ADMIN:true});
  res.writeHead(303,{'Location':'/','Cache-Control':'no-store'});res.end();

 }catch{reply(res,page(mutationAttempted?'Chưa xác minh được kết quả. Mật khẩu có thể đã đổi. Không gửi lại; cần kiểm tra Auth local.':'Yêu cầu chưa đổi mật khẩu. Không có quyền hoặc hồ sơ nào bị thay đổi.','<a href="/">Quay lại</a>',400));}
 finally{busy=false;body='';}
});
server.requestTimeout=15000;server.headersTimeout=10000;
return server;
}
async function main(){
const env={};
for(const line of fs.readFileSync(path.resolve(__dirname,'../.env.local'),'utf8').split('\n')){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}
if(env.NEXT_PUBLIC_SUPABASE_URL!==api||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Refusing non-local configuration');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>{if(new URL(typeof input==='string'?input:input.url).origin!==api)throw Error('External request blocked');return fetch(input,{...init,redirect:'error',signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});}}};
const admin=createClient(api,env.SUPABASE_SERVICE_ROLE_KEY,options);

const existing=await admin.auth.admin.getUserById(id);
if(existing.error||existing.data.user.email!==email)throw Error('Local account preflight failed');
const server=createRecoveryServer({admin,createSessionClient:()=>createClient(api,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options),onVerified:result=>console.log(JSON.stringify({event:'LOCAL_RESET_VERIFIED',...result})),onDenied:result=>console.log(JSON.stringify({event:'LOCAL_FORM_DENIED',...result}))});
server.listen(3004,'127.0.0.1',()=>console.log('LOCAL_RECOVERY_READY: http://127.0.0.1:3004; no credential changes until user submits.'));
setTimeout(()=>server.close(),30*60*1000).unref();
}
if(require.main===module)main().catch(()=>{console.error('Local recovery preflight failed; credentials omitted.');process.exitCode=1});
module.exports={createRecoveryServer};
