import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { adminClient, pageNumber, uuidPattern, validDate } from '../finance/operations'
import { inventoryAction } from './actions'

const kinds: Record<string, string> = { RECEIPT: 'Nhập kho', OUTBOUND: 'Xuất kho', TRANSFER: 'Chuyển kho', ADJUSTMENT: 'Điều chỉnh' }
const field = 'rounded border border-gray-300 p-2 w-full'
type Balance = { item_id: string; code: string; name: string; unit: string; opening: number; inbound: number; outbound: number; closing: number }
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams, db = await adminClient(), page = pageNumber(params.page)
  const nowMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date())
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) && validDate(params.month + '-01') ? params.month : nowMonth
  const branches = await db.from('branches').select('id,name,status').order('name').limit(500)
  const branch = params.branch && uuidPattern.test(params.branch) ? params.branch : branches.data?.[0]?.id
  const item = params.item && uuidPattern.test(params.item) ? params.item : undefined
  const historyPage = pageNumber(params.history)
  const [report, history] = await Promise.all([
    branch ? db.rpc('inventory_monthly_report', { p_branch: branch, p_month: month + '-01', p_offset: (page - 1) * 25 }) : Promise.resolve({ data: [], error: null }),
    item ? db.from('inventory_movements').select('id,kind,quantity,reason,branch_id,destination_id,created_at').eq('item_id', item).order('created_at', { ascending: false }).order('id').range((historyPage - 1) * 25, historyPage * 25) : Promise.resolve({ data: [], error: null }),
  ])
  const balances = (report.data || []) as Balance[]
  const query = (updates: Record<string, string>) => '/admin/inventory?' + new URLSearchParams({ branch: branch || '', month, item: item || '', page: String(page), ...updates })
  const branchName = (id: string) => branches.data?.find(b => b.id === id)?.name || id
  return <div className="space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl font-semibold">Kho sách và vật tư</h1>
    <p className="text-sm text-gray-600">Sổ số lượng theo chi nhánh. Biến động kho không tự tạo giao dịch tài chính.</p>
    {params.success && <p role="status" className="text-green-700">Đã ghi nhận.</p>}
    {params.error && <p role="alert" className="text-red-700">{params.error === 'stock' ? 'Số lượng tồn không đủ.' : params.error === 'invalid' ? 'Vui lòng kiểm tra dữ liệu nhập.' : 'Không thể ghi nhận. Kiểm tra mã trùng, quyền truy cập và thử lại.'}</p>}
    {(branches.error || report.error || history.error) && <p role="alert" className="text-red-700">Không tải được đầy đủ dữ liệu kho. Vui lòng tải lại trước khi thao tác.</p>}
    <form key={branch + month} className="flex flex-wrap items-end gap-3">
      <label>Chi nhánh<select className={field} name="branch" defaultValue={branch}>{branches.data?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Tháng<input className={field} type="month" name="month" defaultValue={month} required /></label>
      <button className="rounded border px-4 py-2">Xem đối soát</button>
    </form>
    <section className="space-y-2"><h2 className="text-lg font-semibold">Đầu kỳ + Nhập − Xuất = Cuối kỳ</h2>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Mặt hàng', 'Đơn vị', 'Đầu kỳ', 'Nhập', 'Xuất', 'Cuối kỳ'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead>
        <tbody>{balances.slice(0, 25).map(b => <tr className="border-t" key={b.item_id}><td className="p-2"><Link prefetch={false} className="text-blue-700 underline" href={query({ item: b.item_id, history: '1' })}>{b.code} — {b.name}</Link></td><td className="p-2">{b.unit}</td>{[b.opening, b.inbound, b.outbound, b.closing].map((v, i) => <td className="p-2" key={i}>{Number(v).toLocaleString('vi-VN')}</td>)}</tr>)}</tbody></table></div>
      {!balances.length && !report.error && <p>Chưa có mặt hàng.</p>}
      <nav className="flex gap-4" aria-label="Trang kho">{page > 1 && <Link prefetch={false} href={query({ page: String(page - 1) })}>Trang trước</Link>}{balances.length > 25 && <Link prefetch={false} href={query({ page: String(page + 1) })}>Trang sau</Link>}</nav>
    </section>
    <details className="rounded border p-4"><summary className="cursor-pointer font-semibold">Thêm mặt hàng</summary><form action={inventoryAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="action" value="CREATE" />
      <label>Mã mặt hàng<input className={field} name="code" maxLength={50} required pattern="[A-Za-z0-9][A-Za-z0-9_-]*" /></label>
      <label>Tên mặt hàng<input className={field} name="name" maxLength={200} required /></label>
      <label>Nhóm hàng<input className={field} name="category" maxLength={100} required /></label>
      <label>Đơn vị tính<input className={field} name="unit" maxLength={40} required /></label>
      <button className="rounded bg-blue-700 p-2 text-white">Tạo mặt hàng</button>
    </form></details>
    {item && <section className="space-y-4 rounded border p-4"><h2 className="font-semibold">Mặt hàng: {balances.find(b => b.item_id === item)?.name || item}</h2>
      <form key={item + branch} action={inventoryAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="action" value="POST" /><input type="hidden" name="request" value={randomUUID()} /><input type="hidden" name="item" value={item} />
        <label>Nghiệp vụ<select className={field} name="kind">{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Kho ghi nhận<select className={field} name="branch" defaultValue={branch} required>{branches.data?.filter(b => b.status === 'ACTIVE').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Số lượng<input className={field} type="number" name="quantity" step="0.001" required /><span className="text-xs">Chỉ điều chỉnh mới cho phép số âm.</span></label>
        <label>Kho đến (chỉ chuyển kho)<select className={field} name="destination" defaultValue=""><option value="">Chọn kho đến</option>{branches.data?.filter(b => b.status === 'ACTIVE').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="sm:col-span-2">Lý do<textarea className={field} name="reason" maxLength={2000} required /></label>
        <button className="rounded bg-blue-700 p-2 text-white">Ghi biến động kho</button>
      </form>
      <h3 className="font-semibold">Lịch sử bất biến</h3><ul className="space-y-3">{history.data?.slice(0, 25).map(m => <li key={m.id} className="break-words border-t pt-2 text-sm"><p>{kinds[m.kind]} · {Number(m.quantity).toLocaleString('vi-VN')} · {branchName(m.branch_id)}{m.destination_id ? ' → ' + branchName(m.destination_id) : ''}</p><p>{m.reason}</p><p className="text-gray-500">{new Date(m.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p></li>)}</ul>
      {!history.data?.length && !history.error && <p>Chưa có biến động.</p>}
      <nav className="flex gap-4" aria-label="Trang lịch sử">{historyPage > 1 && <Link prefetch={false} href={query({ history: String(historyPage - 1) })}>Lịch sử trước</Link>}{(history.data?.length || 0) > 25 && <Link prefetch={false} href={query({ history: String(historyPage + 1) })}>Lịch sử sau</Link>}</nav>
    </section>}
  </div>
}
