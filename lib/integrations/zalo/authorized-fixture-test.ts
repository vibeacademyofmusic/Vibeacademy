import 'server-only'
import { zaloAccessHeaders } from './app-secret-proof'
import { getZaloCredential } from './oauth'
import { zaloServiceClient } from './service'
import { zaloPilotOutboundBlocked } from './pilot-outbound'
import { tuitionManualMatches } from './tuition-test-send'
import { tuitionPaymentParametersAccepted } from '../tuition/payment-send'
import { DEFINITIVE_PHONE_REJECTIONS } from './errors'

type Claim = { result: string; id: string; template_id: string; parameters: Record<string,string>; payment_link_cancelled: boolean; phone: string; tracking_id: string }
export function authorizedFixturePayloadValid(c: Claim) {
 if(c.phone !== '84888803724' || c.parameters.student_name !== 'KIỂM THỬ HP - Hà Quốc An') return false
 if(c.template_id === '645192') return c.parameters.student_code === 'TEST-HP-HA-20261012' && tuitionManualMatches({studentCode:c.parameters.student_code,phone:c.phone,templateId:c.template_id,trackingId:c.tracking_id,eventCode:'RENEWAL_V1',parameters:c.parameters})
 return c.template_id === '645028' && c.payment_link_cancelled === true && c.parameters.invoice_code === 'TEST-HP-HA-20261012' && tuitionPaymentParametersAccepted(c.template_id,c.parameters)
}
export async function dispatchAuthorizedFixtureTest(db: {rpc: (fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>}, testId: string) {
 const admin=zaloServiceClient()
 if(zaloPilotOutboundBlocked()) return {state:'BLOCKED'}
 // Verify connection before reserving the single allowed attempt.
 const credential=await getZaloCredential(admin)
 if(credential.app_id!=='1355275380325944240' || credential.oa_id!=='4520912928458797082') return {state:'BLOCKED'}
 const claim=await db.rpc('claim_authorized_zalo_fixture_test',{p_test:testId})
 const c=claim.data as Claim|null
 if(claim.error || c?.result !== 'CLAIMED') return {state:c?.result || 'BLOCKED'}
 let state='UNKNOWN', message:string|null=null, error:string|null=null
 try {
  if(!authorizedFixturePayloadValid(c)) {state='REJECTED';error='PAYLOAD_MISMATCH'}
  else {
   const headers={...zaloAccessHeaders(credential.access_token!,process.env.ZALO_APP_SECRET!.trim()),accept:'application/json'}
   const info=await fetch(`https://business.openapi.zalo.me/template/info/v2?template_id=${c.template_id}`,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>r.json())
   if(info.error!==0 || info.data?.status!=='ENABLE' || String(info.data?.templateId)!==c.template_id) {state='REJECTED';error='TEMPLATE_NOT_ENABLED'}
   else {
    const r=await fetch('https://business.openapi.zalo.me/message/template',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({phone:c.phone,template_id:c.template_id,template_data:c.parameters,tracking_id:c.tracking_id}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)})
    const body=await r.json()
    if(r.ok && body.error===0 && /^[A-Za-z0-9_-]{1,80}$/.test(body.data?.msg_id || '')) {state='ACCEPTED';message=body.data.msg_id}
    else if(r.status<500 && DEFINITIVE_PHONE_REJECTIONS.has(body.error)) {state='REJECTED';error=String(body.error)}
   }
  }
 } catch {state='UNKNOWN'}
 const saved=await admin.rpc('finish_authorized_zalo_fixture_test',{p_test:testId,p_state:state,p_message:message,p_error:error})
 if(saved.error) return {state:'SAVE_FAILED',messageId:message}
 return {state,messageId:message}
}
