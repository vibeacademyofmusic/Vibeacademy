import { adminClient, pageNumber, type Params } from '../finance/operations'
import { LoadError, Pager } from '../finance/_components/ui'
import { notificationAction } from './actions'
const statuses = ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']
type Job = { id: string; recipient_id: string; channel: string; delivery_mode: string; template_key: string; entity_type: string; entity_id: string; status: string; attempts: number; error_code: string | null; created_at: string }
export default async function Notifications({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient(), page = pageNumber(params.page)
  let query = db.from('notification_jobs').select('id,recipient_id,channel,delivery_mode,template_key,entity_type,entity_id,status,attempts,error_code,created_at').order('created_at', { ascending: false }).order('id').range((page - 1) * 25, page * 25)
  if (statuses.includes(params.status || '')) query = query.eq('status', params.status!)
  if (['EMAIL', 'ZALO', 'IN_APP'].includes(params.channel || '')) query = query.eq('channel', params.channel!)
  const result = await query
  if (result.error) return <LoadError/>
  const jobs = (result.data || []) as Job[]
  const button = (j: Job, action: string, text: string) => <form action={notificationAction}><input type="hidden" name="id" value={j.id}/><button className="rounded border px-3 py-2" name="action" value={action}>{text}</button></form>
  return <article className="min-w-0 space-y-5"><h1 className="text-2xl font-bold">Hàng đợi thông báo</h1><p>EMAIL/ZALO chưa kết nối nhà cung cấp: gửi thật đang hoãn. IN_APP xác nhận khi lưu vào hộp thông báo. MOCK chỉ là kiểm thử, không phải gửi thật.</p>
    {params.error && <p role="alert">Không thể xử lý. Kiểm tra nguồn, quyền và trạng thái hiện tại.</p>}{params.success && <p role="status">Đã xử lý yêu cầu.</p>}
    <form className="flex flex-wrap gap-3"><label>Trạng thái<select className="ml-2 rounded border p-2" name="status" defaultValue={params.status || ''}><option value="">Tất cả</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><label>Kênh<select className="ml-2 rounded border p-2" name="channel" defaultValue={params.channel || ''}><option value="">Tất cả</option>{['IN_APP', 'EMAIL', 'ZALO'].map(s => <option key={s}>{s}</option>)}</select></label><button className="rounded border px-3">Lọc</button></form>
    <details><summary>Tạo thông báo từ dữ liệu đã có</summary><form action={notificationAction} className="mt-3 flex flex-wrap gap-3"><input type="hidden" name="action" value="ENQUEUE"/><label>Sự kiện<select className="block rounded border p-2" name="event">{['ONBOARDING', 'TUITION_REMINDER', 'LEARNING_REPORT', 'SCHEDULE_CHANGED', 'ATTENDANCE_NOTICE', 'FEEDBACK_FOLLOW_UP'].map(e => <option key={e}>{e}</option>)}</select></label><label>ID nguồn<input className="block rounded border p-2" name="id" required/></label><label>Kênh<select className="block rounded border p-2" name="channel">{['IN_APP', 'EMAIL', 'ZALO'].map(c => <option key={c}>{c}</option>)}</select></label><button className="rounded border px-3">Tạo hàng đợi</button></form><p className="text-sm">Người nhận và nội dung được xác định từ dữ liệu nguồn; tạo lại không nhân đôi thông báo.</p></details>
    {!jobs.length && <p>Chưa có thông báo phù hợp.</p>}{jobs.slice(0, 25).map(j => <section key={j.id} className="space-y-2 break-words rounded border p-4"><h2 className="font-semibold">{j.template_key} · {j.channel} · {j.delivery_mode}</h2><p>{j.status} · Số lần xử lý: {j.attempts}</p><p>Người nhận: {j.recipient_id}</p><p>Nguồn: {j.entity_type} / {j.entity_id}</p>{j.error_code && <p role="alert">Lỗi: {j.error_code}</p>}<div className="flex flex-wrap gap-3">{j.status === 'FAILED' && button(j, 'RETRY', 'Thử lại')}{['PENDING', 'FAILED'].includes(j.status) && button(j, 'CANCEL', 'Hủy')}{j.status === 'PENDING' && j.channel === 'IN_APP' && j.delivery_mode === 'LIVE' && button(j, 'DELIVER', 'Chuyển vào hộp thông báo')}</div></section>)}
    <Pager path="/admin/notifications" params={params} page={page} more={jobs.length > 25}/>
  </article>
}
