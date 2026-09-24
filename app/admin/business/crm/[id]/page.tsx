import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { assignCrmLead, attributeCrmLead, followUpCrmLead, noteCrmLead, reviewCrmLead, setCrmLeadInterest, transitionCrmLead } from '../actions'
import { eventLabel, interestLevelLabel, nextSteps, sourceLabel, statusLabel } from '../model'

const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'

export default async function CrmLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const db = await createClient()
  const [{ data: lead }, { data: events }, { data: reviews }, { data: candidates }, { data: owners }] = await Promise.all([
    db.from('crm_leads').select('id, branch_id, status, interest_level, full_name, phone, email, parent_name, student_name, student_date_of_birth, program_interest, instrument_interest, source_type, campaign_id, owner_user_id, first_contact_at, last_contact_at, next_follow_up_on, lost_reason, converted_at, converted_student_id, converted_parent_id, version').eq('id', id).maybeSingle(),
    db.from('crm_lead_events').select('id, event_type, from_status, to_status, channel, note, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('crm_lead_conversion_reviews').select('id, decision, note, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(20),
    db.rpc('crm_lead_match_candidates', { p_lead: id }),
    db.from('profiles').select('id, full_name').eq('status', 'ACTIVE').order('full_name').limit(100),
  ])
  if (!lead) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6">Không tìm thấy khách hàng trong phạm vi được xem. <Link href="/admin/business/crm" className="underline">Quay lại</Link></div>
  }
  const [{ data: branch }, { data: campaigns }] = await Promise.all([
    db.from('branches').select('name').eq('id', lead.branch_id).maybeSingle(),
    db.from('crm_campaigns').select('id, name').neq('status', 'INACTIVE').or(`branch_id.is.null,branch_id.eq.${lead.branch_id}`).order('name'),
  ])
  const steps = nextSteps[lead.status] ?? []
  const hidden = { lead_id: lead.id, version: String(lead.version) }

  return (
    <div>
      <Link href="/admin/business/crm" className="text-sm text-gray-500">Khách hàng mới</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-950">{lead.full_name || lead.student_name || 'Chưa có tên'}</h1>
      <p className="mt-1 text-sm text-gray-500">{interestLevelLabel[lead.interest_level]} · {statusLabel[lead.status] || lead.status} · {branch?.name || 'Chi nhánh'}</p>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Thông tin khách hàng</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Điện thoại</dt><dd>{lead.phone || '—'}</dd></div>
              <div><dt className="text-gray-500">Email</dt><dd>{lead.email || '—'}</dd></div>
              <div><dt className="text-gray-500">Phụ huynh</dt><dd>{lead.parent_name || '—'}</dd></div>
              <div><dt className="text-gray-500">Học viên</dt><dd>{lead.student_name || '—'} {lead.student_date_of_birth || ''}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Nhu cầu và nguồn</h2>
            <form action={setCrmLeadInterest} className="mt-3 flex flex-wrap items-end gap-2">
              {Object.entries({ ...hidden, request: crypto.randomUUID() }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <label className="text-sm">Mức độ quan tâm<select name="interest_level" defaultValue={lead.interest_level} className={field}>{Object.entries(interestLevelLabel).map(([level, label]) => <option key={level} value={level}>{label}</option>)}</select></label>
              <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Lưu mức độ</button>
            </form>
            <p className="mt-3 text-sm">{[lead.program_interest, lead.instrument_interest].filter(Boolean).join(' / ') || 'Chưa ghi nhu cầu'}</p>
            <p className="mt-1 text-sm text-gray-500">{sourceLabel[lead.source_type] || lead.source_type}</p>
            <form action={attributeCrmLead} className="mt-4 space-y-2">
              {Object.entries({ ...hidden, request: crypto.randomUUID() }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <select name="campaign_id" defaultValue={lead.campaign_id || ''} className={field}><option value="">Chưa gắn chiến dịch</option>{(campaigns ?? []).map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
              <input name="campaign_reference" placeholder="Mã tham chiếu, nếu có" className={field} />
              <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Gắn chiến dịch</button>
            </form>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Pipeline</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {steps.map(step => (
                <form key={step.status} action={transitionCrmLead}>
                  {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
                  <input type="hidden" name="request" value={crypto.randomUUID()} />
                  <input type="hidden" name="to_status" value={step.status} />
                  {step.status === 'LOST' && <input name="note" required placeholder="Lý do" className={`${field} mb-2`} />}
                  <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">{step.label}</button>
                </form>
              ))}
              {steps.length === 0 && <p className="text-sm text-gray-500">Trạng thái này đã kết thúc.</p>}
            </div>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-3 space-y-3">
              {(events ?? []).map(event => (
                <li key={event.id} className="border-b border-gray-100 pb-3 text-sm">
                  <div className="font-medium">{eventLabel[event.event_type] || event.event_type}</div>
                  <div className="text-gray-500">{event.created_at ? new Date(event.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''} {event.note || ''}</div>
                </li>
              ))}
              {(events ?? []).length === 50 && <li className="text-sm text-gray-500">Chỉ hiện 50 sự kiện gần nhất.</li>}
            </ol>
          </section>
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Follow-up</h2>
            <p className="mt-2 text-sm">Tiếp theo: {lead.next_follow_up_on || 'Chưa hẹn'}</p>
            <form action={followUpCrmLead} className="mt-3 space-y-2">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <input name="follow_up_on" type="date" required className={field} />
              <input name="note" placeholder="Ghi chú" className={field} />
              <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Hẹn follow-up</button>
            </form>
            <form action={noteCrmLead} className="mt-4 space-y-2">
              {Object.entries({ ...hidden, request: crypto.randomUUID() }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <textarea name="note" required placeholder="Thêm ghi chú" className={field} />
              <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Thêm ghi chú</button>
            </form>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Người phụ trách</h2>
            <form action={assignCrmLead} className="mt-3 space-y-2">
              {Object.entries({ ...hidden, request: crypto.randomUUID() }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <select name="owner_user_id" required className={field}>{(owners ?? []).map(owner => <option key={owner.id} value={owner.id}>{owner.full_name || 'Chưa có tên'}</option>)}</select>
              <input name="reason" required placeholder="Lý do giao việc" className={field} />
              <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Giao / đổi người phụ trách</button>
            </form>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Chuyển đổi</h2>
            {lead.status === 'WON' && <Link href={`/admin/business/registrations/new?lead=${lead.id}`} className="mt-3 inline-block text-sm font-medium text-gray-950">Tạo hồ sơ đăng ký</Link>}
            {lead.converted_at ? <p className="mt-2 text-sm">Đã gắn học viên.</p> : lead.status !== 'WON' ? <p className="mt-2 text-sm text-gray-500">Chỉ gắn học viên sau khi chốt thành công. Hệ thống không tự tạo học viên mới.</p> : (
              <form action={reviewCrmLead} className="mt-3 space-y-2">
                {Object.entries({ ...hidden, request: crypto.randomUUID() }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
                <select name="decision" className={field}><option value="PENDING">Cần xem xét</option><option value="LINKED">Gắn học viên đã có</option><option value="BLOCKED">Chưa đủ dữ liệu</option></select>
                <select name="student_id" className={field}><option value="">Chưa chọn học viên</option>{((candidates ?? []) as { student_id: string; full_name: string | null; student_code: string }[]).map(candidate => <option key={candidate.student_id} value={candidate.student_id}>{candidate.full_name} · {candidate.student_code}</option>)}</select>
                <input name="parent_id" placeholder="Mã phụ huynh đã có, nếu có" className={field} />
                <textarea name="note" placeholder="Ghi chú xem xét" className={field} />
                <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Ghi nhận</button>
              </form>
            )}
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              {(reviews ?? []).map(review => <li key={review.id}>{review.decision} {review.note || ''}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
