'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '../admin/finance/operations'
export async function learningActivity(form:FormData) {
  const db=await createClient(),claims=await db.auth.getClaims()
  if(claims.error||!claims.data?.claims) redirect('/login')
  const version=String(form.get('version')||''),lesson=String(form.get('lesson')||''),kind=String(form.get('kind')||''),request=String(form.get('request')||''),response=String(form.get('response')||'')
  if(!uuidPattern.test(version)||!/^[A-Z0-9._-]{1,80}$/.test(lesson)||!['COMPLETE_LESSON','PRACTICE'].includes(kind)||(kind==='PRACTICE'&&(!uuidPattern.test(request)||!response.trim()||response.length>10000))) redirect('/learn?error=invalid')
  const result=await db.rpc('record_learning_activity',{p_version:version,p_lesson:lesson,p_kind:kind,p_request:kind==='PRACTICE'?request:null,p_response:kind==='PRACTICE'?{reflection:response}:{}})
  if(result.error) redirect('/learn?error=access')
  revalidatePath('/learn');redirect('/learn?version='+version+'&success=1')
}
