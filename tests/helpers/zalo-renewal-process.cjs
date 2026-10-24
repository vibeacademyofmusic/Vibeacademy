const {createClient}=require('@supabase/supabase-js')
const load=require('./zalo-module-loader.cjs')()
const {getZaloCredential}=load('lib/integrations/zalo/oauth.ts')
const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const env={ZALO_PILOT_OUTBOUND:'enabled',ZALO_CREDENTIAL_OWNER:'main',ZALO_APP_ID:'777770000000001',ZALO_OA_ID:'777770000000002',ZALO_APP_SECRET:'test-secret',ZALO_OA_ACCESS_TOKEN:'obsolete-env',ZALO_OA_REFRESH_TOKEN:'obsolete-env'}
const json=body=>({ok:true,json:async()=>body})
getZaloCredential(db,env,async(url,init)=>{
 if(url.includes('access_token')){const used=init.body.get('refresh_token');process.send({kind:'refresh',used});await new Promise(r=>setTimeout(r,300));const generation=used==='fixture-refresh-1'?2:3;return json({access_token:'fixture-access-'+generation,refresh_token:'fixture-refresh-'+generation,expires_in:90000})}
 return json(url.includes('getoa')?{error:0,data:{oa_id:env.ZALO_OA_ID}}:{error:0})
}).then(c=>{process.send({kind:'result',version:c.version});process.disconnect()}).catch(()=>{process.send({kind:'failure'});process.exitCode=1;process.disconnect()})
