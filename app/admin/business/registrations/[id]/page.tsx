import { RecoveryControls } from '@/app/admin/system/integrations/zalo/RecoveryControls'
import { readRecovery } from '@/lib/integrations/zalo/registration-recovery'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { zaloNotificationLabel, zaloRecoveryMessage } from '@/lib/integrations/zalo/recovery-labels'
import { syncPendingPayosPayment } from '@/lib/integrations/payos/sync'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InlineNotice, SectionCard } from '@/app/admin/_components/vibe'
import { ProgressSteps, RecruitmentShell } from '../shell'
import styles from '../workspace.module.css'
import { allocateRegistrationDeposits, completeRegistration, createRegistrationMomoCheckout, createRegistrationPayosCheckout, setRegistrationDepositQuote, transitionRegistration } from '../actions'
import { PayosAwaiting } from './PayosAwaiting'
import { notificationProgressLabel, registrationEventLabel, registrationProgressLabel, staffFacingError, vnd } from '../status'
import { ConsentPanel, type ConsentEntry } from '../ConsentPanel'
import { vietnamToday } from '../intake'
import { CounterForm } from '../new/CounterForm'

const steps = ['Bản nháp', 'Đã nộp', 'Đã xác minh', 'Thanh toán', 'Xác nhận thanh toán', 'Chờ vào ca dạy']

