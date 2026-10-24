'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../../finance/operations'
export async function mapAcademicShadow(form:FormData){
  const db=await adminClient(),get=(key:string)=>String(form.get(key)||'').trim()
  if(!uuidPattern.test(get('version'))||!uuidPattern.test(get('subject'))||!get('reason')||get('reason').length>2000||get('confirmed')!=='on') redirect('/admin/elearning/reconciliation?error=invalid')
  const result=await db.rpc('map_learning_academic_shadow',{p_version:get('version'),p_subject:get('subject'),p_reason:get('reason')})
  if(result.error) redirect('/admin/elearning/reconciliation?error=failed')
  revalidatePath('/admin/elearning/reconciliation');redirect('/admin/elearning/reconciliation?success=1')
}
