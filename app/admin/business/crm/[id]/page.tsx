import Link from 'next/link'

import { AppPage, InlineNotice, SectionCard, StatusBadge } from '@/app/admin/_components/vibe'
import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { CrmActionDrawer } from './CrmActionDrawer'
import styles from './detail.module.css'
import { channelStateLabel, eventLabel, followUpState, interestLevelLabel, journeyLabel, nextSteps, openRegistrationStatuses, paymentLabel, placementLabel, registrationEventLabel, registrationStatusLabel, sourceLabel, statusTone } from '../model'

function dateOnly(value: string | null | undefined) {
  if (!value) return 'Chưa xác định'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}
function when(value: string | null) {
  if (!value) return 'Chưa xác định'
  const date = new Date(value)
  const day = date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = date.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} ${time}`
}
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.detail}><dt>{label}</dt><dd>{children}</dd></div>
}

export default async function CrmLeadDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  const db = await createClient()
  const today = businessDate()
  const [{ data: lead }, { data: events }, { data: reviews }, { data: candidates }, { data: owners }, channel] = await Promise.all([
    db.from('crm_leads').select('id, branch_id, status, interest_level, full_name, phone, email, phone_key, parent_name, student_name, student_date_of_birth, program_interest, instrument_interest, desired_start_date, preferred_slots, preferred_sessions_per_week, schedule_note, source_type, campaign_id, owner_user_id, first_contact_at, last_contact_at, next_follow_up_on, lost_reason, converted_at, converted_student_id, converted_parent_id, version').eq('id', id).maybeSingle(),
    db.from('crm_lead_events').select('id, event_type, channel, note, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('crm_lead_conversion_reviews').select('id, decision, note, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(10),
    db.rpc('crm_lead_match_candidates', { p_lead: id }),
    db.from('profiles').select('id, full_name').eq('status', 'ACTIVE').order('full_name').limit(100),
    db.rpc('crm_lead_channel_state', { p_lead: id }),
  ])
  if (!lead) return <AppPage><InlineNotice tone="error">Không tìm thấy khách hàng trong phạm vi được xem.</InlineNotice><Link href="/admin/business/crm">Quay lại CRM & Tuyển sinh</Link></AppPage>
  const [{ data: branch }, { data: campaigns }, { data: registrations }, duplicates] = await Promise.all([
    db.from('branches').select('name').eq('id', lead.branch_id).maybeSingle(),
    db.from('crm_campaigns').select('id, name').neq('status', 'INACTIVE').or(`branch_id.is.null,branch_id.eq.${lead.branch_id}`).order('name'),
    db.from('registration_applications').select('id, status, application_code, course_id, invoice_id, payment_confirmed_at, linked_student_id, linked_enrollment_id, desired_start_date, preferred_schedule, program_interest, instrument_interest').eq('crm_lead_id', lead.id).order('created_at', { ascending: false }).limit(5),
    lead.phone_key ? db.from('crm_leads').select('id, full_name, parent_name, student_name').eq('branch_id', lead.branch_id).eq('phone_key', lead.phone_key).neq('id', lead.id).limit(5) : Promise.resolve({ data: [], error: null }),
  ])
  const registration = (registrations ?? []).find(row => openRegistrationStatuses.includes(row.status)) ?? (registrations ?? [])[0] ?? null
  const placement = registration ? await db.from('student_placement_cases').select('id, status').eq('registration_application_id', registration.id).maybeSingle() : { data: null, error: null }
  const registrationEvents = registration ? await db.from('registration_application_events').select('id, event_type, note, created_at').eq('application_id', registration.id).order('created_at', { ascending: false }).limit(30) : { data: [], error: null }
  const studentId = lead.converted_student_id || registration?.linked_student_id || null
  const converted = Boolean(studentId)
  const registering = Boolean(registration && openRegistrationStatuses.includes(registration.status))
  const owner = (owners ?? []).find(item => item.id === lead.owner_user_id)
  const contact = lead.parent_name || lead.full_name || 'Chưa có tên'
  const slots = Array.isArray(lead.preferred_slots) ? lead.preferred_slots as { weekday: number; start: string; end: string }[] : []
  const schedule = slots.map(slot => `${slot.weekday === 7 ? 'CN' : `Thứ ${slot.weekday + 1}`} ${slot.start}–${slot.end}`).join('; ') || registration?.preferred_schedule || 'Chưa xác định'
  const timeline = [
    ...(events ?? []).map(item => ({ id: item.id, at: item.created_at, label: eventLabel[item.event_type] || item.event_type, note: [item.channel, item.note].filter(Boolean).join(' · ') })),
    ...(registrationEvents.data ?? []).map(item => ({ id: item.id, at: item.created_at, label: registrationEventLabel[item.event_type] || item.event_type, note: item.note || '' })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)))
  const channelLabel = channel.error || channel.data == null ? 'Chưa xác định' : channelStateLabel[channel.data] || 'Chưa xác định'

  return <AppPage>
    <Link href="/admin/business/crm" className="text-sm">CRM & Tuyển sinh</Link>
    <header className={styles.header}>
      <div className={styles.heading}>
        <p className="vibe-eyebrow">Hồ sơ khách hàng</p><h1>{contact}</h1>
        {lead.student_name && <p className={styles.student}>Học viên dự kiến: {lead.student_name}</p>}
        <div className={styles.headerMeta}>
          <span>Mã hồ sơ <code>{lead.id}</code></span>
          <StatusBadge tone={statusTone(lead.status, converted)}>{journeyLabel(lead.status, converted, registering)}</StatusBadge>
          <span>Phụ trách: {owner?.full_name || 'Chưa gán'}</span>
        </div>
      </div>
      <CrmActionDrawer leadId={lead.id} version={lead.version} status={lead.status} steps={nextSteps[lead.status] ?? []}
        interestLevel={lead.interest_level} campaignId={lead.campaign_id} ownerId={lead.owner_user_id}
        parentId={lead.converted_parent_id} linkedStudentId={registration?.linked_student_id || null}
        owners={owners ?? []} campaigns={campaigns ?? []}
        candidates={((candidates ?? []) as { student_id: string; full_name: string | null; student_code: string }[]).filter(item => item.student_id !== registration?.linked_student_id)} />
    </header>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {(duplicates.data ?? []).length > 0 && <InlineNotice>Có hồ sơ khác cùng số điện thoại trong chi nhánh này. Hệ thống không tự gộp. {(duplicates.data ?? []).map(row => <Link key={row.id} href={`/admin/business/crm/${row.id}`} className="ml-2 underline">{row.student_name || row.full_name || 'Hồ sơ khác'}</Link>)}</InlineNotice>}
    <div className={styles.layout}>
      <div className={styles.main}>
        <SectionCard title="Thông tin liên hệ"><dl className={styles.details}>
          <Detail label="Người liên hệ">{lead.full_name || 'Chưa xác định'}</Detail><Detail label="Phụ huynh">{lead.parent_name || 'Chưa xác định'}</Detail>
          <Detail label="Học viên dự kiến">{lead.student_name || 'Chưa xác định'}</Detail><Detail label="Ngày sinh">{dateOnly(lead.student_date_of_birth)}</Detail>
          <Detail label="Số điện thoại">{lead.phone || 'Chưa xác định'}</Detail><Detail label="Email">{lead.email || 'Chưa xác định'}</Detail>
        </dl></SectionCard>
        <SectionCard title="Nhu cầu học"><dl className={styles.details}>
          <Detail label="Bộ môn">{lead.program_interest || registration?.program_interest || 'Chưa xác định'}</Detail>
          {(lead.instrument_interest || registration?.instrument_interest) && <Detail label="Nhạc cụ (dữ liệu cũ)">{lead.instrument_interest || registration?.instrument_interest}</Detail>}
          <Detail label="Chi nhánh">{branch?.name || 'Chưa xác định'}</Detail><Detail label="Mức độ quan tâm">{interestLevelLabel[lead.interest_level] || lead.interest_level}</Detail>
          <Detail label="Lịch mong muốn">{schedule}</Detail><Detail label="Ngày dự kiến bắt đầu">{dateOnly(lead.desired_start_date || registration?.desired_start_date)}</Detail>
          <Detail label="Số buổi/tuần">{lead.preferred_sessions_per_week || 'Chưa xác định'}</Detail><Detail label="Ghi chú lịch">{lead.schedule_note || 'Chưa xác định'}</Detail>
          <Detail label="Nguồn">{sourceLabel[lead.source_type] || lead.source_type}</Detail>
        </dl></SectionCard>
        <SectionCard title="Tiến trình tuyển sinh"><dl className={styles.details}>
          <Detail label="Hồ sơ đăng ký">{registration ? `${registration.application_code} · ${registrationStatusLabel[registration.status] || registration.status}` : 'Chưa có hồ sơ đăng ký'}</Detail>
          <Detail label="Thanh toán">{paymentLabel(registration ? { status: registration.status, invoiceId: registration.invoice_id, confirmedAt: registration.payment_confirmed_at } : null)}</Detail>
          <Detail label="Ca dạy">{placement.error ? 'Chưa xác định' : placementLabel(placement.data?.status)}</Detail><Detail label="Zalo">{channelLabel}</Detail>
        </dl>
          <div className="vibe-actions">
            {lead.status === 'WON' && !registration && <Link className="vibe-button vibe-button-primary" href={`/admin/business/registrations/new?lead=${lead.id}`}>Bắt đầu đăng ký</Link>}
            {registration && <Link className="vibe-button" href={`/admin/business/registrations/${registration.id}`}>Mở hồ sơ đăng ký</Link>}
            {studentId && <Link className="vibe-button vibe-button-primary" href={`/admin/students/${studentId}`}>Mở hồ sơ học viên</Link>}
            {placement.data && <Link className="vibe-button" href={`/admin/students?tab=coordination&view=queue&place=${placement.data.id}`}>Chọn ca dạy</Link>}
          </div>
          {converted && <p className="text-sm">Đã trở thành học viên. Hồ sơ CRM vẫn được giữ.</p>}
          {!converted && lead.status !== 'WON' && <p className="text-sm text-gray-500">Học viên chỉ được tạo từ hồ sơ đăng ký đã hoàn tất.</p>}
          {(reviews ?? []).length > 0 && <ul className="space-y-1 text-sm text-gray-600">{(reviews ?? []).map(review => <li key={review.id}>{review.decision} {review.note || ''}</li>)}</ul>}
        </SectionCard>
      </div>
      <aside className={styles.aside} aria-label="Chăm sóc khách hàng">
        <SectionCard title="Việc cần làm tiếp theo"><dl className={styles.details}>
          <Detail label="Lịch chăm sóc">{lead.next_follow_up_on ? `${followUpState(lead.next_follow_up_on, today)} · ${dateOnly(lead.next_follow_up_on)}` : 'Chưa xác định'}</Detail>
          <Detail label="Lần liên hệ gần nhất">{when(lead.last_contact_at)}</Detail>
          {lead.status === 'LOST' && <Detail label="Lý do không tiếp tục">{lead.lost_reason || 'Chưa xác định'}</Detail>}
        </dl></SectionCard>
        <SectionCard title="Lịch sử chăm sóc">
          {timeline.length === 0 ? <p className="text-sm text-gray-500">Chưa có sự kiện đã ghi nhận.</p> : <ol className={styles.timeline}>{timeline.map(item => <li key={item.id}><time>{when(item.at)}</time><strong>{item.label}</strong>{item.note && <p>{item.note}</p>}</li>)}</ol>}
          {(events ?? []).length === 50 && <p className="text-sm text-gray-500">Chỉ hiện 50 sự kiện CRM gần nhất.</p>}
        </SectionCard>
      </aside>
    </div>
  </AppPage>
}
