import { requestClaims, requestRole } from '@/lib/auth/request'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { readCredential } from '@/lib/integrations/zalo/oauth'
import { zaloAccessHeaders } from '@/lib/integrations/zalo/app-secret-proof'
import { tuitionResponseGetUrl } from '@/lib/integrations/zalo/tuition-response-sync'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export async function GET() {
 const claims=await requestClaims()
 if(claims.error || !claims.data?.claims) return Response.json({ok:false},{status:401})
 const role=await requestRole('SUPER_ADMIN')
 if(role.error || role.data!==true) return Response.json({ok:false},{status:403})
 const credential=await readCredential(zaloServiceClient())
 const secret=process.env.ZALO_APP_SECRET?.trim()
 if(!credential?.access_token || !secret) return Response.json({state:'NOT_CONFIGURED'})
 const headers={...zaloAccessHeaders(credential.access_token,secret),accept:'application/json'}
 const url=tuitionResponseGetUrl({templateId:'645192',fromMs:1791786000000,toMs:Date.now(),offset:0,limit:50})
 const response=await fetch(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)})
 const body=await response.json()
 return Response.json({httpStatus:response.status,providerError:typeof body.error==='number'?body.error:null,total:body.data?.total??null,webhookSecretConfigured:!!process.env.ZALO_OA_SECRET_KEY?.trim(),webhookUrlConfigured:!!process.env.ZALO_WEBHOOK_URL?.trim(),appMatch:credential.app_id===process.env.ZALO_APP_ID?.trim(),oaMatch:credential.oa_id===process.env.ZALO_OA_ID?.trim()},{headers:{'Cache-Control':'no-store'}})
}
