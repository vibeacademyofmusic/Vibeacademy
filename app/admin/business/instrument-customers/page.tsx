import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { addInstrumentFollowup, linkInstrumentCustomer, openWarrantyCase, transitionWarrantyCase } from './actions'

const filters = [
  { id: 'ACTIVE', label: 'Đang bảo hành' },
  { id: 'EXPIRING', label: 'Hết hạn trong 30 ngày' },
  { id: 'EXPIRED', label: 'Đã hết bảo hành' },
  { id: 'OPEN_CASE', label: 'Đang xử lý' },
  { id: 'WAITING_PART', label: 'Chờ linh kiện' },
  { id: 'COMPLETED', label: 'Đã xong' },
  { id: 'FOLLOW_UP', label: 'Đến hạn giữ liên hệ' },
]
const outcomes = [
  ['KEEP_IN_TOUCH', 'Giữ liên hệ'],
  ['INTERESTED_IN_ACCESSORY', 'Quan tâm phụ kiện'],
  ['UPGRADE_OPPORTUNITY', 'Cơ hội nâng cấp'],
  ['SERVICE_REQUIRED', 'Cần dịch vụ'],
  ['REPURCHASE_INTEREST', 'Quan tâm mua lại'],
  ['REPURCHASED', 'Đã mua lại'],
  ['NOT_INTERESTED', 'Không quan tâm'],
]
const caseStatus: Record<string, string> = {
  OPEN: 'Mới mở', INSPECTING: 'Đang kiểm tra', WAITING_PART: 'Chờ linh kiện', IN_REPAIR: 'Đang sửa', COMPLETED: 'Đã xong', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy',
}

export default async function InstrumentCustomerPage({ searchParams }: { searchParams: Promise<{ view?: string; filter?: string; error?: string; success?: string }> }) {
  const query = await searchParams
  const view = query.view === 'care' ? 'care' : 'warranty'
  const db = await createClient()
  const { data: rows, error } = await db.rpc('list_instrument_customer_care', { p_branch: null, p_filter: query.filter || null })
  const sales = (rows ?? []) as { sale_event_id: string; customer_name: string | null; customer_phone: string | null; product_name: string; brand: string; model: string; serial: string; sold_on: string; warranty_until: string | null; days_remaining: number | null; case_id: string | null; case_status: string | null; last_contact_at: string | null; next_follow_up_on: string | null; outcome: string | null }[]
  const caseIds = sales.map(row => row.case_id).filter((id): id is string => Boolean(id))
  const { data: cases } = caseIds.length ? await db.from('instrument_warranty_cases').select('id, version').in('id', caseIds) : { data: [] }
  const versionOf = new Map((cases ?? []).map(item => [item.id, item.version]))

  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">Khách mua đàn</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">Serial, giá bán và ngày hết bảo hành lấy từ phiếu bán. Trang này không tạo hóa đơn học phí.</p>
      {(query.error || error) && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{query.error || 'Không tải được danh sách.'}</div>}
      {query.success && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{query.success}</div>}
      <div className="mt-6 flex gap-2">
        <Link href="/admin/business/instrument-customers?view=warranty" className={`rounded-full px-3 py-1.5 text-sm ${view === 'warranty' ? 'bg-gray-950 text-white' : 'bg-white ring-1 ring-gray-200'}`}>Đang bảo hành</Link>
        <Link href="/admin/business/instrument-customers?view=care" className={`rounded-full px-3 py-1.5 text-sm ${view === 'care' ? 'bg-gray-950 text-white' : 'bg-white ring-1 ring-gray-200'}`}>Giữ kết nối</Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map(filter => <Link key={filter.id} href={`/admin/business/instrument-customers?view=${view}&filter=${filter.id}`} className={`rounded-full px-3 py-1.5 text-sm ${query.filter === filter.id ? 'bg-gray-950 text-white' : 'bg-white ring-1 ring-gray-200'}`}>{filter.label}</Link>)}
      </div>
      <div className="mt-6 space-y-4">
        {sales.map(row => (
          <section key={row.sale_event_id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">{row.customer_name || 'Chưa gắn khách'} · {row.product_name}</h2>
            <p className="mt-1 text-sm text-gray-500">{row.brand} {row.model} · Serial {row.serial} · Bán {row.sold_on} · {row.customer_phone || 'Chưa có điện thoại'}</p>
            {view === 'warranty' ? (
              <div className="mt-3 text-sm">
                <p>Bảo hành đến {row.warranty_until || 'Không có ngày'} · Còn {row.days_remaining ?? '—'} ngày · {row.case_status ? caseStatus[row.case_status] || row.case_status : 'Chưa có hồ sơ'}</p>
                {!row.customer_name && (
                  <form action={linkInstrumentCustomer} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="sale_event_id" value={row.sale_event_id} />
                    <input name="contact_name" required placeholder="Tên khách" className="rounded-lg border border-gray-300 px-3 py-2" />
                    <input name="contact_phone" placeholder="Điện thoại" className="rounded-lg border border-gray-300 px-3 py-2" />
                    <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Gắn khách</button>
                  </form>
                )}
                {!row.case_id && (
                  <form action={openWarrantyCase} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="sale_event_id" value={row.sale_event_id} />
                    <input name="issue" required placeholder="Vấn đề" className="rounded-lg border border-gray-300 px-3 py-2" />
                    <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Mở hồ sơ bảo hành</button>
                  </form>
                )}
                {row.case_id && !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(row.case_status || '') && (
                  <form action={transitionWarrantyCase} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="case_id" value={row.case_id} />
                    <input type="hidden" name="version" value={versionOf.get(row.case_id) ?? 1} />
                    <select name="status" className="rounded-lg border border-gray-300 px-3 py-2">{Object.entries(caseStatus).filter(([status]) => status !== 'OPEN').map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>
                    <input name="note" placeholder="Ghi chú" className="rounded-lg border border-gray-300 px-3 py-2" />
                    <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cập nhật</button>
                  </form>
                )}
              </div>
            ) : (
              <form action={addInstrumentFollowup} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="sale_event_id" value={row.sale_event_id} />
                <p className="w-full text-sm text-gray-500">Liên hệ cuối: {row.last_contact_at ? new Date(row.last_contact_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'} · Hẹn: {row.next_follow_up_on || '—'} · {outcomes.find(item => item[0] === row.outcome)?.[1] || 'Chưa có cơ hội'}</p>
                <select name="outcome" className="rounded-lg border border-gray-300 px-3 py-2">{outcomes.map(([outcome, label]) => <option key={outcome} value={outcome}>{label}</option>)}</select>
                <input name="channel" placeholder="Kênh" className="rounded-lg border border-gray-300 px-3 py-2" />
                <input name="note" placeholder="Ghi chú" className="rounded-lg border border-gray-300 px-3 py-2" />
                <input name="next_follow_up_on" type="date" className="rounded-lg border border-gray-300 px-3 py-2" />
                <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Ghi nhận liên hệ</button>
              </form>
            )}
          </section>
        ))}
        {sales.length === 0 && <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Chưa có phiếu bán trong bộ lọc này.</p>}
      </div>
    </div>
  )
}
