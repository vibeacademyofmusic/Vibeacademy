'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../../finance/operations'
import { theoryDraftContent } from '../../../../lib/learning/theory-authoring'
export async function createTheoryPilot(form:FormData){
  const db=await adminClient(),get=(key:string)=>String(form.get(key)||'').trim(),version=Number(get('version'))
  if(!uuidPattern.test(get('level'))||!Number.isSafeInteger(version)||version<1||!get('title')||get('title').length>200||!get('source')||get('source').length>2000)redirect('/admin/elearning/theory?error=invalid')
  let content
  try{content=theoryDraftContent(form)}catch{redirect('/admin/elearning/theory?error=invalid')}
  if(Buffer.byteLength(JSON.stringify(content),'utf8')>1000000)redirect('/admin/elearning/theory?error=invalid')
  const result=await db.rpc('create_learning_version',{p_level:get('level'),p_version:version,p_title:get('title'),p_source_scope:get('source'),p_content:content})
  if(result.error)redirect('/admin/elearning/theory?error=failed')
  revalidatePath('/admin/elearning');redirect('/admin/elearning/theory?success=1')
}
