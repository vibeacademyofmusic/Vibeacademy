import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppPage, Eyebrow, InlineNotice, PageHeader, SectionCard } from '@/app/admin/_components/vibe'
import { allocateRegistrationDeposits, completeRegistration, createRegistrationMomoCheckout, setRegistrationDepositQuote, transitionRegistration } from '../actions'
import { notificationProgressLabel, registrationProgressLabel, vnd } from '../status'
import { ZaloConnectionCard, type ZaloConnectionView } from './ZaloConnection'

const steps = ['Bản nháp', 'Đã nộp', 'Đã xác minh', 'Chờ cọc', 'Đã nhận đủ cọc', 'Chờ xếp lớp']

export default async function RegistrationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const query = await searchParams
  const db = await createClient()
  const { data: app, error: appError } = await db.from('registration_applications').select('id, application_code, branch_id, student_name, student_date_of_birth, parent_name, parent_phone, program_interest, curriculum_id, level_id, subject_id, desired_start_date, preferred_schedule, status, invoice_id, deposit_confirmed_at, completed_at, linked_student_id, version, branches(name)').eq('id', id).maybeSingle()
  if (appError) {
    return <AppPage><InlineNotice tone="error">Không tải được hồ sơ đăng ký: {appError.message}</InlineNotice></AppPage>
  }
  if (!app) notFound()
  const [{ data: events }, { data: placement }, { data: invoice }, { data: zaloRows }, { data: curriculum }, { data: level }, { data: subject }, { data: terms }, { data: momoOrders }, { data: plans }, { data: jobs }, { data: template }, { data: student }] = await Promise.all([
    db.from('registration_application_events').select('id, event_type, from_status, to_status, created_at').eq('application_id', id).order('created_at'),
    db.from('student_placement_cases').select('id, status, scheduled_start_date, assigned_class_id, curriculum_id, level_id, subject_id').eq('registration_application_id', id).maybeSingle(),
    app.invoice_id ? db.from('invoice_receivables').select('invoice_number, invoice_status, outstanding_balance, total_amount').eq('invoice_id', app.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    db.rpc('registration_zalo_connection', { p_application: id }),
    app.curriculum_id ? db.from('curriculums').select('name').eq('id', app.curriculum_id).maybeSingle() : Promise.resolve({ data: null }),
    app.level_id ? db.from('curriculum_levels').select('name').eq('id', app.level_id).maybeSingle() : Promise.resolve({ data: null }),
    app.subject_id ? db.from('curriculum_subjects').select('name').eq('id', app.subject_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('registration_deposit_terms').select('list_amount, discount_type, discount_value, discount_name, discount_amount, tuition_amount, deposit_due').eq('application_id', id).maybeSingle(),
    db.from('registration_momo_orders').select('id, state, amount, pay_url, finance_payment_id, provider_transaction_id').eq('application_id', id).order('created_at', { ascending: false }),
    db.from('tuition_plans').select('id, name, tuition_plan_branch_prices(list_price, branch_id, status, currency)').eq('status', 'ACTIVE').order('name'),
    db.from('notification_jobs').select('id, status, error_code, payload, template_key').eq('entity_type', 'REGISTRATION_COMPLETED').eq('entity_id', id),
    db.from('notification_templates').select('enabled, status, provider_template_id').eq('template_key', 'ZALO_REGISTRATION_CONFIRMED').eq('provider', 'ZALO').maybeSingle(),
    app.linked_student_id ? db.from('students').select('student_code').eq('id', app.linked_student_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const zalo = (Array.isArray(zaloRows) ? zaloRows[0] : zaloRows) as ZaloConnectionView | undefined
  const connection: ZaloConnectionView = zalo ?? { link_status: 'NONE', external_link_key: null, linked_at: null, last_verified_at: null, masked_user_id: null }
  const branch = Array.isArray(app.branches) ? app.branches[0] : app.branches
  const hidden = { application_id: app.id, version: String(app.version) }
  const paidOrders = (momoOrders ?? []).filter(order => order.state === 'PAID')
  const openOrder = (momoOrders ?? []).find(order => order.state === 'READY' || order.state === 'RESERVED')
  const paidTotal = paidOrders.reduce((sum, order) => sum + Number(order.amount), 0)
  const depositDue = Number(terms?.deposit_due ?? 0)
  const agreed = Number(terms?.tuition_amount ?? 0)
  const depositRemaining = Math.max(0, depositDue - paidTotal)
  const tuitionRemaining = Math.max(0, agreed - paidTotal)
  const receiptIds = paidOrders.map(order => order.finance_payment_id).filter((value): value is string => Boolean(value))
  const { data: allocations } = receiptIds.length
    ? await db.from('payment_allocations').select('payment_id, amount').in('payment_id', receiptIds)
    : { data: [] }
  const allocated = (allocations ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
  const progress = registrationProgressLabel(app.status, placement?.status)
  const job = jobs?.[0]
  const notice = notificationProgressLabel(app.status === 'COMPLETED' ? job?.status : null)
  const applicablePlans = (plans ?? []).map(plan => {
    const prices = (plan.tuition_plan_branch_prices ?? []).filter(price => price.status === 'ACTIVE' && price.currency === 'VND' && (price.branch_id === app.branch_id || price.branch_id === null))
    const price = prices.find(item => item.branch_id === app.branch_id) ?? prices[0]
    return price ? { id: plan.id, name: plan.name, listPrice: Number(price.list_price) } : null
  }).filter((plan): plan is { id: string; name: string; listPrice: number } => Boolean(plan))
  const stepIndex = steps.indexOf(progress === 'Đã xếp lớp' ? 'Chờ xếp lớp' : progress)

  return (
    <AppPage>
      <Eyebrow>Kinh doanh · CRM & Tuyển sinh</Eyebrow>
      <PageHeader title={app.application_code} description={`${branch?.name ?? 'Chi nhánh'} · ${progress}`} actions={<Link href="/admin/business/registrations">Danh sách đăng ký</Link>} />
      {query.error && <InlineNotice tone="error">{query.error}</InlineNotice>}
      <ol className="grid gap-2 text-sm sm:grid-cols-3 xl:grid-cols-6">
        {steps.map((step, index) => <li key={step} className="vibe-card" data-current={index === stepIndex ? 'true' : undefined}><span className="text-slate-500">{index + 1}</span><strong className="mt-1 block">{step}</strong></li>)}
      </ol>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="grid gap-4">
          <SectionCard title="Hồ sơ">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Học viên</dt><dd>{app.student_name} · {app.student_date_of_birth}</dd></div>
              <div><dt className="text-slate-500">Phụ huynh</dt><dd>{app.parent_name} · {app.parent_phone || '—'}</dd></div>
              <div><dt className="text-slate-500">Chương trình</dt><dd>{curriculum?.name || 'Chưa chọn'}</dd></div>
              <div><dt className="text-slate-500">Trình độ · môn</dt><dd>{level?.name || '—'} · {subject?.name || '—'}</dd></div>
              <div><dt className="text-slate-500">Muốn bắt đầu</dt><dd>{app.desired_start_date || '—'} · {app.preferred_schedule || 'Chưa có khung giờ'}</dd></div>
              <div><dt className="text-slate-500">Xếp lớp</dt><dd>{placement ? registrationProgressLabel('COMPLETED', placement.status) : 'Chưa mở hồ sơ chờ lớp'}{placement?.assigned_class_id ? '' : placement ? ' · chưa gán lớp' : ''}</dd></div>
            </dl>
          </SectionCard>
          <SectionCard title="Học phí đã chốt">
            {!terms && <p className="text-sm">Chưa chốt học phí. Cọc 50% chỉ tính trên số đã chốt, sau giảm giá được duyệt.</p>}
            {terms && <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Giá niêm yết</dt><dd>{vnd(terms.list_amount)}</dd></div>
              <div><dt className="text-slate-500">Giảm giá đã duyệt</dt><dd>{terms.discount_type === 'NONE' ? 'Không' : `${terms.discount_name} · ${vnd(terms.discount_amount)}`}</dd></div>
              <div><dt className="text-slate-500">Học phí đã chốt</dt><dd>{vnd(terms.tuition_amount)}</dd></div>
              <div><dt className="text-slate-500">Cọc cần thu</dt><dd>{vnd(terms.deposit_due)}</dd></div>
              <div><dt className="text-slate-500">Đã nhận, đã xác thực</dt><dd>{vnd(paidTotal)}</dd></div>
              <div><dt className="text-slate-500">Còn lại</dt><dd>{vnd(tuitionRemaining)}</dd></div>
            </dl>}
            {app.status === 'VERIFIED' && !openOrder && <form action={setRegistrationDepositQuote} className="mt-4 grid gap-3">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <label className="vibe-field"><span>Gói học phí đang áp dụng</span>
                <select name="tuition_plan_id" required defaultValue=""><option value="" disabled>Chọn gói</option>{applicablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {vnd(plan.listPrice)}</option>)}</select>
              </label>
              <label className="vibe-field"><span>Giảm giá đã duyệt</span>
                <select name="discount_type" defaultValue="NONE"><option value="NONE">Không giảm</option><option value="PERCENT">Phần trăm</option><option value="FIXED">Số tiền</option></select>
              </label>
              <label className="vibe-field"><span>Giá trị giảm</span><input name="discount_value" type="number" min="0" step="1" defaultValue="0" /></label>
              <label className="vibe-field"><span>Tên quyết định giảm giá</span><input name="discount_name" maxLength={300} /></label>
              <p className="text-sm text-slate-600">Chưa có đơn MoMo thì có thể chốt lại nếu giá đổi. Đã tạo đơn thì giữ nguyên số đã chốt. Không hủy hồ sơ khi tiền vẫn có thể về.</p>
              <button className="vibe-button vibe-button-primary" type="submit">{terms ? 'Chốt lại học phí' : 'Chốt học phí và cọc 50%'}</button>
            </form>}
          </SectionCard>
          <SectionCard title="Bước tiếp theo">
            {app.status === 'DRAFT' && <ActionForm action={transitionRegistration} hidden={hidden} name="SUBMIT" label="Nộp hồ sơ" />}
            {app.status === 'SUBMITTED' && <ActionForm action={transitionRegistration} hidden={hidden} name="VERIFY" label="Xác minh hồ sơ" />}
            {app.status === 'DRAFT' && <p className="text-sm text-slate-600">Lưu bản nháp chưa tạo học viên và chưa phải đăng ký thành công.</p>}
            {['VERIFIED', 'PAYMENT_PENDING'].includes(app.status) && terms && depositRemaining >= 1000 && openOrder?.state !== 'READY' && <form action={createRegistrationMomoCheckout} className="grid gap-3">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <label className="vibe-field"><span>Số tiền nộp qua MoMo test (VND)</span><input name="amount" type="number" min="1000" max={Math.min(tuitionRemaining, 50_000_000)} step="1" required defaultValue={openOrder?.state === 'RESERVED' ? openOrder.amount : depositRemaining} /></label>
              <button className="vibe-button" type="submit">{openOrder?.state === 'RESERVED' ? 'Tiếp tục đơn MoMo đang giữ' : 'Tạo đơn MoMo test'}</button>
              <p className="text-sm text-slate-600">Nếu kênh MoMo test chưa có khóa merchant, bước này dừng lại. Ảnh chuyển khoản không được ghi nhận là đã thu.</p>
            </form>}
            {openOrder?.state === 'READY' && openOrder.pay_url && <a className="vibe-button vibe-button-primary" href={openOrder.pay_url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán MoMo test</a>}
            {app.status === 'PAID' && <form action={completeRegistration} className="grid gap-3">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <p className="text-sm">Tiền đã nhận được giữ lại. Hồ sơ này cần đối soát danh tính trước khi tạo hoặc liên kết học viên. Không tạo thêm học viên trùng.</p>
              <label className="vibe-field"><span>ID học viên đã xác nhận</span><input name="student_id" /></label>
              <label className="vibe-field"><span>ID phụ huynh đã xác nhận</span><input name="parent_id" /></label>
              <button className="vibe-button vibe-button-primary" type="submit">Liên kết danh tính đã đối soát</button>
            </form>}
            {app.status === 'COMPLETED' && <form action={allocateRegistrationDeposits} className="grid gap-3">
              <input type="hidden" name="application_id" value={app.id} />
              <label className="vibe-field"><span>ID công nợ học phí nội bộ đã phát hành</span><input name="invoice_id" defaultValue={app.invoice_id ?? ''} required /></label>
              <p className="text-sm text-slate-600">Chỉ phân bổ sau khi lớp và kỳ học phí đã tạo công nợ. Đây không phải hóa đơn thuế điện tử. Mỗi phiếu thu chỉ phân bổ một lần.</p>
              <button className="vibe-button" type="submit">Phân bổ cọc vào công nợ nội bộ</button>
            </form>}
            {paidTotal > 0 && app.status !== 'COMPLETED' && <p className="text-sm text-amber-900">Đã nhận {vnd(paidTotal)}. Hủy hồ sơ bị chặn. Chưa có quy trình hoàn tiền tự động.</p>}
            <ol className="grid gap-1 text-sm text-slate-600">{(events ?? []).map(event => <li key={event.id}>{event.created_at?.slice(0, 16).replace('T', ' ')} · {event.event_type}{event.to_status ? ` → ${registrationProgressLabel(event.to_status)}` : ''}</li>)}</ol>
          </SectionCard>
        </div>
        <div className="grid gap-4">
          <SectionCard title="Kết quả">
            <p className="text-sm">{student?.student_code ? <>Mã học viên {student.student_code}. {app.linked_student_id && <Link href={`/admin/students/${app.linked_student_id}`}>Mở học viên</Link>}</> : 'Chưa có mã học viên.'}</p>
            <p className="text-sm">{placement ? `Hồ sơ chờ lớp: ${registrationProgressLabel('COMPLETED', placement.status)}` : 'Chưa có hồ sơ chờ lớp.'}</p>
            <p className="text-sm">{invoice ? `Công nợ nội bộ ${invoice.invoice_number}: còn ${vnd(invoice.outstanding_balance)} / ${vnd(invoice.total_amount)}` : 'Chưa gắn công nợ học phí nội bộ.'}</p>
            <p className="text-sm">Đã phân bổ vào công nợ: {vnd(allocated)}</p>
          </SectionCard>
          <SectionCard title="Zalo">
            <p className="text-sm">Trạng thái thông báo: {notice}. Xếp hàng hoặc đã ánh xạ mẫu không có nghĩa là đã gửi tới phụ huynh.</p>
            <p className="text-sm">Mẫu 640377: {template?.provider_template_id === '640377' ? 'đã ghi trong danh mục' : 'chưa khớp danh mục'} · gửi thật {template?.enabled ? 'đang bật' : 'đang tắt'}.</p>
            {job?.error_code && <p className="text-sm">Mã lỗi: {job.error_code}</p>}
          </SectionCard>
          <ZaloConnectionCard applicationId={app.id} connection={connection} />
        </div>
      </div>
    </AppPage>
  )
}

function ActionForm({ action, hidden, name, label }: { action: (formData: FormData) => Promise<void>; hidden: Record<string, string>; name: string; label: string }) {
  return <form action={action}>{Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<input type="hidden" name="action_name" value={name} /><button className="vibe-button vibe-button-primary" type="submit">{label}</button></form>
}
