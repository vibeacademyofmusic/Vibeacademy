import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '../../../admin/finance/operations'
import { assessmentStates, notationQuestionTypes, type DeliveredQuestion } from '@/lib/learning/question-types'
import { submitAssessment } from '../actions'
import NotationEditor from '../../components/NotationEditor'
export default async function AssessmentAttempt({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  const {id}=await params,p=await searchParams,db=await createClient(),claims=await db.auth.getClaims()
  if(claims.error||!claims.data?.claims) redirect('/login')
  if(!uuidPattern.test(id)) notFound()
  const result=await db.from('learning_effective_assessment_results').select('id,state,score,question_snapshot,policy_snapshot,revision_id').eq('id',id).maybeSingle()
  if(result.error) return <p role="alert" className="p-4">Không tải được bài làm.</p>
  if(!result.data) return <main className="p-4"><p>Bài làm không khả dụng hoặc quyền học đã hết hạn. Kết quả vẫn nằm trong lịch sử của bạn.</p><Link prefetch={false} href="/learn">Về học trực tuyến</Link></main>
  const a=result.data,questions=a.question_snapshot as DeliveredQuestion[]
  return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6"><Link prefetch={false} href="/learn" className="text-blue-700 underline">Về học trực tuyến</Link><h1 className="text-2xl font-semibold">Bài đánh giá</h1><p>Trạng thái: {assessmentStates[a.state]||a.state}</p><p>Ngưỡng đạt: {a.policy_snapshot.threshold}%</p>{a.score!==null&&<p>Điểm: {a.score}%</p>}{a.revision_id&&<p>Kết quả đã được chấm lại có lưu vết; điểm gốc vẫn được giữ để đối chiếu.</p>}{p.error&&<p role="alert">Không nộp được bài. Kiểm tra quyền học và thử lại.</p>}
    {a.state==='PENDING_REVIEW'&&<p>Bài đã nộp và đang chờ chấm. Kết quả chưa được xác nhận.</p>}
    {a.state==='IN_PROGRESS'?<form action={submitAssessment} className="space-y-5"><input type="hidden" name="attempt" value={id}/>{questions.map(q=><fieldset key={q.code} className="space-y-3 rounded border p-4"><legend className="whitespace-pre-wrap break-words font-medium">{q.prompt} ({q.points} điểm)</legend>
      {q.mode==='AUTO'&&['SINGLE_CHOICE','MULTIPLE_CHOICE'].includes(q.type)?q.options?.map((option,index)=><label key={index} className="flex items-start gap-2"><input className="mt-1" type={q.type==='MULTIPLE_CHOICE'?'checkbox':'radio'} name={'answer.'+q.code} value={option}/><span className="break-words">{option}</span></label>):q.mode==='AUTO'&&q.type==='TRUE_FALSE'?<><label className="flex gap-2"><input type="radio" name={'answer.'+q.code} value="true"/>Đúng</label><label className="flex gap-2"><input type="radio" name={'answer.'+q.code} value="false"/>Sai</label></>:notationQuestionTypes.includes(q.type)?<NotationEditor name={'answer.'+q.code}/>:<label className="block">Câu trả lời (giáo viên sẽ chấm)<textarea className="block w-full rounded border p-2" name={'answer.'+q.code} maxLength={10000}/></label>}
    </fieldset>)}<p>Nộp bài sẽ khóa câu trả lời. Kết quả này chưa tự cập nhật Grade.</p><button className="rounded bg-blue-700 px-4 py-2 text-white">Nộp bài đánh giá</button></form>:<p>Bài đã nộp; câu trả lời được giữ nguyên để đối chiếu.</p>}
  </main>
}
