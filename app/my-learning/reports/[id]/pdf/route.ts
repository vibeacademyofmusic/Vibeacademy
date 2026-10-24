import { createClient } from '@/lib/supabase/server'
import { renderLearningPdf } from '@/lib/reports/pdf'
export const runtime='nodejs'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params,db=await createClient(),auth=await db.auth.getClaims()
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}
  if(!auth.data?.claims)return Response.redirect(new URL('/login?next='+encodeURIComponent(`/my-learning/reports/${id}/pdf`),request.url),303)
  if(!/^[0-9a-f-]{36}$/i.test(id))return new Response('Không tìm thấy',{status:404,headers})
  const result=await db.rpc('learning_report_document',{p_id:id})
  if(result.error||!result.data)return new Response('Không tìm thấy hoặc không có quyền xem báo cáo.',{status:404,headers})
  try {
    const buffer=await renderLearningPdf(result.data)
    return new Response(new Uint8Array(buffer),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="vibe-learning-report-${id}-v${result.data.version}.pdf"`}})
  } catch {return new Response('Chưa tạo được PDF. Vui lòng thử lại.',{status:503,headers})}
}
