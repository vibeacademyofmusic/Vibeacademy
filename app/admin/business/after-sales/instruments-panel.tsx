import Link from 'next/link'

import { EmptyState, FormField, InlineNotice, SectionCard, SelectField } from '@/app/admin/_components/vibe'
import { createClient } from '@/lib/supabase/server'

import { afterSalesHref } from '../workspaces'
import { addInstrumentFollowup, linkInstrumentCustomer, openWarrantyCase, transitionWarrantyCase } from '../instrument-customers/actions'

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

export async function InstrumentCustomersPanel({
  query,
  canManage,
}: {
  query: { view?: string; filter?: string; error?: string; success?: string }
  canManage: boolean
}) {
  const view = query.view === 'care' ? 'care' : 'warranty'
  const db = await createClient()
  const { data: rows, error } = await db.rpc('list_instrument_customer_care', { p_branch: null, p_filter: query.filter || null })
  const sales = (rows ?? []) as { sale_event_id: string; customer_name: string | null; customer_phone: string | null; product_name: string; brand: string; model: string; serial: string; sold_on: string; warranty_until: string | null; days_remaining: number | null; case_id: string | null; case_status: string | null; last_contact_at: string | null; next_follow_up_on: string | null; outcome: string | null }[]
  const caseIds = sales.map(row => row.case_id).filter((id): id is string => Boolean(id))
  const { data: cases } = caseIds.length ? await db.from('instrument_warranty_cases').select('id, version').in('id', caseIds) : { data: [] }
  const versionOf = new Map((cases ?? []).map(item => [item.id, item.version]))

  return (
    <>
      {(query.error || error) && <InlineNotice tone="error">{query.error || 'Không tải được danh sách.'}</InlineNotice>}
      {query.success && <InlineNotice>{query.success}</InlineNotice>}
      <div className="vibe-actions" aria-label="Cách xem khách mua đàn">
        <Link href={afterSalesHref('instruments', { view: 'warranty', filter: query.filter })} prefetch={false} className={view === 'warranty' ? 'vibe-button vibe-button-primary' : 'vibe-button'} aria-current={view === 'warranty' ? 'page' : undefined}>Đang bảo hành</Link>
        <Link href={afterSalesHref('instruments', { view: 'care', filter: query.filter })} prefetch={false} className={view === 'care' ? 'vibe-button vibe-button-primary' : 'vibe-button'} aria-current={view === 'care' ? 'page' : undefined}>Giữ kết nối</Link>
      </div>
      <div className="vibe-actions">
        {filters.map(filter => (
          <Link key={filter.id} href={afterSalesHref('instruments', { view, filter: filter.id })} prefetch={false} className={query.filter === filter.id ? 'vibe-button vibe-button-primary' : 'vibe-button'} aria-current={query.filter === filter.id ? 'page' : undefined}>{filter.label}</Link>
        ))}
      </div>
      {sales.map(row => (
        <SectionCard key={row.sale_event_id} title={`${row.customer_name || 'Chưa gắn khách'} · ${row.product_name}`}>
          <p>{row.brand} {row.model} · Serial {row.serial} · Bán {row.sold_on} · {row.customer_phone || 'Chưa có điện thoại'}</p>
          {view === 'warranty' ? (
            <div>
              <p>Bảo hành đến {row.warranty_until || 'Không có ngày'} · Còn {row.days_remaining ?? '—'} ngày · {row.case_status ? caseStatus[row.case_status] || row.case_status : 'Chưa có hồ sơ'}</p>
              {canManage && !row.customer_name && (
                <form action={linkInstrumentCustomer} className="vibe-filter">
                  <input type="hidden" name="sale_event_id" value={row.sale_event_id} />
                  <FormField label="Tên khách" name="contact_name" required />
                  <FormField label="Điện thoại" name="contact_phone" />
                  <button className="vibe-button vibe-button-primary" type="submit">Gắn khách</button>
                </form>
              )}
              {canManage && !row.case_id && (
                <form action={openWarrantyCase} className="vibe-filter">
                  <input type="hidden" name="sale_event_id" value={row.sale_event_id} />
                  <FormField label="Vấn đề" name="issue" required />
                  <button className="vibe-button" type="submit">Mở hồ sơ bảo hành</button>
                </form>
              )}
              {canManage && row.case_id && !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(row.case_status || '') && (
                <form action={transitionWarrantyCase} className="vibe-filter">
                  <input type="hidden" name="case_id" value={row.case_id} />
                  <input type="hidden" name="version" value={versionOf.get(row.case_id) ?? 1} />
                  <SelectField label="Trạng thái" name="status">{Object.entries(caseStatus).filter(([status]) => status !== 'OPEN').map(([status, label]) => <option key={status} value={status}>{label}</option>)}</SelectField>
                  <FormField label="Ghi chú" name="note" />
                  <button className="vibe-button" type="submit">Cập nhật</button>
                </form>
              )}
            </div>
          ) : (
            <div>
              <p>Liên hệ cuối: {row.last_contact_at ? new Date(row.last_contact_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'} · Hẹn: {row.next_follow_up_on || '—'} · {outcomes.find(item => item[0] === row.outcome)?.[1] || 'Chưa có cơ hội'}</p>
              {canManage && (
                <form action={addInstrumentFollowup} className="vibe-filter">
                  <input type="hidden" name="sale_event_id" value={row.sale_event_id} />
                  <SelectField label="Kết quả" name="outcome">{outcomes.map(([outcome, label]) => <option key={outcome} value={outcome}>{label}</option>)}</SelectField>
                  <FormField label="Kênh" name="channel" />
                  <FormField label="Ghi chú" name="note" />
                  <FormField label="Hẹn tiếp" name="next_follow_up_on" type="date" />
                  <button className="vibe-button vibe-button-primary" type="submit">Ghi nhận liên hệ</button>
                </form>
              )}
            </div>
          )}
        </SectionCard>
      ))}
      {sales.length === 0 && <EmptyState>Chưa có phiếu bán trong bộ lọc này.</EmptyState>}
    </>
  )
}
