import { adminClient, pageNumber, uuidPattern, validDate, type Params } from '../finance/operations'
import { LoadError, Pager } from '../finance/_components/ui'
import { notificationAction } from './actions'

const statuses = ['QUEUED', 'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'SKIPPED_NO_CHANNEL', 'CANCELLED']
const events = ['REGISTRATION_COMPLETED', 'PAYMENT_CONFIRMED', 'CLASS_ASSIGNED', 'FIRST_CLASS_UPCOMING', 'SCHEDULE_CHANGED', 'LEARNING_REPORT_PUBLISHED', 'END_OF_COURSE_REPORT_PUBLISHED', 'TUITION_REMINDER', 'COURSE_EXPIRING', 'ONBOARDING', 'LEARNING_REPORT', 'ATTENDANCE_NOTICE', 'FEEDBACK_FOLLOW_UP']
const labels: Record<string, string> = {
  QUEUED: 'Đang chờ',
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  SENT: 'Đã gửi',
  DELIVERED: 'Đã nhận',
  FAILED: 'Thất bại',
  RETRYING: 'Đang thử lại',
  SKIPPED_NO_CHANNEL: 'Bỏ qua',
  CANCELLED: 'Đã hủy',
}
const permanentZaloErrors = ['ZALO_OUTBOUND_NOT_CONFIGURED', 'TEMPLATE_NOT_APPROVED', 'PROVIDER_NOT_CONFIGURED', 'RECIPIENT_INELIGIBLE']
type Job = { id: string; recipient_id: string | null; channel: string; delivery_mode: string; template_key: string; entity_type: string; entity_id: string; status: string; attempts: number; error_code: string | null; created_at: string }
type Branch = { id: string; name: string }

export default async function Notifications({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient(), page = pageNumber(params.page)
  let query = db.from('notification_jobs').select('id,recipient_id,channel,delivery_mode,template_key,entity_type,entity_id,status,attempts,error_code,created_at').order('created_at', { ascending: false }).order('id').range((page - 1) * 25, page * 25)
  if (statuses.includes(params.status || '')) query = query.eq('status', params.status!)
  if (['EMAIL', 'ZALO', 'IN_APP'].includes(params.channel || '')) query = query.eq('channel', params.channel!)
  if (events.includes(params.event || '')) query = query.eq('entity_type', params.event!)
  if (uuidPattern.test(params.branch || '')) query = query.eq('branch_id', params.branch!)
  if (validDate(params.on || '')) {
    const next = new Date(`${params.on}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    query = query.gte('created_at', params.on!).lt('created_at', next.toISOString().slice(0, 10))
  }
  const [result, branchResult] = await Promise.all([query, db.from('branches').select('id,name').order('name')])
  if (result.error) return <LoadError/>
  const jobs = (result.data || []) as Job[]
  const branches = (branchResult.data || []) as Branch[]
  const button = (j: Job, action: string, text: string) => <form action={notificationAction}><input type="hidden" name="id" value={j.id}/><button className="rounded border px-3 py-2" name="action" value={action}>{text}</button></form>
  const canRetryZalo = (j: Job) => j.channel === 'ZALO' && (j.status === 'SKIPPED_NO_CHANNEL' || (j.status === 'FAILED' && !permanentZaloErrors.includes(j.error_code || '')))
  return <article className="min-w-0 space-y-5"><h1 className="text-2xl font-bold">Hàng đợi thông báo</h1><p>EMAIL/ZALO chưa kết nối nhà cung cấp: gửi thật đang hoãn. Zalo gửi thật đang tắt. IN_APP xác nhận khi lưu vào hộp thông báo. MOCK chỉ là kiểm thử, không phải gửi thật.</p>
    {params.error && <p role="alert">Không thể xử lý. Kiểm tra nguồn, quyền và trạng thái hiện tại.</p>}{params.success && <p role="status">Đã xử lý yêu cầu.</p>}
    <form className="flex flex-wrap gap-3">
      <label>Trạng thái<select className="ml-2 rounded border p-2" name="status" defaultValue={params.status || ''}><option value="">Tất cả</option>{statuses.map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label>
      <label>Kênh<select className="ml-2 rounded border p-2" name="channel" defaultValue={params.channel || ''}><option value="">Tất cả</option>{['IN_APP', 'EMAIL', 'ZALO'].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Sự kiện<select className="ml-2 rounded border p-2" name="event" defaultValue={params.event || ''}><option value="">Tất cả</option>{events.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Ngày<input className="ml-2 rounded border p-2" type="date" name="on" defaultValue={params.on || ''}/></label>
      <label>Chi nhánh<select className="ml-2 rounded border p-2" name="branch" defaultValue={params.branch || ''}><option value="">Tất cả</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <button className="rounded border px-3">Lọc</button>
    </form>
    <details><summary>Tạo thông báo từ dữ liệu đã có</summary><form action={notificationAction} className="mt-3 flex flex-wrap gap-3"><input type="hidden" name="action" value="ENQUEUE"/><label>Sự kiện<select className="block rounded border p-2" name="event">{['ONBOARDING', 'TUITION_REMINDER', 'LEARNING_REPORT', 'SCHEDULE_CHANGED', 'ATTENDANCE_NOTICE', 'FEEDBACK_FOLLOW_UP'].map(e => <option key={e}>{e}</option>)}</select></label><label>ID nguồn<input className="block rounded border p-2" name="id" required/></label><label>Kênh<select className="block rounded border p-2" name="channel">{['IN_APP', 'EMAIL', 'ZALO'].map(c => <option key={c}>{c}</option>)}</select></label><button className="rounded border px-3">Tạo hàng đợi</button></form><p className="text-sm">Người nhận và nội dung được xác định từ dữ liệu nguồn; tạo lại không nhân đôi thông báo. Nội dung đã xếp hàng không sửa tại đây.</p></details>
    {!jobs.length && <p>Chưa có thông báo phù hợp.</p>}{jobs.slice(0, 25).map(j => <section key={j.id} className="space-y-2 break-words rounded border p-4"><h2 className="font-semibold">{j.template_key} · {j.channel} · {j.delivery_mode}</h2><p>{labels[j.status] || j.status} · {j.status} · Số lần xử lý: {j.attempts}</p><p>{j.channel === 'ZALO' ? 'Người nhận Zalo: đã ẩn' : `Người nhận: ${j.recipient_id}`}</p><p>Nguồn: {j.entity_type} / {j.entity_id}</p>{j.error_code && <p role="alert">Lỗi: {j.error_code}</p>}<div className="flex flex-wrap gap-3">{j.status === 'FAILED' && j.channel !== 'ZALO' && button(j, 'RETRY', 'Thử lại')}{canRetryZalo(j) && button(j, 'RETRY', 'Thử lại')}{['PENDING', 'FAILED', 'QUEUED', 'RETRYING', 'SKIPPED_NO_CHANNEL'].includes(j.status) && button(j, 'CANCEL', 'Hủy')}{j.status === 'PENDING' && j.channel === 'IN_APP' && j.delivery_mode === 'LIVE' && button(j, 'DELIVER', 'Chuyển vào hộp thông báo')}</div></section>)}
    <Pager path="/admin/notifications" params={params} page={page} more={jobs.length > 25}/>
  </article>
}
