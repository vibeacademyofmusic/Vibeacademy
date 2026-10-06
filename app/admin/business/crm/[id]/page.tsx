import Link from 'next/link'

import { AppPage, FormField, InlineNotice, PageHeader, SectionCard, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { setCrmLeadInterest, assignCrmLead, attributeCrmLead, followUpCrmLead, noteCrmLead, reviewCrmLead, transitionCrmLead } from '../actions'
import { interestLevelLabel, channelStateLabel, contactChannels, eventLabel, followUpState, journeyLabel, nextSteps, openRegistrationStatuses, paymentLabel, placementLabel, registrationEventLabel, registrationStatusLabel, sourceLabel, statusTone } from '../model'

const hidden = (values: Record<string, string>) => Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)

function when(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

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
  const today = businessDate()
  const [{ data: lead }, { data: events }, { data: reviews }, { data: candidates }, { data: owners }, channel] = await Promise.all([
    db.from('crm_leads').select('id, branch_id, status, interest_level, full_name, phone, email, phone_key, parent_name, student_name, student_date_of_birth, program_interest, instrument_interest, source_type, campaign_id, owner_user_id, first_contact_at, last_contact_at, next_follow_up_on, lost_reason, converted_at, converted_student_id, converted_parent_id, version').eq('id', id).maybeSingle(),
    db.from('crm_lead_events').select('id, event_type, channel, note, created_at').eq('lead_id', id).order('created_at', { ascending: true }).limit(50),
    db.from('crm_lead_conversion_reviews').select('id, decision, note, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(10),
    db.rpc('crm_lead_match_candidates', { p_lead: id }),
    db.from('profiles').select('id, full_name').eq('status', 'ACTIVE').order('full_name').limit(100),
    db.rpc('crm_lead_channel_state', { p_lead: id }),
  ])
  if (!lead) {
    return <AppPage><InlineNotice tone="error">Không tìm thấy khách hàng trong phạm vi được xem.</InlineNotice><Link href="/admin/business/crm">Quay lại CRM & Tuyển sinh</Link></AppPage>
  }
  const [{ data: branch }, { data: campaigns }, { data: registrations }, duplicates] = await Promise.all([
    db.from('branches').select('name').eq('id', lead.branch_id).maybeSingle(),
    db.from('crm_campaigns').select('id, name').neq('status', 'INACTIVE').or(`branch_id.is.null,branch_id.eq.${lead.branch_id}`).order('name'),
    db.from('registration_applications').select('id, status, application_code, course_id, invoice_id, payment_confirmed_at, linked_student_id, linked_enrollment_id, desired_start_date, preferred_schedule, program_interest, instrument_interest').eq('crm_lead_id', lead.id).order('created_at', { ascending: false }).limit(5),
    lead.phone_key ? db.from('crm_leads').select('id, full_name, parent_name, student_name').eq('branch_id', lead.branch_id).eq('phone_key', lead.phone_key).neq('id', lead.id).limit(5) : Promise.resolve({ data: [], error: null }),
  ])
  const registration = (registrations ?? []).find(row => openRegistrationStatuses.includes(row.status)) ?? (registrations ?? [])[0] ?? null
  const placement = registration
    ? await db.from('student_placement_cases').select('id, status').eq('registration_application_id', registration.id).maybeSingle()
    : { data: null, error: null }
  const registrationEvents = registration
    ? await db.from('registration_application_events').select('id, event_type, note, created_at').eq('application_id', registration.id).order('created_at', { ascending: true }).limit(30)
    : { data: [], error: null }
  const studentId = lead.converted_student_id || registration?.linked_student_id || null
  const converted = Boolean(studentId)
  const registering = Boolean(registration && openRegistrationStatuses.includes(registration.status))
  const owner = (owners ?? []).find(item => item.id === lead.owner_user_id)
  const steps = nextSteps[lead.status] ?? []
  const fields = { lead_id: lead.id, version: String(lead.version) }
  const contact = lead.parent_name || lead.full_name || 'Chưa có tên'
  const timeline = [
    ...(events ?? []).map(event => ({ id: event.id, at: event.created_at, label: eventLabel[event.event_type] || event.event_type, note: [event.channel, event.note].filter(Boolean).join(' · ') })),
    ...(registrationEvents.data ?? []).map(event => ({ id: event.id, at: event.created_at, label: registrationEventLabel[event.event_type] || event.event_type, note: event.note || '' })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const channelLabel = channel.error || channel.data == null ? '—' : channelStateLabel[channel.data] || '—'

  return (
    <AppPage>
      <Link href="/admin/business/crm" className="text-sm">CRM & Tuyển sinh</Link>
      <PageHeader
        title={contact}
        description={`${lead.student_name ? `Học viên dự kiến: ${lead.student_name}. ` : ''}${branch?.name || 'Chi nhánh'} · ${owner?.full_name || 'Chưa gán người phụ trách'}`}
        actions={<StatusBadge tone={statusTone(lead.status, converted)}>{journeyLabel(lead.status, converted, registering)}</StatusBadge>}
      />
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {(duplicates.data ?? []).length > 0 && (
        <InlineNotice>Có hồ sơ khác cùng số điện thoại trong chi nhánh này. Hệ thống không tự gộp. {(duplicates.data ?? []).map(row => <Link key={row.id} href={`/admin/business/crm/${row.id}`} className="ml-2 underline">{row.student_name || row.full_name || 'Hồ sơ khác'}</Link>)}</InlineNotice>
      )}
      <div className="vibe-grid">
        <SectionCard title="Thông tin">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Người liên hệ</dt><dd>{lead.full_name || '—'}</dd></div>
            <div><dt className="text-gray-500">Phụ huynh</dt><dd>{lead.parent_name || '—'}</dd></div>
            <div><dt className="text-gray-500">Học viên dự kiến</dt><dd>{lead.student_name || '—'}</dd></div>
            <div><dt className="text-gray-500">Ngày sinh</dt><dd>{lead.student_date_of_birth || '—'}</dd></div>
            <div><dt className="text-gray-500">Số điện thoại</dt><dd>{lead.phone || '—'}</dd></div>
            <div><dt className="text-gray-500">Email</dt><dd>{lead.email || '—'}</dd></div>
          </dl>
        </SectionCard>
        <SectionCard title="Nhu cầu học">
          <form action={setCrmLeadInterest} className="vibe-filter">
            {hidden({ ...fields, request: crypto.randomUUID() })}
            <SelectField label="Mức độ quan tâm" name="interest_level" defaultValue={lead.interest_level}>{Object.entries(interestLevelLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
            <button className="vibe-button">Cập nhật mức độ quan tâm</button>
          </form>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Bộ môn</dt><dd>{lead.program_interest || registration?.program_interest || '—'}</dd></div>
            <div><dt className="text-gray-500">Nhạc cụ</dt><dd>{lead.instrument_interest || registration?.instrument_interest || '—'}</dd></div>
            <div><dt className="text-gray-500">Chi nhánh</dt><dd>{branch?.name || '—'}</dd></div>
            <div><dt className="text-gray-500">Lịch mong muốn</dt><dd>{registration?.preferred_schedule || '—'}</dd></div>
            <div><dt className="text-gray-500">Ngày muốn bắt đầu</dt><dd>{registration?.desired_start_date || '—'}</dd></div>
            <div><dt className="text-gray-500">Trình độ, mục tiêu, hình thức học</dt><dd>—</dd></div>
          </dl>
          <p className="text-sm text-gray-500">Nguồn: {sourceLabel[lead.source_type] || lead.source_type}</p>
          <form action={attributeCrmLead} className="vibe-filter">
            {hidden({ ...fields, request: crypto.randomUUID() })}
            <SelectField label="Chiến dịch" name="campaign_id" defaultValue={lead.campaign_id || ''}><option value="">Chưa gắn chiến dịch</option>{(campaigns ?? []).map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</SelectField>
            <FormField label="Mã tham chiếu" name="campaign_reference" maxLength={200} />
            <button className="vibe-button">Gắn chiến dịch</button>
          </form>
        </SectionCard>
        <SectionCard title="Tuyển sinh">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Hồ sơ đăng ký</dt><dd>{registration ? `${registration.application_code} · ${registrationStatusLabel[registration.status] || registration.status}` : 'Chưa có hồ sơ đăng ký'}</dd></div>
            <div><dt className="text-gray-500">Thanh toán</dt><dd>{paymentLabel(registration ? { status: registration.status, invoiceId: registration.invoice_id, confirmedAt: registration.payment_confirmed_at } : null)}</dd></div>
            <div><dt className="text-gray-500">Ca dạy</dt><dd>{placement.error ? '—' : placementLabel(placement.data?.status)}</dd></div>
            <div><dt className="text-gray-500">Zalo</dt><dd>{channelLabel}</dd></div>
          </dl>
          <div className="vibe-actions">
            {lead.status === 'WON' && !registration && <Link className="vibe-button vibe-button-primary" href={`/admin/business/registrations/new?lead=${lead.id}`}>Bắt đầu đăng ký</Link>}
            {registration && <Link className="vibe-button" href={`/admin/business/registrations/${registration.id}`}>Mở hồ sơ đăng ký</Link>}
            {studentId && <Link className="vibe-button vibe-button-primary" href={`/admin/students/${studentId}`}>Mở hồ sơ học viên</Link>}
            {placement.data && <Link className="vibe-button" href="/admin/students?tab=waiting">Chọn ca dạy</Link>}
          </div>
          {converted && <p className="text-sm">Đã trở thành học viên. Hồ sơ CRM vẫn được giữ.</p>}
          {!converted && lead.status !== 'WON' && <p className="text-sm text-gray-500">Học viên chỉ được tạo từ hồ sơ đăng ký đã hoàn tất. CRM không tạo hồ sơ học tập riêng.</p>}
          {!converted && lead.status === 'WON' && (
            <form action={reviewCrmLead} className="vibe-filter">
              {hidden({ ...fields, request: crypto.randomUUID() })}
              <SelectField label="Quyết định" name="decision" defaultValue="LINKED"><option value="PENDING">Cần xem xét</option><option value="LINKED">Gắn học viên đã có</option><option value="BLOCKED">Chưa đủ dữ liệu</option></SelectField>
              <SelectField label="Học viên đã có" name="student_id"><option value="">Chưa chọn</option>{registration?.linked_student_id && <option value={registration.linked_student_id}>Học viên từ hồ sơ đăng ký</option>}{((candidates ?? []) as { student_id: string; full_name: string | null; student_code: string }[]).filter(candidate => candidate.student_id !== registration?.linked_student_id).map(candidate => <option key={candidate.student_id} value={candidate.student_id}>{candidate.full_name} · {candidate.student_code}</option>)}</SelectField>
              <FormField label="Mã phụ huynh đã có" name="parent_id" defaultValue={lead.converted_parent_id || ''} />
              <FormField label="Ghi chú xem xét" name="note" maxLength={4000} />
              <button className="vibe-button">Ghi nhận gắn học viên</button>
            </form>
          )}
          <ul className="space-y-1 text-sm text-gray-600">{(reviews ?? []).map(review => <li key={review.id}>{review.decision} {review.note || ''}</li>)}</ul>
        </SectionCard>
        <SectionCard title="Liên hệ">
          <p className="text-sm">Follow-up: {followUpState(lead.next_follow_up_on, today)} · {lead.next_follow_up_on || 'Chưa hẹn'}</p>
          <p className="text-sm text-gray-500">Lần liên hệ gần nhất: {when(lead.last_contact_at) || '—'}</p>
          {lead.status === 'LOST' && <p className="text-sm">Lý do không tiếp tục: {lead.lost_reason || '—'}</p>}
          <div className="vibe-actions">
            {steps.map(step => (
              <form key={step.status} action={transitionCrmLead} className="vibe-filter">
                {hidden(fields)}
                <input type="hidden" name="request" value={crypto.randomUUID()} />
                <input type="hidden" name="to_status" value={step.status} />
                <SelectField label="Kênh" name="channel"><option value="">Không ghi kênh</option>{contactChannels.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField>
                {step.status === 'LOST' && <FormField label="Lý do không tiếp tục" name="note" required maxLength={4000} />}
                <button className="vibe-button">{step.label}</button>
              </form>
            ))}
          </div>
          <form action={followUpCrmLead} className="vibe-filter">
            {hidden(fields)}
            <input type="hidden" name="request" value={crypto.randomUUID()} />
            <FormField label="Hạn follow-up" name="follow_up_on" type="date" required />
            <FormField label="Việc cần làm" name="note" maxLength={4000} placeholder="Gọi phụ huynh, gửi thông tin, hẹn học thử" />
            <SelectField label="Kênh" name="channel"><option value="">Không ghi kênh</option>{contactChannels.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField>
            <button className="vibe-button vibe-button-primary">Hẹn follow-up</button>
          </form>
          <form action={noteCrmLead} className="vibe-filter">
            {hidden({ ...fields, request: crypto.randomUUID() })}
            <FormField label="Ghi chú liên hệ" name="note" required maxLength={4000} />
            <SelectField label="Kênh" name="channel"><option value="">Không ghi kênh</option>{contactChannels.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField>
            <button className="vibe-button">Thêm ghi chú</button>
          </form>
          <form action={assignCrmLead} className="vibe-filter">
            {hidden({ ...fields, request: crypto.randomUUID() })}
            <SelectField label="Người phụ trách" name="owner_user_id" required>{(owners ?? []).map(item => <option key={item.id} value={item.id}>{item.full_name || 'Chưa có tên'}</option>)}</SelectField>
            <FormField label="Lý do giao việc" name="reason" required maxLength={4000} />
            <button className="vibe-button">Giao người phụ trách</button>
          </form>
        </SectionCard>
      </div>
      <SectionCard title="Timeline">
        {timeline.length === 0 ? <p className="text-sm text-gray-500">Chưa có sự kiện đã ghi nhận.</p> : (
          <ol className="space-y-3">
            {timeline.map(item => (
              <li key={item.id} className="border-b border-gray-100 pb-3 text-sm">
                <div className="text-gray-500">{when(item.at)}</div>
                <div className="font-medium">{item.label}</div>
                {item.note && <div>{item.note}</div>}
              </li>
            ))}
          </ol>
        )}
        {(events ?? []).length === 50 && <p className="text-sm text-gray-500">Chỉ hiện 50 sự kiện CRM gần nhất.</p>}
      </SectionCard>
    </AppPage>
  )
}
