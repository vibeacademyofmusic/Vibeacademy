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
    const kind=get('kind'),threshold=Number(get('threshold'))
    if(!uuidPattern.test(get('version'))||!get('title')||get('title').length>200||!['PRACTICE','CHECKPOINT','FINAL'].includes(kind)||!get('threshold')||!Number.isFinite(threshold)||threshold<0||threshold>100) redirect('/admin/elearning/assessments?error=invalid')
    const ids=get('question_ids').split(',')
    if(ids.length<1||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!/^\d{1,6}$/.test(id)||Number(id)<1)) redirect('/admin/elearning/assessments?error=invalid')
    const questions=ids.map(id=>{
      const read=(key:string)=>get(`q.${id}.${key}`),type=read('type') as QuestionType,mode=read('mode'),points=Number(read('points'))
      if(!read('prompt')||read('prompt').length>10000||!questionTypes.includes(type)||!['AUTO','HYBRID','MANUAL'].includes(mode)||!Number.isFinite(points)||points<=0||points>1000||['key','options','rubric'].some(k=>read(k).length>10000)) redirect('/admin/elearning/assessments?error=invalid')
      if(mode==='AUTO'&&!automaticQuestionTypes.includes(type)) redirect('/admin/elearning/assessments?error=manual')
      if(mode!=='AUTO'&&!read('rubric')) redirect('/admin/elearning/assessments?error=invalid')
      const options=read('options').split('\n').map(s=>s.trim()).filter(Boolean)
      if(mode==='AUTO'&&type==='TRUE_FALSE'&&!['true','false'].includes(read('key'))) redirect('/admin/elearning/assessments?error=invalid')
      const key=type==='TRUE_FALSE'?read('key')==='true':type==='MULTIPLE_CHOICE'?read('key').split('\n').map(s=>s.trim()).filter(Boolean):read('key')
      return {code:'Q'+id,type,mode,prompt:read('prompt'),points,options,...(mode==='AUTO'?{key}:{rubric:read('rubric')})}
    })
    if(Buffer.byteLength(JSON.stringify(questions),'utf8')>500000) redirect('/admin/elearning/assessments?error=invalid')
    result=await db.rpc('create_learning_assessment',{p_version:get('version'),p_title:get('title'),p_kind:kind,p_threshold:threshold,p_limit:kind==='FINAL'?3:null,p_cooldown:kind==='FINAL'?86400:0,p_questions:questions})
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
