const fs=require('node:fs'),assert=require('node:assert/strict')
const {createServerClient}=require('@supabase/ssr')
const {execFileSync}=require('node:child_process')
const {dir,map}=require('./local-student-academic-zalo-e2e.cjs')
async function main(){
 const env=Object.fromEntries([...execFileSync('node_modules/.bin/supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).matchAll(/^([A-Z0-9_]+)="([^"]*)"$/gm)].map(m=>[m[1],m[2]]))
 if(env.API_URL!=='http://127.0.0.1:54321')throw Error('Not local')
 const accounts=JSON.parse(fs.readFileSync('/tmp/vibe-e2e-aca-20260928-accounts.json'))
 const evidence=[]
 for(const actor of ['P1','P2','S1']){
  const jar=new Map()
  const c=createServerClient(env.API_URL,env.ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(x=>jar.set(x.name,x.value))}})
  const r=await c.auth.signInWithPassword({email:accounts[actor].email,password:accounts[actor].password});assert.ok(!r.error)
  for(const type of ['MONTHLY','END_OF_COURSE']){
   const url=`http://localhost:3000/my-learning/reports/${map.objects[type].id}/pdf?utm_source=zalo`
   const res=await fetch(url,{headers:{cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; ')},redirect:'manual'})
   assert.equal(res.status,actor==='P2'?404:200,`${actor} ${type}`)
   const data=Buffer.from(await res.arrayBuffer())
   if(actor!=='P2'){assert.equal(data.subarray(0,5).toString(),'%PDF-');assert.match(res.headers.get('content-type'),/application\/pdf/);assert.match(res.headers.get('cache-control'),/private.*no-store/);if(actor==='P1')fs.writeFileSync(`${dir}/${type.toLowerCase()}.pdf`,data)}
   evidence.push({actor,type,status:res.status,bytes:data.length,contentType:res.headers.get('content-type'),cacheControl:res.headers.get('cache-control'),at:new Date().toISOString()})
  }
 }
 fs.writeFileSync(`${dir}/pdf-evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
