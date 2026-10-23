import Link from 'next/link'
import { requestClient, requestOperationalAdmin } from '@/lib/auth/request'
import { businessDate } from '@/app/admin/_lib/business-date'
import { EmptyState, InlineNotice, OperationsFilterBar, OpsMetricLink, OpsTabs, StatusBadge, buildQuery } from '@/app/admin/_components/vibe'
import ClassOpsWorkspace from '../classes/_ops/Workspace'
import { loadClassOps } from '../classes/_ops/data'
import { cancelPlacement, changePlacement } from '../students/placement-actions'
import ShiftScheduleForm from './shift-picker'
import { PlacementWindowsForm } from './time-window-fields'
import { dayChoices } from '@/lib/teaching-shifts/independent'
import { placementLabel } from '../business/crm/model'
import { generateSessions } from '../attendance/actions'
import { changeRecurringSchedule } from './actions'
import { coordinationView, loadCoordination, loadWeek, type CandidateRow, type WaitingRow } from './data'
import styles from './panel.module.css'
import { blockerLabel, dayOptions, fitLabel, formatSession, proposedParticipationDate, reasonLabel, suggestionLink } from './rules'

type Params = Record<string, string | undefined>

function href(params: Params, patch: Record<string, string | undefined> = {}) {
  const query = buildQuery({
    tab: 'coordination',
    view: params.view || 'queue',
    branch: params.branch,
    curriculum: params.curriculum,
    q: params.q,
    filter: params.filter,
    date: params.date,
    page: undefined,
    place: undefined,
    start: undefined,
    class: undefined,
  }, patch)
  return `/admin/students?${query}`
}

function rel<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function CoordinationWorkspace({ params }: { params: Params }) {
  const view = coordinationView(params.view)
  const scoped = { ...params, view }
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--vibe-navy)]">Ca dạy & Lịch học</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--vibe-muted)]">
          Mỗi ca định kỳ là một thứ và một khung giờ. Chọn nhiều thứ khi tạo ca sẽ tạo nhiều ca độc lập. Học viên được xếp vào từng ca đã chọn.
        </p>
      </header>
      {(params.error || params.success) && <InlineNotice tone={params.error ? 'error' : 'success'}>{params.error || params.success}</InlineNotice>}
      {params.placed && <InlineNotice tone="success">Đã xếp ca. Học viên bắt đầu trong tương lai vẫn ở mục Đã xếp ca – chờ bắt đầu cho đến đúng ngày.{' '}
        <Link href={href(scoped, { view: 'queue' })}>Xếp học viên tiếp theo</Link>
      </InlineNotice>}
      <OpsTabs
        ariaLabel="Ca dạy và lịch học"
        tabs={[
          { href: href(scoped, { view: 'queue' }), label: 'Chờ vào ca', active: view === 'queue' },
          { href: href(scoped, { view: 'shifts' }), label: 'Danh sách ca', active: view === 'shifts' },
          { href: href(scoped, { view: 'week' }), label: 'Lịch tuần', active: view === 'week' },
          { href: href(scoped, { view: 'today' }), label: 'Hôm nay', active: view === 'today' },
        ]}
      />
      {view === 'queue' && <Queue params={scoped} />}
      {view === 'shifts' && <Shifts params={scoped} />}
      {view === 'week' && <Week params={scoped} />}
      {view === 'today' && <Today params={scoped} canOperate={await requestOperationalAdmin().then(result => result.data === true)} />}
    </section>
  )
}

