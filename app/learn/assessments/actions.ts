'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '../../admin/finance/operations'
import type { DeliveredQuestion } from '@/lib/learning/question-types'
export async function startAssessment(form:FormData) {
  const db=await createClient(),claims=await db.auth.getClaims()
  if(claims.error||!claims.data?.claims) redirect('/login')
  const id=String(form.get('assessment')||''),request=String(form.get('request')||'')
  if(!uuidPattern.test(id)||!uuidPattern.test(request)) redirect('/learn?error=assessment')
  const result=await db.rpc('start_learning_assessment',{p_id:id,p_request:request,p_identity_confirmed:form.get('identity')==='on'})
  if(result.error) redirect('/learn?error=assessment')
  redirect('/learn/assessments/'+request)
}
export async function submitAssessment(form:FormData) {
  const db=await createClient(),claims=await db.auth.getClaims()
  if(claims.error||!claims.data?.claims) redirect('/login')
  const id=String(form.get('attempt')||'')
  if(!uuidPattern.test(id)) redirect('/learn?error=assessment')
  const attempt=await db.from('learning_assessment_attempts').select('question_snapshot').eq('id',id).maybeSingle()
  if(attempt.error||!attempt.data) redirect('/learn?error=assessment')
  const answers:Record<string,unknown>={}
  for(const q of attempt.data.question_snapshot as DeliveredQuestion[]) {
    const name='answer.'+q.code,raw=form.get(name)
    if(q.type==='MULTIPLE_CHOICE'&&q.mode==='AUTO') answers[q.code]=form.getAll(name).filter(v=>typeof v==='string')
    else if(q.type==='TRUE_FALSE'&&q.mode==='AUTO') {if(raw==='true'||raw==='false')answers[q.code]=raw==='true'}
    else if(typeof raw==='string'&&raw.length<=10000) answers[q.code]=raw
  }
  const result=await db.rpc('submit_learning_assessment',{p_attempt:id,p_answers:answers})
  if(result.error) redirect('/learn/assessments/'+id+'?error=1')
  revalidatePath('/learn');redirect('/learn/assessments/'+id)
}