export default async function RegistrationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; payos?: string; channel?: string }> }) {
  const { id } = await params
  const query = await searchParams
  const db = await createClient()
  const { data: canManageConsent } = await db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  const consentDetails = canManageConsent === true ? await db.rpc('registration_zalo_consent_details', { p_application: id }) : { data: null, error: null }
  const consentHistory = (consentDetails.data?.history ?? []) as ConsentEntry[]
  const activeConsent = consentHistory.find(item => !item.revokedAt)
  const { data: waitingPayos } = await db.from('registration_payos_orders').select('order_code, amount, payment_link_id, state').eq('application_id', id).eq('state', 'PENDING').maybeSingle()
  if (waitingPayos?.payment_link_id && waitingPayos.order_code && waitingPayos.amount) {
    await syncPendingPayosPayment(id, Number(waitingPayos.order_code), waitingPayos.payment_link_id, Number(waitingPayos.amount))
  }
  const { data: app, error: appError } = await db.from('registration_applications').select('id, application_code, branch_id, student_name, student_date_of_birth, student_over_18, parent_name, parent_phone, zalo_phone, home_address, program_interest, curriculum_id, level_id, subject_id, desired_start_date, preferred_schedule, status, invoice_id, deposit_confirmed_at, completed_at, linked_student_id, version, branches(name)').eq('id', id).maybeSingle()
  if (appError) {
    return <RecruitmentShell title="Đăng ký tại quầy" current="counter" crumb="Hồ sơ"><InlineNotice tone="error">Không tải được hồ sơ đăng ký.</InlineNotice></RecruitmentShell>
  }
  if (!app) notFound()
  const [{ data: events }, { data: placement }, { data: invoice }, { data: curriculum }, { data: level }, { data: terms }, { data: momoOrders }, { data: payosOrders }, { data: plans }, { data: jobs }, { data: zaloPreviewRows }, { data: phoneRows, error: phoneError }, { data: template }, { data: student }] = await Promise.all([
    db.from('registration_application_events').select('id, event_type, from_status, to_status, created_at').eq('application_id', id).order('created_at'),
    db.from('student_placement_cases').select('id, status, scheduled_start_date, assigned_class_id, curriculum_id, level_id, subject_id').eq('registration_application_id', id).maybeSingle(),
    app.invoice_id ? db.from('invoice_receivables').select('invoice_number, invoice_status, outstanding_balance, total_amount').eq('invoice_id', app.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    app.curriculum_id ? db.from('curriculums').select('name').eq('id', app.curriculum_id).maybeSingle() : Promise.resolve({ data: null }),
    app.level_id ? db.from('curriculum_levels').select('name').eq('id', app.level_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('registration_deposit_terms').select('list_amount, discount_type, discount_value, discount_name, discount_amount, tuition_amount, deposit_due, payment_option, amount_due').eq('application_id', id).maybeSingle(),
    db.from('registration_momo_orders').select('id, state, amount, pay_url, finance_payment_id, provider_transaction_id, partner_code').eq('application_id', id).order('created_at', { ascending: false }),
    db.from('registration_payos_orders').select('id, state, amount, attributed_amount, order_code, checkout_url, qr_code, finance_payment_id, provider_reference, description').eq('application_id', id).order('created_at', { ascending: false }),
    db.from('tuition_plans').select('id, name, code, tuition_plan_branch_prices(list_price, branch_id, status, currency)').eq('status', 'ACTIVE').order('name'),
    db.from('notification_jobs').select('id, status, error_code, sent_at, delivered_at, template_key, lease_until, attempts').eq('entity_type', 'REGISTRATION_COMPLETED').eq('entity_id', id).eq('channel', 'ZALO').order('created_at', { ascending: false }),
    db.rpc('preview_registration_zalo_payload', { p_application: id }),
    db.rpc('registration_zalo_phone_status', { p_application: id }),
    db.from('notification_templates').select('enabled, status, provider_template_id').eq('template_key', 'ZALO_REGISTRATION_CONFIRMED').eq('provider', 'ZALO').maybeSingle(),
    app.linked_student_id ? db.from('students').select('student_code').eq('id', app.linked_student_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const branch = Array.isArray(app.branches) ? app.branches[0] : app.branches
  const hidden = { application_id: app.id, version: String(app.version) }
  const paidOrders = (momoOrders ?? []).filter(order => order.state === 'PAID')
  const paidPayos = (payosOrders ?? []).filter(order => order.state === 'PAID')
  const checkoutRecorded = (payosOrders ?? []).some(order => order.state === 'RESERVED' || order.state === 'PENDING' || order.state === 'PAID')
  if (query.error === 'REGISTRATION_STALE' && (app.status === 'PAID' || app.status === 'COMPLETED' || checkoutRecorded)) {
    redirect(`/admin/business/registrations/${id}`)
  }
  const errorNotice = query.error?.startsWith('PHONE_') ? zaloRecoveryMessage(query.error) : staffFacingError(query.error)
  const openOrder = (momoOrders ?? []).find(order => order.state === 'READY' || order.state === 'RESERVED')
  const openPayos = (payosOrders ?? []).find(order => order.state === 'RESERVED' || order.state === 'PENDING')
  const payosException = (payosOrders ?? []).find(order => order.state === 'EXCEPTION')
  const paidTotal = paidOrders.reduce((sum, order) => sum + Number(order.amount), 0) + paidPayos.reduce((sum, order) => sum + Number(order.attributed_amount ?? order.amount), 0)
  const depositDue = Number(terms?.amount_due ?? terms?.deposit_due ?? 0)
  const agreed = Number(terms?.tuition_amount ?? 0)
  const depositRemaining = Math.max(0, depositDue - paidTotal)
  const tuitionRemaining = Math.max(0, agreed - paidTotal)
  const receiptIds = [...paidOrders, ...paidPayos].map(order => order.finance_payment_id).filter((value): value is string => Boolean(value))
  const { data: allocations } = receiptIds.length
    ? await db.from('payment_allocations').select('payment_id, amount').in('payment_id', receiptIds)
    : { data: [] }
  const allocated = (allocations ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
  const progress = registrationProgressLabel(app.status, placement?.status, placement?.scheduled_start_date)
  const job = jobs?.[0]
  const recovery = job ? await readRecovery(db, zaloServiceClient(), job.id) : null
  const zaloPreview = Array.isArray(zaloPreviewRows) ? zaloPreviewRows[0] : zaloPreviewRows
  const phone = (Array.isArray(phoneRows) ? phoneRows[0] : phoneRows) as { masked_phone: string | null; consent_present: boolean; blocked_reason: string | null } | null
  const neverAttempted = !!job && job.attempts === 0 && !job.sent_at && ['SKIPPED_NO_CHANNEL', 'QUEUED', 'PENDING'].includes(job.status)
  const notice = neverAttempted ? 'Chưa gửi' : job && app.status === 'COMPLETED' ? zaloNotificationLabel(job) : notificationProgressLabel(null)
  const applicablePlans = (plans ?? []).flatMap(plan => {
    const prices = (plan.tuition_plan_branch_prices ?? []).filter(price => price.status === 'ACTIVE' && price.currency === 'VND')
    const price = prices.find(price => price.branch_id === app.branch_id) ?? prices.find(price => price.branch_id == null)
    return price ? [{ id: plan.id, name: plan.name, duration: plan.name, listPrice: Number(price.list_price) }] : []
  })
  const stepIndex = app.status === 'COMPLETED' ? 5 : steps.indexOf(progress)
  const intakeCatalogs = app.status === 'DRAFT' ? await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('operational_curriculums').select('id, name').order('name'),
    db.from('curriculum_levels').select('id, curriculum_id, name').eq('status', 'ACTIVE').order('sequence_no'),
  ]) : null

  return (
    <RecruitmentShell title={app.application_code} description={`${branch?.name ?? 'Chi nhánh'} · ${progress}`} current="counter" crumb={app.application_code}>
      {errorNotice && <InlineNotice tone="error">{errorNotice}{query.error && query.error !== errorNotice && <details className={styles.diagnostics}><summary>Chi tiết kỹ thuật</summary><p>{query.error}</p></details>}</InlineNotice>}
      {query.channel && <InlineNotice tone="info">{zaloRecoveryMessage(query.channel)}</InlineNotice>}
      <ProgressSteps labels={steps} currentIndex={stepIndex < 0 ? 0 : stepIndex} />
      <div className={styles.layout}>
        <div className={styles.stack}>
          <SectionCard title="Hồ sơ">
            <dl className={styles.facts}>
              <div><dt className="text-slate-500">Học viên</dt><dd>{app.student_name} · {app.student_date_of_birth} · {app.student_over_18 ? 'Trên 18 tuổi' : 'Chưa đánh dấu trên 18 tuổi'}</dd></div>
              <div><dt className="text-slate-500">Phụ huynh</dt><dd>{app.parent_name || 'Không có'} · {app.parent_phone || '—'}</dd></div>
              <div><dt className="text-slate-500">Địa chỉ nhà</dt><dd>{app.home_address || 'Chưa có. Hồ sơ cũ cần bổ sung khi lưu lại bước thông tin.'}</dd></div>
              <div><dt className="text-slate-500">Số Zalo</dt><dd>{app.zalo_phone || 'Chưa có'}</dd></div>
              <div><dt className="text-slate-500">Chương trình</dt><dd>{curriculum?.name || app.program_interest || 'Chưa chọn'}</dd></div>
              <div><dt className="text-slate-500">Trình độ</dt><dd>{level?.name || '—'}</dd></div>
              <div><dt className="text-slate-500">Môn học</dt><dd>{app.subject_id ? 'Đã gắn từ hồ sơ trước' : 'Chưa chọn. Môn học gắn khi vào ca, không chọn ở bước thông tin.'}</dd></div>
              <div><dt className="text-slate-500">Muốn bắt đầu</dt><dd>{app.desired_start_date || '—'} · {app.preferred_schedule || 'Chưa có khung giờ'}</dd></div>
              <div><dt className="text-slate-500">Xếp lớp</dt><dd>{placement ? registrationProgressLabel('COMPLETED', placement.status, placement.scheduled_start_date) : 'Chưa mở hồ sơ chờ lớp'}{placement?.assigned_class_id ? '' : placement ? ' · chưa gán lớp' : ''}</dd></div>
            </dl>
          </SectionCard>
          <SectionCard title="Học phí đã chốt">
            {!terms && <p className="text-sm">Chưa chốt học phí. Chọn thời hạn và cách thu trước khi xác nhận. Giá đã chốt không đổi khi bảng giá sau này thay đổi.</p>}
            {terms && <dl className={styles.facts}>
              <div><dt className="text-slate-500">Chi nhánh</dt><dd>{branch?.name}</dd></div>
              <div><dt className="text-slate-500">Cách thu</dt><dd>{terms.payment_option === 'FULL' ? 'Thanh toán đủ' : 'Thanh toán tối thiểu 50%'}</dd></div>
              <div><dt className="text-slate-500">Giá niêm yết</dt><dd>{vnd(terms.list_amount)}</dd></div>
              <div><dt className="text-slate-500">Giảm giá đã duyệt</dt><dd>{terms.discount_type === 'NONE' ? 'Không' : `${terms.discount_name} · ${vnd(terms.discount_amount)}`}</dd></div>
              <div><dt className="text-slate-500">Học phí đã chốt</dt><dd>{vnd(terms.tuition_amount)}</dd></div>
              <div><dt>Phải thu ngay</dt><dd className={styles.amount}>{vnd(terms.amount_due)}</dd></div>
              <div><dt className="text-slate-500">Đã nhận, đã xác thực</dt><dd>{vnd(paidTotal)}</dd></div>
              <div><dt className="text-slate-500">Học phí còn lại</dt><dd>{vnd(tuitionRemaining)}</dd></div>
              <div><dt className="text-slate-500">Học phí đã thu đủ</dt><dd>{paidTotal >= agreed && agreed > 0 ? 'Đã thu đủ' : 'Chưa thu đủ'}</dd></div>
            </dl>}
            {app.status === 'VERIFIED' && !(momoOrders?.length || payosOrders?.length) && <form action={setRegistrationDepositQuote} className="mt-4 grid gap-3">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <label className="vibe-field"><span>Thời hạn · giá niêm yết của {branch?.name}</span>
                <select name="tuition_plan_id" required defaultValue=""><option value="" disabled>Chọn thời hạn</option>{applicablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.duration} · {vnd(plan.listPrice)}</option>)}</select>
              </label>
              <label className="vibe-field"><span>Cách thu</span>
                <select name="payment_option" defaultValue="DEPOSIT_50"><option value="DEPOSIT_50">Thanh toán tối thiểu 50%</option><option value="FULL">Thanh toán đủ 100%</option></select>
              </label>
              <label className="vibe-field"><span>Giảm giá đã duyệt</span>
                <select name="discount_type" defaultValue="NONE"><option value="NONE">Không giảm</option><option value="PERCENT">Phần trăm</option><option value="FIXED">Số tiền</option></select>
              </label>
              <label className="vibe-field"><span>Giá trị giảm</span><input name="discount_value" type="number" min="0" step="1" defaultValue="0" /></label>
              <label className="vibe-field"><span>Tên quyết định giảm giá</span><input name="discount_name" maxLength={300} /></label>
              <p className="text-sm text-slate-600">Chưa có đơn thanh toán thì có thể chốt lại nếu giá đổi. Đã tạo đơn thì giữ nguyên số đã chốt. Không hủy hồ sơ khi tiền vẫn có thể về.</p>
              <button className="vibe-button vibe-button-primary" type="submit">{terms ? 'Xác nhận lại học phí' : 'Xác nhận học phí'}</button>
            </form>}
          </SectionCard>
          <SectionCard title="Bước tiếp theo">
            {app.status === 'DRAFT' && intakeCatalogs && <CounterForm branches={intakeCatalogs[0].data ?? []} lead={null} curriculums={[...(intakeCatalogs[1].data ?? []), ...(app.curriculum_id && curriculum?.name && !(intakeCatalogs[1].data ?? []).some(item => item.id === app.curriculum_id) ? [{ id: app.curriculum_id, name: `${curriculum.name} (hồ sơ lịch sử)` }] : [])]} levels={intakeCatalogs[2].data ?? []} today={vietnamToday()} existing={app} consentPhone={phone?.consent_present ? app.zalo_phone : null} />}
            {app.status === 'DRAFT' && <ActionForm action={transitionRegistration} hidden={hidden} name="SUBMIT" label="Nộp hồ sơ" />}
            {app.status === 'SUBMITTED' && <ActionForm action={transitionRegistration} hidden={hidden} name="VERIFY" label="Xác minh hồ sơ" />}
            {app.status === 'DRAFT' && <p className="text-sm text-slate-600">Lưu bản nháp chưa tạo học viên và chưa phải đăng ký thành công.</p>}
            {['VERIFIED', 'PAYMENT_PENDING'].includes(app.status) && terms && depositRemaining >= 1000 && !openPayos && openOrder?.state !== 'READY' && <form action={createRegistrationMomoCheckout} className="grid gap-3">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <label className="vibe-field"><span>Số tiền nộp qua MoMo test (VND)</span><input name="amount" type="number" min="1000" max={Math.min(tuitionRemaining, 50_000_000)} step="1" required defaultValue={openOrder?.state === 'RESERVED' ? openOrder.amount : depositRemaining} /></label>
              <button className="vibe-button" type="submit">{openOrder?.state === 'RESERVED' ? 'Tiếp tục đơn MoMo đang giữ' : 'Tạo đơn MoMo test'}</button>
              <p className="text-sm text-slate-600">Nếu kênh MoMo test chưa có khóa merchant, bước này dừng lại. Ảnh chuyển khoản không được ghi nhận là đã thu.</p>
            </form>}
            {openOrder?.state === 'READY' && openOrder.pay_url && <a className="vibe-button vibe-button-primary" href={openOrder.pay_url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán MoMo test</a>}
            {['VERIFIED', 'PAYMENT_PENDING'].includes(app.status) && terms && depositRemaining >= 1000 && !openOrder && openPayos?.state !== 'PENDING' && <form action={createRegistrationPayosCheckout} className="grid gap-3">
              {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <button className="vibe-button vibe-button-primary" type="submit">{openPayos?.state === 'RESERVED' ? 'Tiếp tục link payOS đang giữ' : 'Tạo link thanh toán payOS'}</button>
              <p className="text-sm text-slate-600">Số tiền do báo giá đã chốt quyết định, không lấy từ trình duyệt. Mã đơn payOS là số riêng, không dùng mã hồ sơ.</p>
            </form>}
            {openPayos?.state === 'PENDING' && <>
              <PayosAwaiting pending />
              <p className={styles.amount}>{vnd(openPayos.amount)}</p>
              <p className="text-sm"><span className={styles.badge}>Đang chờ thanh toán</span> · đơn {openPayos.order_code}. {query.payos === 'cancel' ? 'Người nộp đã rời trang thanh toán.' : 'Chưa có xác nhận tiền về.'}</p>
              {openPayos.checkout_url && <a className={styles.buttonPrimary} href={openPayos.checkout_url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán</a>}
              {openPayos.qr_code && <p className="text-sm">Mã QR đã lưu trên máy chủ. Mở trang thanh toán để quét. Trang này không hiện tài khoản ngân hàng.</p>}
            </>}
            {payosException && <p className="text-sm text-amber-900">payOS ghi nhận tiền đến sau khi đơn đã hủy. Đơn {payosException.order_code} đang chờ đối soát, chưa tạo học viên.</p>}
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
              <button className="vibe-button" type="submit">Phân bổ thanh toán vào công nợ nội bộ</button>
            </form>}
            {paidTotal > 0 && app.status !== 'COMPLETED' && <p className="text-sm text-amber-900">Đã nhận {vnd(paidTotal)}. Hủy hồ sơ bị chặn. Chưa có quy trình hoàn tiền tự động.</p>}
            <ol className="grid gap-1 text-sm text-slate-600">{(events ?? []).map(event => <li key={event.id}>{event.created_at ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(event.created_at)) + ' (UTC+7)' : ''} · {registrationEventLabel(event.event_type)}{event.to_status ? ` → ${registrationProgressLabel(event.to_status)}` : ''}</li>)}</ol>
          </SectionCard>
        </div>
        <div className={styles.stack}>
          <SectionCard title="Kết quả">
            <p className="text-sm">Đăng ký: {app.status === 'COMPLETED' ? 'đã hoàn tất' : 'chưa hoàn tất'}. Học phí: {paidTotal >= agreed && agreed > 0 ? 'đã thu đủ' : 'chưa thu đủ'}. Đây là hai việc khác nhau.</p>
            <p className="text-sm">Mã hồ sơ {app.application_code}. {student?.student_code ? <>Mã học viên {student.student_code}. {app.linked_student_id && <Link className={styles.button} href={`/admin/students/${app.linked_student_id}`}>Mở học viên</Link>}</> : 'Chưa có mã học viên.'}</p>
            {app.status === 'COMPLETED' && <p className="text-sm"><Link className={styles.button} href="/admin/students?tab=waiting">Mở hàng chờ vào ca dạy</Link></p>}
            {paidOrders.length > 0 && <ul className="grid gap-1 text-sm">{paidOrders.map(order => <li key={order.id}>{order.partner_code === 'FIXTURE' ? 'Fixture thử nghiệm local, không phải giao dịch MoMo' : 'MoMo'} · {order.provider_transaction_id} · {vnd(order.amount)}</li>)}</ul>}
            {paidPayos.length > 0 && <ul className="grid gap-1 text-sm">{paidPayos.map(order => <li key={order.id}>{order.provider_reference?.startsWith('FIXTURE') ? 'Dữ liệu thử nghiệm, chưa phải giao dịch payOS' : 'payOS đã xác thực'} · {order.order_code} · {vnd(order.amount)}</li>)}</ul>}
            <p className="text-sm">{placement ? `Hồ sơ chờ lớp: ${registrationProgressLabel('COMPLETED', placement.status, placement.scheduled_start_date)}` : 'Chưa có hồ sơ chờ lớp.'}</p>
            <p className="text-sm">{invoice && app.invoice_id ? <>Công nợ nội bộ {invoice.invoice_number}: còn {vnd(invoice.outstanding_balance)} / {vnd(invoice.total_amount)}. <Link href={`/admin/finance/invoices?selected=${app.invoice_id}`}>Mở hóa đơn kỳ học phí</Link></> : 'Chưa có hóa đơn kỳ học phí ghi công nợ. Hóa đơn nội bộ của từng khoản đã thu có thể xem bên dưới; khoản thu chưa tự tạo công nợ.'}</p>
            {receiptIds.map(receiptId => <p key={receiptId} className="text-sm"><Link href={`/admin/finance/payments?selected=${receiptId}#payment-detail`}>Mở phiếu thu</Link> · <Link href={`/documents/finance/payment-invoices/${receiptId}`}>Xem / In hóa đơn A5</Link></p>)}
            <p className="text-sm">Đã phân bổ vào công nợ: {vnd(allocated)}</p>
          </SectionCard>
          <SectionCard title="Zalo">
            <p className="text-sm">Trạng thái thông báo: {notice}. Xếp hàng hoặc đã ánh xạ mẫu không có nghĩa là đã gửi tới phụ huynh.</p>
            {neverAttempted && <InlineNotice tone="info">Thông báo chưa được gửi tới Zalo. Trạng thái thanh toán và đăng ký được theo dõi riêng.</InlineNotice>}
            {!phoneError && !phone?.consent_present && <p className="text-sm">Thiếu đồng ý nhận tin cho số điện thoại. Thanh toán không thay thế sự đồng ý nhận thông báo.</p>}
            {phoneError && canManageConsent === true && <InlineNotice tone="error">Không tải được trạng thái đồng ý. Hãy tải lại để kiểm tra; chưa thể kết luận thiếu đồng ý.</InlineNotice>}
            {phone?.blocked_reason === 'WRONG_RECIPIENT' && <InlineNotice tone="error">{zaloRecoveryMessage('WRONG_RECIPIENT')}</InlineNotice>}
            {!template?.enabled && <InlineNotice tone="info">{zaloRecoveryMessage('GATE_DISABLED')}</InlineNotice>}
            <p className="text-sm">Mẫu 640377: {template?.provider_template_id === '640377' && template.status === 'APPROVED' ? 'đã duyệt trong danh mục' : 'cần kiểm tra phê duyệt'}. Điều kiện gửi được kiểm tra theo hồ sơ và kết nối.</p>
            <p className="text-sm">Zalo chấp nhận tin: {job?.sent_at ? 'đã chấp nhận' : 'chưa'} · Zalo đã phát tới máy: {job?.delivered_at ? 'đã phát' : 'chưa'}.</p>
            <p className="text-sm">Nội dung dự kiến gửi sau khi khoản thu được xác thực và hồ sơ hoàn tất. Bản xem trước không xác nhận đã nhận tiền hoặc đã gửi tin.</p>
            {zaloPreview && <dl className="grid gap-1 text-sm">
              <div>Phụ huynh: {zaloPreview.customer_name}</div>
              <div>Mã hồ sơ: {zaloPreview.registration_code}</div>
              <div>Học viên: {zaloPreview.student_name}</div>
              <div>Chương trình: {zaloPreview.program_name}</div>
              <div>Chi nhánh: {zaloPreview.branch_name}</div>
              <div>Mã đơn: {zaloPreview.order_code}</div>
              <div>Trạng thái thu dự kiến trong tin: {zaloPreview.payment_status}</div>
            </dl>}
            {job?.error_code && job.error_code !== 'SKIPPED_NO_CHANNEL' && <InlineNotice tone="error">{app.status === 'COMPLETED' && ['ZALO_TOKEN_INVALID', 'ZALO_PROOF_INVALID', 'ZALO_REFRESH_TOKEN_MISSING', 'ZALO_RECONNECT_REQUIRED'].includes(job.error_code) && <p>Đăng ký đã hoàn tất. Thông báo Zalo chưa gửi được do kết nối cần được cập nhật.</p>}{zaloRecoveryMessage(job.error_code)} {['NO_CONSENT', 'WRONG_RECIPIENT', 'CHANNEL_SNAPSHOT_REQUIRED'].includes(job.error_code) ? <a href="#zalo-consent">Kiểm tra đồng ý tại hồ sơ</a> : <Link href={`/admin/system/integrations/zalo?job=${job.id}#${job.id}`}>Kiểm tra kết nối và thông báo</Link>}</InlineNotice>}
            {job && <details className={styles.diagnostics}><summary>Chi tiết điều kiện và lịch sử gửi</summary><p>Trạng thái lưu: {job.status} · Lần thử: {job.attempts} · Lý do: {phoneError ? 'Không đọc được dữ liệu đồng ý' : phone?.blocked_reason ?? job.error_code ?? 'Không có'} · Cổng gửi: {template?.enabled ? 'bật' : 'tắt'}.</p></details>}
            {canManageConsent === true && recovery && <RecoveryControls key={`${activeConsent?.id ?? "none"}:${job?.status}:${job?.attempts}`} initial={recovery} />}
          </SectionCard>
          <div id="zalo-consent"><ConsentPanel key={activeConsent?.id ?? "none"} applicationId={app.id} allowed={canManageConsent === true} error={!!consentDetails.error} history={consentHistory} /></div>
        </div>
      </div>
    </RecruitmentShell>
  )
}

function ActionForm({ action, hidden, name, label }: { action: (formData: FormData) => Promise<void>; hidden: Record<string, string>; name: string; label: string }) {
  return <form action={action}>{Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<input type="hidden" name="action_name" value={name} /><button className="vibe-button vibe-button-primary" type="submit">{label}</button></form>
}
