import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeRegistration, transitionRegistration } from '../actions'
import { ZaloConnectionCard, type ZaloConnectionView } from './ZaloConnection'

export default async function RegistrationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const query = await searchParams
  const db = await createClient()
  const { data: app } = await db.from('registration_applications').select('id, application_code, branch_id, student_name, student_date_of_birth, parent_name, parent_phone, program_interest, instrument_interest, desired_start_date, preferred_schedule, status, invoice_id, payment_confirmed_at, completed_at, linked_student_id, linked_parent_id, linked_enrollment_id, version, branches(name)').eq('id', id).maybeSingle()
  if (!app) notFound()
  const [{ data: events }, { data: placement }, { data: invoice }, { data: zaloRows }] = await Promise.all([
    db.from('registration_application_events').select('id, event_type, from_status, to_status, created_at').eq('application_id', id).order('created_at'),
    db.from('student_placement_cases').select('id, status, scheduled_start_date, assigned_class_id').eq('registration_application_id', id).maybeSingle(),
    app.invoice_id ? db.from('invoice_receivables').select('invoice_status, outstanding_balance').eq('invoice_id', app.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    db.rpc('registration_zalo_connection', { p_application: id }),
  ])
  const zalo = (Array.isArray(zaloRows) ? zaloRows[0] : zaloRows) as ZaloConnectionView | undefined
  const connection: ZaloConnectionView = zalo ?? {
    link_status: 'NONE',
    external_link_key: null,
    linked_at: null,
    last_verified_at: null,
    masked_user_id: null,
  }
  const branch = Array.isArray(app.branches) ? app.branches[0] : app.branches
  const hidden = { application_id: app.id, version: String(app.version) }
  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm'
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Hồ sơ đăng ký</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">{app.application_code}</h1>
      <p className="mt-2 text-sm text-gray-500">{branch?.name} · {app.status}</p>
      {query.error && <p className="mt-4 text-sm text-red-700">{query.error}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 text-sm">
          <h2 className="font-semibold">Hồ sơ</h2>
          <dl className="mt-3 space-y-2">
            <div><dt className="text-gray-500">Học viên</dt><dd>{app.student_name} · {app.student_date_of_birth}</dd></div>
            <div><dt className="text-gray-500">Phụ huynh</dt><dd>{app.parent_name} · {app.parent_phone || '—'}</dd></div>
            <div><dt className="text-gray-500">Bộ môn</dt><dd>{app.program_interest || '—'} · {app.instrument_interest || '—'}</dd></div>
            <div><dt className="text-gray-500">Ngày muốn học</dt><dd>{app.desired_start_date || '—'} · {app.preferred_schedule || 'Chưa có lịch mong muốn'}</dd></div>
            <div><dt className="text-gray-500">Thanh toán</dt><dd>{app.invoice_id ? (invoice?.outstanding_balance === 0 ? 'Đã đủ theo công nợ hóa đơn' : 'Hóa đơn chưa thanh toán đủ') : 'Chưa gắn hóa đơn'}</dd></div>
            <div><dt className="text-gray-500">Kết quả</dt><dd>{app.linked_student_id ? <Link href={`/admin/students/${app.linked_student_id}`}>Học viên đã liên kết</Link> : 'Chưa hoàn tất'}{placement ? ` · Xếp lớp ${placement.status}` : ''}</dd></div>
          </dl>
        </section>
        <ZaloConnectionCard applicationId={app.id} connection={connection} />
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Thao tác</h2>
          {app.status === 'DRAFT' && <form action={transitionRegistration} className="mt-3"><input type="hidden" name="action_name" value="SUBMIT" />{Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Nộp hồ sơ</button></form>}
          {app.status === 'SUBMITTED' && <form action={transitionRegistration} className="mt-3"><input type="hidden" name="action_name" value="VERIFY" />{Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Xác minh</button></form>}
          {['VERIFIED', 'PAID'].includes(app.status) && <form action={completeRegistration} className="mt-3 space-y-2">{Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<input name="student_id" placeholder="Mã học viên đã có, nếu đã xác nhận" className={field} /><input name="parent_id" placeholder="Mã phụ huynh đã có, nếu đã xác nhận" className={field} /><button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Hoàn tất đăng ký</button></form>}
          <ol className="mt-4 space-y-2 text-sm text-gray-600">{(events ?? []).map(event => <li key={event.id}>{event.event_type}{event.to_status ? ` → ${event.to_status}` : ''}</li>)}</ol>
        </section>
      </div>
    </div>
  )
}
