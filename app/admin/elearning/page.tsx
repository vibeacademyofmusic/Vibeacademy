import Link from 'next/link'
import { adminClient,pageNumber } from '../finance/operations'
import { learningAdminAction } from './actions'
const field='w-full rounded border p-2'
const nextAction:Record<string,string>={DRAFT:'SUBMIT',IN_REVIEW:'APPROVE',APPROVED:'PUBLISH',PUBLISHED:'RETIRE'}
const nextLabel:Record<string,string>={DRAFT:'Gửi duyệt',IN_REVIEW:'Duyệt độc lập',APPROVED:'Xuất bản',PUBLISHED:'Ngừng cung cấp'}
const stages:Record<string,string>={DRAFT:'Bản nháp',IN_REVIEW:'Chờ duyệt',APPROVED:'Đã duyệt',PUBLISHED:'Đã xuất bản',RETIRED:'Ngừng cung cấp'}
export default async function LearningAdmin({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const p=await searchParams,db=await adminClient(),page=pageNumber(p.page)
  const [versions,levels,curriculums,grants]=await Promise.all([
    db.from('learning_versions').select('id,title,version,state,source_scope').order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25),
    db.from('curriculum_levels').select('id,name,curriculum_id').eq('status','ACTIVE').order('sequence_no').limit(500),
    db.from('curriculums').select('id,name').eq('status','ACTIVE').order('name').limit(500),
    db.from('learning_access_grants').select('id,enrollment_id,valid_from,valid_until,revoked_at,reason').order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25),
  ])
  const levelOptions=levels.data?.map(l=><option key={l.id} value={l.id}>{curriculums.data?.find(c=>c.id===l.curriculum_id)?.name} — {l.name}</option>)
  return <div className="space-y-6 p-4 sm:p-6"><Link prefetch={false} href="/admin/elearning/assessments" className="text-blue-700 underline">Đề đánh giá và chấm bài</Link><Link prefetch={false} href="/admin/elearning/notation" className="text-blue-700 underline">Kiểm tra ký âm</Link><Link prefetch={false} href="/admin/elearning/reconciliation" className="text-blue-700 underline">Đối chiếu Academic</Link><Link prefetch={false} href="/admin/elearning/theory" className="text-blue-700 underline">Biên soạn Theory theo Contents</Link><Link prefetch={false} href="/admin/elearning/analytics" className="text-blue-700 underline">Thống kê học trực tuyến</Link><h1 className="text-2xl font-semibold">Nội dung học trực tuyến</h1>
    <p>Bản xuất bản được giữ nguyên. Người tạo không được tự duyệt. Tiến độ học không tự thay đổi kết quả Academic.</p>
    {p.success&&<p role="status" className="text-green-700">Đã ghi nhận.</p>}
    {p.error&&<p role="alert" className="text-red-700">{p.error==='reviewer'?'Cần một quản trị viên khác duyệt nội dung.':'Không thể thực hiện. Kiểm tra dữ liệu, phiên bản và quyền truy cập.'}</p>}
    {[versions,levels,curriculums,grants].some(r=>r.error)&&<p role="alert">Không tải được đầy đủ dữ liệu.</p>}
    <section className="space-y-3"><h2 className="font-semibold">Phiên bản nội dung</h2>{versions.data?.slice(0,25).map(v=><article key={v.id} className="rounded border p-3"><h3>{v.title} · v{v.version} · {stages[v.state]}</h3><p className="text-sm">{v.source_scope}</p><Link prefetch={false} className="text-blue-700 underline" href={"/admin/elearning/"+v.id}>Xem toàn bộ nội dung để duyệt</Link>
      {v.state!=='RETIRED'&&<form action={learningAdminAction} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={v.id}/><input type="hidden" name="action" value={nextAction[v.state]}/><label>Lý do / xác nhận nội dung nguyên gốc<input className={field} name="reason" required maxLength={2000}/></label><button className="rounded border px-3">{nextLabel[v.state]}</button></form>}
    </article>)}</section>
    <details className="rounded border p-4"><summary>Tạo bản nháp bài học</summary><form action={learningAdminAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="action" value="CREATE"/><label>Grade<select className={field} name="level" required>{levelOptions}</select></label><label>Phiên bản<input className={field} type="number" name="version" min="1" required/></label>
      {([['title','Tên phiên bản'],['source','Phạm vi nguồn và tác giả nội dung'],['module_code','Mã module theo Contents'],['module_title','Tên module theo Contents'],['lesson_code','Mã bài học'],['lesson_title','Tên bài học']] as const).map(([name,label])=><label key={name}>{label}<input className={field} name={name} required maxLength={name==='source'?2000:200}/></label>)}
      <label className="sm:col-span-2">Nội dung VIBE tự biên soạn<textarea className={field} name="body" rows={6} maxLength={10000} required/></label><button className="rounded bg-blue-700 p-2 text-white">Lưu bản nháp</button>
    </form></details>
    <details className="rounded border p-4"><summary>Cấp quyền học có thời hạn</summary><form action={learningAdminAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="action" value="GRANT"/>
      <label>Mã ghi danh đã xác minh<input className={field} name="enrollment" required/></label><label>Grade<select className={field} name="level" required>{levelOptions}</select></label><label>Từ ngày (giờ Việt Nam)<input className={field} type="date" name="from" required/></label><label>Hết quyền lúc 00:00 ngày<input className={field} type="date" name="until" required/></label><label>Lý do cấp quyền<input className={field} name="reason" maxLength={2000} required/></label><button className="rounded border p-2">Cấp quyền</button>
    </form></details>
    <section className="space-y-3"><h2 className="font-semibold">Quyền học đã cấp</h2>{grants.data?.slice(0,25).map(g=><article key={g.id} className="break-words rounded border p-3"><p>Ghi danh: {g.enrollment_id}</p><p>{g.reason}</p><p>Hết hạn: {new Date(g.valid_until).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}{g.revoked_at?' · Đã thu hồi':''}</p>{!g.revoked_at&&<form action={learningAdminAction}><input type="hidden" name="action" value="REVOKE"/><input type="hidden" name="id" value={g.id}/><label>Lý do thu hồi<input className={field} name="reason" required maxLength={2000}/></label><button className="rounded border p-2">Thu hồi quyền</button></form>}</article>)}</section>
    <nav className="flex gap-4">{page>1&&<Link prefetch={false} href={'/admin/elearning?page='+(page-1)}>Trang trước</Link>}{Math.max(versions.data?.length||0,grants.data?.length||0)>25&&<Link prefetch={false} href={'/admin/elearning?page='+(page+1)}>Trang sau</Link>}</nav>
  </div>
}