async function Queue({ params }: { params: Params }) {
  const db = await requestClient()
  const data = await loadCoordination(db, params)
  if (data.error || !data.queue) {
    return (
      <InlineNotice tone="error">
        {data.error || 'Không tải được hàng chờ.'} {data.reference ? `Mã đối chiếu ${data.reference}.` : ''}{' '}
        <Link href={href(params)}>Tải lại</Link>
      </InlineNotice>
    )
  }
  const queue = data.queue
  const counts = queue.counts
  return (
    <div className={data.place ? styles.layout : 'space-y-4'}>
      <div className="space-y-4">
        <div className="vibe-metrics">
          <OpsMetricLink href={href(params, { filter: 'ALL' })} title="Chờ vào ca" value={counts.waiting} />
          <OpsMetricLink href={href(params, { filter: 'UNASSIGNED' })} title="Chưa vào ca" value={counts.unassigned} />
          <OpsMetricLink href={href(params, { filter: 'MATCHING' })} title="Đang tìm ca" value={counts.matching} />
          <OpsMetricLink href="/admin/students?tab=students&lifecycle=future" title="Đã xếp ca – chờ bắt đầu" value={counts.future} />
          <section className="vibe-card vibe-metric"><p>Chờ hơn 7 ngày</p><strong>{queue.summary?.over_7 ?? 0}</strong></section>
        </div>
        <InlineNotice tone="info">Hành trình học thuật đã được ghi từ lúc đăng ký. Thao tác còn lại là sắp học viên vào một ca dạy cùng chương trình và trình độ.</InlineNotice>
        <OperationsFilterBar
          action="/admin/students"
          hidden={{ tab: 'coordination', view: 'queue', filter: params.filter }}
          resetHref="/admin/students?tab=coordination&view=queue"
          fields={[
            { name: 'curriculum', label: 'Chương trình', type: 'select', value: data.curriculum, options: queue.programs, allLabel: 'Tất cả chương trình' },
            { name: 'branch', label: 'Chi nhánh', type: 'select', value: data.branch, options: queue.branches },
            { name: 'q', label: 'Tìm học viên', type: 'search', value: data.q, placeholder: 'Tên hoặc mã học viên' },
          ]}
        />
        <OpsTabs
          ariaLabel="Lọc chờ vào ca"
          tabs={[
            ['ALL', 'Tất cả'],
            ['UNASSIGNED', 'Chưa vào ca dạy'],
            ['MATCHING', 'Đang tìm ca phù hợp'],
          ].map(([id, label]) => ({ href: href(params, { filter: id }), label, active: data.filter === id }))}
        />
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead>
              <tr>{['Học viên', 'Chương trình / trình độ', 'Khung giờ', 'Số ngày chờ', 'Vướng mắc', 'Phụ trách', ''].map(label => <th key={label}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {queue.rows.map((row: WaitingRow) => (
                <tr key={row.placement_id}>
                  <td>
                    <strong>{row.student_name}</strong>
                    <small className="block text-[var(--vibe-muted)]">{row.branch_name}{row.parent_name ? ` · ${row.parent_name}` : ''}</small>
                  </td>
                  <td>{row.program_name || '—'}<small className="block">{row.level_name || 'Chưa có trình độ'}</small></td>
                  <td>{row.preferred_schedule || 'Chưa có ghi chú lịch'}</td>
                  <td>{row.days_waiting}{row.desired_start && row.desired_start < data.today ? <small className="block">Muốn bắt đầu {row.desired_start}, đã qua</small> : null}</td>
                  <td>{blockerLabel(queue.blockers.get(row.placement_id))}</td>
                  <td>{row.owner_name || '—'}</td>
                  <td><Link className="vibe-button vibe-button-primary" href={href(params, { place: row.placement_id, page: String(data.page) })}>Xếp lịch học</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!queue.rows.length && <EmptyState>Không có học viên đang chờ với bộ lọc này.</EmptyState>}
        <div className="vibe-actions">
          {data.page > 1 && <Link className="vibe-button" href={href(params, { page: String(data.page - 1) })}>Trang trước</Link>}
          {queue.more && <Link className="vibe-button" href={href(params, { page: String(data.page + 1) })}>Trang sau</Link>}
        </div>
      </div>
      {data.place && <PlacementPanel params={params} data={data} />}
    </div>
  )
}

function PlacementPanel({ params, data }: { params: Params; data: Awaited<ReturnType<typeof loadCoordination>> }) {
  const close = href(params, { page: params.page })
  if (data.candidates?.error) {
    return (
      <aside className={styles.panel} aria-label="Xếp ca">
        <Link href={close}>Đóng</Link>
        <InlineNotice tone="error">{data.candidates.error} {data.candidates.reference ? `Mã đối chiếu ${data.candidates.reference}.` : ''} <Link href={href(params, { place: data.place, page: params.page })}>Tải lại</Link></InlineNotice>
      </aside>
    )
  }
  const detail = data.detail
  if (!detail) return null
  const student = rel(detail.students as { full_name?: string } | { full_name?: string }[] | null)
  const branch = rel(detail.branches as { name?: string } | { name?: string }[] | null)
  const application = rel(detail.registration_applications as { status?: string; payment_confirmed_at?: string | null; curriculum_id?: string | null; level_id?: string | null; preferred_schedule?: string | null } | null)
  const desired = typeof detail.desired_start_date === 'string' ? detail.desired_start_date : null
  const start = proposedParticipationDate(typeof params.start === 'string' && params.start >= data.today ? params.start : desired, data.today)
  const rows = data.candidates?.rows ?? []
  const summary = rows[0]
  const eligible = rows.filter(row => row.outcome === 'ELIGIBLE' && row.class_id)
  const unresolved = rows.filter(row => row.outcome !== 'ELIGIBLE' && row.class_id)
  const empty = rows.find(row => row.outcome === 'EMPTY')
  const selected = eligible.find(row => row.class_id === params.class) || (eligible.length === 1 ? eligible[0] : null)
  const status = String(detail.status ?? '')
  const futureChange = status === 'SCHEDULED' && typeof detail.scheduled_start_date === 'string' && detail.scheduled_start_date > data.today
  const canAssign = status === 'UNASSIGNED' || status === 'MATCHING'
  const returnTo = href(params, { place: data.place, start, class: selected?.class_id || undefined, page: params.page })
  const programId = application?.curriculum_id || ''
  const levelId = application?.level_id || ''
  const create = suggestionLink('CREATE_SHIFT', null, { branch: String(detail.branch_id ?? ''), program: programId, level: levelId })
  return (
    <aside className={styles.panel} aria-label="Xếp ca">
      <div className="flex items-start justify-between gap-3">
        <h2>Xếp ca</h2>
        <Link href={close}>Đóng</Link>
      </div>
      <p className="mt-2 text-sm"><strong>{student?.full_name || 'Học viên'}</strong> · {branch?.name || 'Chi nhánh'} · {status ? placementLabel(status) : ''}</p>
      <p className="text-sm text-[var(--vibe-muted)]">Thanh toán: {application?.status === 'COMPLETED' ? `Đã đủ điều kiện${application.payment_confirmed_at ? ` · ${application.payment_confirmed_at.slice(0, 10)}` : ''}` : 'Chưa đủ điều kiện để xác nhận'}</p>
      <p className="text-sm">Ngày mong muốn: {desired || 'Chưa có'}{desired && desired < data.today ? ' · đã qua, không dùng làm ngày xác nhận' : ''}</p>
      <p className="text-sm">Ngày tham gia đề xuất: {start}</p>
      <p className="text-sm">Ghi chú lịch từ đăng ký: {String(detail.preferred_schedule || application?.preferred_schedule || 'Không có')} — không được hiểu thành khung giờ đã chốt.</p>
      <PlacementWindowsForm
        initial={data.windows}
        mode={typeof detail.availability_mode === 'string' ? detail.availability_mode : 'PREFERENCE'}
        note={typeof detail.availability_note === 'string' ? detail.availability_note : ''}
        required={typeof detail.required_weekly_sessions === 'number' ? detail.required_weekly_sessions : null}
        placementId={String(detail.id)}
        returnTo={returnTo}
        canEdit={canAssign}
      />
      {data.placedShifts.length > 0 && (
        <div className="mt-3 space-y-1">
          <h3 className="text-sm font-semibold text-[var(--vibe-navy)]">Lịch đã ghi danh</h3>
          {data.placedShifts.map(shift => (
            <p key={`${shift.classId}-${shift.day}-${shift.start}`} className="text-sm">{dayChoices.find(choice => choice.day === shift.day)?.label ?? `Thứ ${shift.day}`} · {shift.start}–{shift.end} · {shift.code} · {shift.name}</p>
          ))}
        </div>
      )}
      {summary && <p className="mt-3 text-sm">Đã xét {summary.evaluated_count ?? 0} ca cùng chi nhánh và chương trình trước khi phân trang. Phù hợp: {summary.total_eligible ?? 0}. Chưa phù hợp: {summary.total_ineligible ?? 0}. Chưa đủ dữ liệu: {summary.total_unknown ?? 0}.</p>}
      {canAssign && eligible.length > 0 && (
        <ShiftScheduleForm
          rows={eligible}
          windows={data.windows}
          placedClassIds={data.placedShifts.map(shift => shift.classId)}
          requestId={crypto.randomUUID()}
          placementId={String(detail.id)}
          version={String(detail.version ?? '')}
          returnTo={returnTo}
          start={start}
          today={data.today}
          requiredWeekly={typeof detail.required_weekly_sessions === 'number' ? detail.required_weekly_sessions : null}
          alreadyWeekly={data.placedWeekly}
          studentName={student?.full_name || 'Học viên'}
        />
      )}
      {futureChange && (
        <form action={changePlacement} className="mt-3 space-y-3">
          <input type="hidden" name="request_id" value={crypto.randomUUID()} />
          <input type="hidden" name="placement_id" value={String(detail.id)} />
          <input type="hidden" name="version" value={String(detail.version ?? '')} />
          <input type="hidden" name="enrollment_id" value={String(detail.enrollment_id ?? '')} />
          <input type="hidden" name="return_to" value={returnTo} />
          {eligible.map(row => <Candidate key={row.class_id} row={row} selected={selected?.class_id === row.class_id} />)}
          <label className="block text-sm">Ngày tham gia mới
            <input name="start_date" type="date" required min={businessDate()} defaultValue={typeof detail.scheduled_start_date === 'string' ? detail.scheduled_start_date : start} className="mt-1 rounded border px-2 py-1" />
          </label>
          <input name="reason" required minLength={1} maxLength={2000} placeholder="Lý do đổi ca" className="w-full rounded border px-2 py-1" />
          <button className="vibe-button" type="submit">Đổi ca dạy</button>
        </form>
      )}
      {futureChange && (
        <form action={cancelPlacement} className="mt-3 space-y-2">
          <input type="hidden" name="placement_id" value={String(detail.id)} />
          <input type="hidden" name="version" value={String(detail.version ?? '')} />
          <input type="hidden" name="enrollment_id" value={String(detail.enrollment_id ?? '')} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input name="reason" required minLength={1} maxLength={2000} placeholder="Lý do hủy vào ca" className="w-full rounded border px-2 py-1" />
          <button className="vibe-button" type="submit">Hủy vào ca dạy</button>
        </form>
      )}
      {!canAssign && !futureChange && <p className="mt-3 text-sm">Hồ sơ này không còn mở để xếp ca tại đây.</p>}
      {!!unresolved.length && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Chưa xếp được</h3>
          {unresolved.map(row => {
            const action = suggestionLink(row.suggestion_code, row.class_id, { branch: String(detail.branch_id ?? ''), program: programId, level: levelId })
            return (
              <p key={row.class_id} className="text-sm">
                <strong>{row.class_code} · {row.class_name}</strong> — {reasonLabel(row.reason_code)}
                {action && <> · <Link href={action.href}>{action.label}</Link></>}
              </p>
            )
          })}
        </div>
      )}
      {!eligible.length && (
        <div className="vibe-actions mt-4">
          <a className="vibe-button" href="#availability">Điều chỉnh khung giờ</a>
          {create && <Link className="vibe-button vibe-button-primary" href={create.href}>{create.label}</Link>}
          {empty?.total_unknown ? <p className="text-sm">Một số ca chưa đủ dữ liệu để kết luận. Hãy hoàn tất cấu hình rồi tải lại.</p> : null}
        </div>
      )}
    </aside>
  )
}

function Candidate({ row, selected }: { row: CandidateRow; selected: boolean }) {
  return (
    <label className={styles.choice} data-selected={selected}>
      <span className="flex items-center gap-2 font-semibold text-[var(--vibe-navy)]">
        <input type="radio" name="class_id" value={row.class_id || ''} required defaultChecked={selected} />
        {row.class_code} · {row.class_name}
      </span>
      <span className="mt-1 block text-sm">{row.schedule_label || 'Chưa có lịch tuần'}</span>
      <span className="block text-sm text-[var(--vibe-muted)]">Giáo viên: {row.teacher_name || 'Chưa có'} · Phòng: {row.room_name || 'Chưa có'} · Còn {row.open_seats ?? '—'}/{row.capacity ?? '—'} chỗ · Phạm vi: {row.level_label || 'Chưa cấu hình'}</span>
      <span className="block text-sm">{fitLabel(row.preference_fit)} · Buổi đầu: {formatSession(row.first_session_at)}</span>
    </label>
  )
}

async function Shifts({ params }: { params: Params }) {
  const db = await requestClient()
  const { data: isAdmin } = await requestOperationalAdmin()
  const loaded = await loadClassOps(db, { ...params, view: 'classes' }, 'classes')
  return (
    <>
      <InlineNotice tone="info">Ca nháp hoặc còn thiếu giáo viên, lịch hay phòng thì chưa nhận học viên. Phạm vi trình độ có thể để trống.</InlineNotice>
      <ClassOpsWorkspace params={{ ...params, view: 'shifts' }} data={loaded} view="classes" embedded switchless canManage={isAdmin === true} />
    </>
  )
}

async function Week({ params }: { params: Params }) {
  const db = await requestClient()
  const week = await loadWeek(db, params)
  if (week.error) {
    return <InlineNotice tone="error">{week.error} {week.reference ? `Mã đối chiếu ${week.reference}.` : ''} <Link href={href(params, { view: 'week', date: week.date })}>Tải lại</Link></InlineNotice>
  }
  const recur = params.recur
  return (
    <div className="space-y-4">
      <OperationsFilterBar
        action="/admin/students"
        hidden={{ tab: 'coordination', view: 'week' }}
        resetHref="/admin/students?tab=coordination&view=week"
        fields={[
          { name: 'branch', label: 'Chi nhánh', type: 'select', value: week.branch, options: week.branches },
          { name: 'date', label: 'Tuần của ngày', type: 'date', value: week.date },
        ]}
      />
      <p className="text-sm text-[var(--vibe-muted)]">Tuần {week.bounds.monday} đến {shiftLabel(week.bounds.next)}. Đổi riêng một buổi không sửa lịch lặp. Đổi lịch định kỳ chỉ có hiệu lực từ ngày đã chọn và không sửa buổi đã điểm danh.</p>
      <div className="vibe-actions">
        <Link className="vibe-button" href={href(params, { view: 'week', date: previousWeek(week.bounds.monday) })}>Tuần trước</Link>
        <Link className="vibe-button" href={href(params, { view: 'week', date: week.bounds.next })}>Tuần sau</Link>
      </div>
      {!week.sessions?.length ? <EmptyState>Tuần này chưa có buổi học trong phạm vi lọc.</EmptyState> : (
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead><tr>{['Ngày', 'Giờ', 'Ca dạy', 'Phòng', 'Trạng thái', ''].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {week.sessions.map(row => {
                const schedule = rel(row.schedules as unknown as { id: string; class_id: string; classes: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] } | { id: string; class_id: string; classes: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] }[] | null)
                const klass = rel(schedule?.classes ?? null)
                const historical = row.status !== 'SCHEDULED'
                return (
                  <tr key={row.id}>
                    <td>{row.occurrence_date}</td>
                    <td>{formatSession(row.starts_at)}</td>
                    <td>{klass?.name || '—'}<small className="block">{klass?.code}</small></td>
                    <td>{row.rescheduled_at ? 'Đã đổi riêng buổi này' : 'Theo lịch định kỳ'}</td>
                    <td><StatusBadge tone={historical ? 'neutral' : 'info'}>{row.status === 'SCHEDULED' ? 'Chưa diễn ra' : row.status === 'COMPLETED' ? 'Đã ghi nhận' : row.status === 'CANCELLED' ? 'Đã hủy' : row.status}</StatusBadge></td>
                    <td className="space-y-1">
                      {row.status === 'SCHEDULED' && <p><Link href={`/admin/attendance/${row.id}`}>Đổi riêng buổi này</Link></p>}
                      {schedule && <p><Link href={href(params, { view: 'week', date: week.date, recur: schedule.id })}>Đổi lịch định kỳ từ ngày…</Link></p>}
                      {historical && <p className="text-xs text-[var(--vibe-muted)]">Buổi đã ghi nhận được giữ nguyên.</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {recur && (
        <form action={changeRecurringSchedule} className="vibe-card space-y-3">
          <h2 className="text-lg font-semibold">Đổi lịch định kỳ từ ngày…</h2>
          <p className="text-sm text-[var(--vibe-muted)]">Lịch lặp cũ khép lại trước ngày này. Buổi đã điểm danh không bị viết lại.</p>
          <input type="hidden" name="schedule_id" value={recur} />
          <input type="hidden" name="return_to" value={href(params, { view: 'week', date: week.date })} />
          <label className="vibe-field"><span>Từ ngày</span><input name="effective_from" type="date" required defaultValue={week.date} /></label>
          <label className="vibe-field"><span>Thứ</span>
            <select name="day_of_week" required defaultValue="1">
              {dayOptions.map(([day, label]) => <option key={day} value={day}>{label}</option>)}
            </select>
          </label>
          <label className="vibe-field"><span>Giờ bắt đầu</span><input name="start_time" type="time" required /></label>
          <label className="vibe-field"><span>Giờ kết thúc</span><input name="end_time" type="time" required /></label>
          <label className="vibe-field"><span>Phòng</span>
            <select name="room_id" required defaultValue="">
              <option value="">Chọn phòng</option>
              {week.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          <button className="vibe-button vibe-button-primary" type="submit">Lưu lịch định kỳ</button>
        </form>
      )}
    </div>
  )
}

async function Today({ params, canOperate }: { params: Params; canOperate: boolean }) {
  const db = await requestClient()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : businessDate()
  const branch = /^[0-9a-f-]{36}$/i.test(params.branch ?? '') ? params.branch! : null
  const { data, error } = await db.rpc('attendance_session_search', {
    p_date: date,
    p_branch: branch,
    p_class: null,
    p_teacher: null,
    p_student: null,
    p_status: null,
    p_offset: 0,
  })
  if (error) {
    return <InlineNotice tone="error">Không tải được buổi học hôm nay. Hãy thử lại.</InlineNotice>
  }
  const result = data as {
    rows: { session_id: string; class_id: string; class_name: string; class_code: string; starts_at: string; ends_at: string; teacher_name: string | null; assignment_type: string; room_name: string | null; branch_name: string; total: number; marked: number; absent: number; attendance_state: string }[]
    total: number
    branches: { id: string; name: string }[]
  } | null
  const rows = result?.rows ?? []
  const sessionIds = rows.map(row => row.session_id)
  const classIds = [...new Set(rows.map(row => row.class_id))]
  const [classes, classEnrollments, participants, occurrences] = await Promise.all([
    classIds.length ? db.from('classes').select('id, capacity').in('id', classIds) : Promise.resolve({ data: [] as { id: string; capacity: number }[] }),
    classIds.length ? db.from('enrollments').select('id, class_id, students(full_name)').in('class_id', classIds).in('status', ['ACTIVE', 'PAUSED']) : Promise.resolve({ data: [] as { id: string; class_id: string; students: { full_name: string } | { full_name: string }[] | null }[] }),
    sessionIds.length ? db.from('session_occurrence_participants').select('session_occurrence_id, enrollment_id, booking_status').in('session_occurrence_id', sessionIds).in('booking_status', ['ACTIVE', 'RELEASED']) : Promise.resolve({ data: [] as { session_occurrence_id: string; enrollment_id: string; booking_status: string }[] }),
    sessionIds.length ? db.from('session_occurrences').select('id, occurrence_type').in('id', sessionIds) : Promise.resolve({ data: [] as { id: string; occurrence_type: string }[] }),
  ])
  const guestIds = [...new Set((participants.data ?? []).map(row => row.enrollment_id))].filter(id => !(classEnrollments.data ?? []).some(item => item.id === id))
  const guests = guestIds.length
    ? await db.from('enrollments').select('id, class_id, students(full_name)').in('id', guestIds)
    : { data: [] as { id: string; class_id: string; students: { full_name: string } | { full_name: string }[] | null }[] }
  const enrollments = { data: [...(classEnrollments.data ?? []), ...(guests.data ?? [])] }
  const capacity = new Map((classes.data ?? []).map(row => [row.id, row.capacity]))
  const typeBySession = new Map((occurrences.data ?? []).map(row => [row.id, row.occurrence_type]))
  const guestSessions = new Set((participants.data ?? []).map(row => `${row.session_occurrence_id}:${row.enrollment_id}`))
  return (
    <div className="space-y-4">
      <OperationsFilterBar
        action="/admin/students"
        hidden={{ tab: 'coordination', view: 'today' }}
        resetHref="/admin/students?tab=coordination&view=today"
        fields={[
          { name: 'branch', label: 'Chi nhánh', type: 'select', value: branch || '', options: result?.branches ?? [] },
          { name: 'date', label: 'Ngày', type: 'date', value: date },
        ]}
      />
      <p className="text-sm text-[var(--vibe-muted)]">Cùng nguồn với Lịch tuần và Điểm danh: giáo viên thực dạy, sĩ số buổi và danh sách học viên của buổi đó.</p>
      {!rows.length ? (
        <EmptyState>
          Ngày này chưa có buổi học.
          {canOperate && (
            <form action={generateSessions} className="vibe-filter mt-4">
              <input type="hidden" name="return_to" value={`/admin/students?tab=coordination&view=today&date=${date}${branch ? `&branch=${branch}` : ''}`} />
              <label>Từ ngày<input className="ml-2 rounded border px-2 py-1" type="date" name="from_date" defaultValue={date} required /></label>
              <label>Đến ngày<input className="ml-2 rounded border px-2 py-1" type="date" name="to_date" defaultValue={date} required /></label>
              <button className="vibe-button vibe-button-primary" type="submit">Đồng bộ buổi học</button>
            </form>
          )}
        </EmptyState>
      ) : (
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead><tr>{['Giờ', 'Phòng', 'Giáo viên thực dạy', 'Ca dạy', 'Học viên', 'Sức chứa', 'Điểm danh', ''].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.map(row => {
                const names = (enrollments.data ?? []).flatMap(item => {
                  const guest = guestSessions.has(`${row.session_id}:${item.id}`)
                  if (typeBySession.get(row.session_id) === 'MAKEUP' && !guest) return []
                  if (item.class_id !== row.class_id && !guest) return []
                  const student = Array.isArray(item.students) ? item.students[0] : item.students
                  const kind = guest && item.class_id !== row.class_id ? 'Chuyển đến' : typeBySession.get(row.session_id) === 'MAKEUP' ? 'Học bù' : 'Thường xuyên'
                  return [`${student?.full_name || 'Học viên'} (${kind})`]
                })
                return (
                  <tr key={row.session_id}>
                    <td>{formatSession(row.starts_at)}</td>
                    <td>{row.room_name || '—'}</td>
                    <td>{row.teacher_name || 'Chưa phân công'}{row.assignment_type === 'SUBSTITUTE' ? ' · Dạy thay' : ''}</td>
                    <td>{row.class_name}<small className="block">{row.class_code}</small></td>
                    <td>{names.length ? names.join(', ') : `${row.total} học viên`}</td>
                    <td>{row.total}/{capacity.get(row.class_id) ?? '—'}</td>
                    <td><StatusBadge tone={row.attendance_state === 'COMPLETE' ? 'success' : 'info'}>{row.marked}/{row.total} đã điểm danh{row.absent ? ` · ${row.absent} vắng` : ''}</StatusBadge></td>
                    <td>{canOperate ? <Link href={`/admin/attendance/${row.session_id}?return_to=${encodeURIComponent(href(params, { view: 'today', date }))}`}>Mở điểm danh</Link> : 'Chỉ xem'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function previousWeek(monday: string) {
  const [year, month, day] = monday.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - 7))
  return date.toISOString().slice(0, 10)
}

function shiftLabel(next: string) {
  const [year, month, day] = next.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - 1))
  return date.toISOString().slice(0, 10)
}
