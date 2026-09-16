'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '../../finance/operations'
import { questionTypes, automaticQuestionTypes, type QuestionType } from '../../../../lib/learning/question-types'
export async function assessmentAdminAction(form:FormData) {
  const db=await adminClient(),get=(key:string)=>String(form.get(key)||'').trim()
  const action=get('action'),id=get('id'),reason=get('reason')
  let result
  if(action==='CREATE') {
    const type=get('type') as QuestionType,mode=get('mode'),kind=get('kind'),threshold=Number(get('threshold')),points=Number(get('points'))
    if(!uuidPattern.test(get('version'))||!get('title')||!get('prompt')||get('prompt').length>10000||!questionTypes.includes(type)||!['AUTO','HYBRID','MANUAL'].includes(mode)||!['PRACTICE','CHECKPOINT','FINAL'].includes(kind)||!get('threshold')||!Number.isFinite(threshold)||threshold<0||threshold>100||!Number.isFinite(points)||points<=0||points>1000) redirect('/admin/elearning/assessments?error=invalid')
    if(mode==='AUTO'&&!automaticQuestionTypes.includes(type)) redirect('/admin/elearning/assessments?error=manual')
    const options=get('options').split('\n').map(s=>s.trim()).filter(Boolean)
    if(mode==='AUTO'&&type==='TRUE_FALSE'&&!['true','false'].includes(get('key'))) redirect('/admin/elearning/assessments?error=invalid')
    const key=type==='TRUE_FALSE'?get('key')==='true':type==='MULTIPLE_CHOICE'?get('key').split('\n').map(s=>s.trim()).filter(Boolean):get('key')
    result=await db.rpc('create_learning_assessment',{p_version:get('version'),p_title:get('title'),p_kind:kind,p_threshold:threshold,p_limit:kind==='FINAL'?3:null,p_cooldown:kind==='FINAL'?86400:0,p_questions:[{code:'Q1',type,mode,prompt:get('prompt'),points,options,...(mode==='AUTO'?{key}:{rubric:get('rubric')})}]})
  } else if(action==='APPROVE'&&uuidPattern.test(id)&&reason) {
    result=await db.rpc('approve_learning_assessment',{p_id:id,p_reason:reason})
  } else if(['REVIEW','REGRADE'].includes(action)&&uuidPattern.test(id)&&reason) {
    if(action==='REGRADE'&&(!uuidPattern.test(get('request'))||(get('revision')&&!uuidPattern.test(get('revision'))))) redirect('/admin/elearning/assessments?error=invalid')
    const marks:Record<string,number>={}
    for(const [key,value] of form.entries()) if(key.startsWith('mark.')) {
      if(typeof value!=='string'||!value.trim()||!Number.isFinite(Number(value))||Number(value)<0) redirect('/admin/elearning/assessments?error=invalid')
      marks[key.slice(5)]=Number(value)
    }
    result=action==='REGRADE'?await db.rpc('regrade_learning_assessment',{p_attempt:id,p_request:get('request'),p_expected_revision:get('revision')||null,p_marks:marks,p_reason:reason}):await db.rpc('review_learning_assessment',{p_attempt:id,p_marks:marks,p_reason:reason})
  } else if(action==='OVERRIDE'&&uuidPattern.test(id)&&uuidPattern.test(get('student'))&&validDate(get('until'))&&reason) {
    const attempts=Number(get('attempts'))
    if(!Number.isSafeInteger(attempts)||attempts<1||attempts>100) redirect('/admin/elearning/assessments?error=invalid')
    result=await db.rpc('override_learning_assessment',{p_assessment:id,p_student:get('student'),p_attempts:attempts,p_until:get('until')+'T00:00:00+07:00',p_reason:reason})
  } else redirect('/admin/elearning/assessments?error=invalid')
  if(result.error) redirect('/admin/elearning/assessments?error='+ (result.error.message==='Independent content reviewer required'?'reviewer':'failed'))
  revalidatePath('/admin/elearning/assessments');revalidatePath('/learn');redirect('/admin/elearning/assessments?success=1')
}
