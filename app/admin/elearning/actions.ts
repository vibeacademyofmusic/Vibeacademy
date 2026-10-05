'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '../finance/operations'
export async function learningAdminAction(form: FormData) {
  const db=await adminClient(),get=(key:string)=>typeof form.get(key)==='string'?String(form.get(key)).trim():''
  const action=get('action'),id=get('id'),reason=get('reason')
  let result
  if(action==='CREATE') {
    const level=get('level'),version=Number(get('version'))
    if(!uuidPattern.test(level)||!Number.isSafeInteger(version)||version<1||!get('title')||!get('source')||!get('module_title')||!get('lesson_title')||!get('body')||get('body').length>10000||!/^[A-Z0-9._-]{1,50}$/.test(get('module_code'))||!/^[A-Z0-9._-]{1,80}$/.test(get('lesson_code'))) redirect('/admin/elearning?error=invalid')
    result=await db.rpc('create_learning_version',{p_level:level,p_version:version,p_title:get('title'),p_source_scope:get('source'),p_content:{modules:[{code:get('module_code'),title:get('module_title'),lessons:[{code:get('lesson_code'),title:get('lesson_title'),blocks:[{type:'TEXT',text:get('body')}]}]}]}})
  } else if(action==='GRANT') {
    if(!uuidPattern.test(get('enrollment'))||!uuidPattern.test(get('level'))||!validDate(get('from'))||!validDate(get('until'))||get('until')<=get('from')||!reason) redirect('/admin/elearning?error=invalid')
    result=await db.rpc('grant_learning_access',{p_enrollment:get('enrollment'),p_level:get('level'),p_from:get('from')+'T00:00:00+07:00',p_until:get('until')+'T00:00:00+07:00',p_reason:reason})
  } else if(['SUBMIT','APPROVE','PUBLISH','RETIRE','REVOKE'].includes(action)&&uuidPattern.test(id)&&reason) {
    result=action==='REVOKE'?await db.rpc('revoke_learning_access',{p_grant:id,p_reason:reason}):await db.rpc('transition_learning_version',{p_id:id,p_action:action,p_reason:reason})
  } else redirect('/admin/elearning?error=invalid')
  if(result.error) redirect('/admin/elearning?error='+ (result.error.message==='Independent content reviewer required'?'reviewer':'failed'))
  revalidatePath('/admin/elearning');revalidatePath('/learn');redirect('/admin/elearning?success=1')
}
