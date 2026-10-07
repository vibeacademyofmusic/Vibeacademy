import Link from 'next/link'
import {
  AppPage,
  PageHeader,
  EmptyState,
  OpsMetricLink,
  OpsStatusBadge,
  OperationsFilterBar,
  buildQuery,
  InlineNotice,
} from '../../_components/vibe'
import { setClassStatus } from '../actions'
import { generateSessions } from '../../attendance/actions'
import ClassCreateLevelFields from './ClassCreateLevelFields'
import {
  classStatusLabel,
  dayLabels,
  type OpsView,
} from './model'
import type { loadClassOps } from './data'

type Loaded = Awaited<ReturnType<typeof loadClassOps>>

function href(params: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}) {
  const query = buildQuery({
    view: params.view,
    branch: params.branch,
    program: params.program,
    when: params.when,
    date: params.date,
    q: params.q,
    class: params.class,
    page: undefined,
  }, patch)
  return query ? `/admin/classes?${query}` : '/admin/classes'
}

export default function ClassOpsWorkspace({
  params,
  data,
  view,
  embedded = false,
  canManage = false,
}: {
  params: Record<string, string | undefined>
  data: Loaded
  view: OpsView
  embedded?: boolean
  canManage?: boolean
}) {
  return (
    <AppPage>
      {!embedded && <PageHeader
        title={view === 'rooms' ? 'Phòng học' : 'Ca dạy'}
        description={view === 'rooms' ? 'Theo dõi phòng học và sức chứa theo chi nhánh.' : 'Ca dạy gồm học viên, chương trình, giáo viên, chi nhánh, phòng và lịch lặp lại.'}
      />}
      {(params.error || params.success) && (
        <InlineNotice tone={params.error ? 'error' : 'success'}>{params.error || params.success}</InlineNotice>
      )}

      {embedded && (view === 'classes' || view === 'overview') && <form action="/admin/students" className="vibe-actions">
        <input type="hidden" name="tab" value="teaching-shifts" />
        <label>Chế độ ca dạy <select name="view" defaultValue={view} className="rounded-lg border border-[var(--vibe-line)] bg-white px-3 py-2">
          <option value="classes">Danh sách ca dạy</option><option value="overview">Tổng quan ca dạy</option>
        </select></label><button className="vibe-button">Xem</button>
      </form>}

      <OperationsFilterBar
        action={embedded ? '/admin/students' : '/admin/classes'}
        hidden={{
          view: embedded || view === 'overview' ? undefined : view,
          tab: embedded ? (view === 'schedule' ? 'schedule' : view === 'attendance' ? 'attendance' : 'teaching-shifts') : undefined,
        }}
        resetHref={embedded
          ? `/admin/students?tab=${view === 'schedule' ? 'schedule' : view === 'attendance' ? 'attendance' : 'teaching-shifts'}`
          : href({ view: view === 'overview' ? undefined : view })}
        fields={[
          { name: 'branch', label: 'Chi nhánh', type: 'select', value: params.branch, options: data.branches.map(b => ({ id: b.id, name: b.name })) },
          ...(view === 'attendance' || view === 'schedule'
            ? [{ name: 'date', label: 'Ngày', type: 'date' as const, value: params.date || data.today }]
            : []),
          ...(view === 'classes' ? [
            { name: 'program', label: 'Chương trình', type: 'select' as const, value: params.program, options: data.programs.map(program => ({ id: program.id, name: program.name })), allLabel: 'Tất cả chương trình' },
            { name: 'when', label: 'Ngày', type: 'select' as const, value: params.when, options: [{ id: 'today', name: 'Hôm nay' }], allLabel: 'Mọi ngày' },
            { name: 'q', label: 'Tìm ca dạy', type: 'search' as const, value: params.q },
          ] : []),
        ]}
      />

      {view === 'overview' && <Overview data={data} params={params} />}
      {view === 'classes' && <ClassesView data={data} params={params} canManage={canManage} />}
      {view === 'schedule' && <ScheduleView data={data} params={params} canManage={canManage} />}
      {view === 'rooms' && <RoomsView data={data} />}
      {view === 'attendance' && <AttendanceView data={data} params={params} canManage={canManage} />}
    </AppPage>
  )
}

function Overview({ data, params }: { data: Loaded; params: Record<string, string | undefined> }) {
  if (!data.overview) return null
  return (
    <>
      <div className="vibe-metrics">
        <OpsMetricLink href={href(params, { view: 'classes' })} title="Ca dạy đang hoạt động" value={data.overview.activeClasses} />
        <OpsMetricLink href={href(params, { view: 'attendance', date: data.today })} title="Ca dạy hôm nay" value={data.overview.todaySessions} />
        <OpsMetricLink href={href(params, { view: 'attendance', date: data.today })} title="Chưa hoàn tất điểm danh" value={data.overview.incompleteAttendance} />
        <OpsMetricLink href={href(params, { view: 'classes' })} title="Cần xử lý" value={data.overview.needsAttention} />
      </div>
      <section className="vibe-card">
        <h2 className="text-lg font-semibold">Hàng đợi việc</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.overview.outOfScopeClasses.length > 0 && (
            <li>
              <p>{data.overview.outOfScopeStudents} học viên ngoài phạm vi tại {data.overview.outOfScopeClasses.length} ca dạy</p>
              {data.overview.outOfScopeClasses.map(row => (
                <p key={row.id}><Link prefetch={false} href={`/admin/classes/${row.id}`}>{row.name}: {row.count} học viên ngoài phạm vi</Link></p>
              ))}
            </li>
          )}
          {data.overview.unscopedClasses > 0
            ? <li>{data.overview.unscopedClasses} ca dạy cần cấu hình phạm vi trình độ</li>
            : <li>Không có ca dạy thiếu phạm vi trình độ trong phạm vi lọc.</li>}
          {data.overview.incompleteAttendance > 0
            ? <li>{data.overview.incompleteAttendance} ca học hôm nay chưa hoàn tất điểm danh</li>
            : null}
          <li><Link prefetch={false} href={href(params, { view: 'attendance', date: data.today })}>Mở điểm danh hôm nay</Link></li>
          <li><Link prefetch={false} href={href(params, { view: 'schedule' })}>Mở lịch học</Link></li>
        </ul>
      </section>
    </>
  )
}

function ClassesView({ data, params, canManage }: { data: Loaded; params: Record<string, string | undefined>; canManage: boolean }) {
  const list = data.classes
  return (
    <>
      {canManage && <section className="vibe-card space-y-3">
        <h2 className="text-lg font-semibold">Tạo ca dạy</h2>
        <ClassCreateLevelFields
          branches={data.branches}
          programs={data.programs}
          levelsByCurriculum={data.levelsByCurriculum}
          teachers={data.teachers}
          rooms={data.classRooms}
        />
      </section>}

      {params.when === 'today' && <p className="text-sm text-[var(--vibe-muted)]">Đang xem ca có lịch hôm nay. Mở ca dạy để vào buổi học, hoặc mở hồ sơ nếu buổi chưa được tạo.</p>}
      {!list?.data.length ? <EmptyState>Không có ca dạy phù hợp với bộ lọc.</EmptyState> : (
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead><tr>{['Ca dạy', 'Chương trình', 'Phạm vi trình độ', 'Giáo viên', 'Lịch', 'Phòng', 'Học viên', 'Sức chứa', 'Cần xử lý', 'Trạng thái'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {list.data.map(row => (
                <tr key={row.id}>
                  <td>
                    <Link prefetch={false} href={`/admin/classes/${row.id}`}>{row.name}</Link>
                    <p className="text-xs text-[var(--vibe-muted)]">{row.code}</p>
                    {params.when === 'today' && <p><Link prefetch={false} className="vibe-button" href={row.openHref}>{row.openLabel}</Link></p>}
                  </td>
                  <td>{row.courseName}</td>
                  <td>{row.scopeLabel}</td>
                  <td>{row.teacherName}</td>
                  <td>{row.scheduleLabel}</td>
                  <td>{row.roomName}</td>
                  <td>{row.enrolled}</td>
                  <td>{row.capacity}</td>
                  <td>
                    {row.gaps.map(gap => gap.label === 'Kích hoạt ca dạy' ? (
                      <form key={gap.label} action={setClassStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <button className="vibe-button" type="submit">Kích hoạt ca dạy</button>
                      </form>
                    ) : (
                      <p key={gap.label}><Link prefetch={false} href={gap.href}>{gap.label}</Link></p>
                    ))}
                    {row.outOfScopeCount > 0 && <p><Link prefetch={false} href={`/admin/classes/${row.id}`}>{row.outOfScopeCount} học viên ngoài phạm vi</Link></p>}
                    {!row.gaps.length && row.outOfScopeCount === 0 ? '—' : null}
                  </td>
                  <td><OpsStatusBadge status={row.status} labels={classStatusLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="vibe-actions">
        {(list?.page ?? 1) > 1 && <Link className="vibe-button" href={href(params, { view: 'classes', page: String((list?.page ?? 1) - 1) })}>Trang trước</Link>}
        {list?.more && <Link className="vibe-button" href={href(params, { view: 'classes', page: String((list?.page ?? 1) + 1) })}>Trang sau</Link>}
      </div>
    </>
  )
}

function ScheduleView({ data, params, canManage }: { data: Loaded; params: Record<string, string | undefined>; canManage: boolean }) {
  const list = data.schedules
  return (
    <>
      {canManage && <section className="vibe-card space-y-3">
        <h2 className="text-lg font-semibold">Đồng bộ buổi học</h2>
        <p className="text-sm text-[var(--vibe-muted)]">Tạo buổi học từ lịch lặp trong khoảng ngày đã chọn. Những buổi đã có sẽ không bị tạo trùng.</p>
        <form action={generateSessions} className="vibe-filter">
          <input type="hidden" name="return_to" value={href(params, { view: 'schedule', date: params.date || data.today })} />
          <label className="vibe-field"><span>Từ ngày</span><input name="from_date" type="date" required defaultValue={params.date || data.today} /></label>
          <label className="vibe-field"><span>Đến ngày</span><input name="to_date" type="date" required defaultValue={params.date || data.today} /></label>
          <button className="vibe-button vibe-button-primary" type="submit">Đồng bộ buổi học</button>
        </form>
      </section>}
      {!list?.data.length ? (
        <EmptyState>
          {(list?.activeCount ?? 0) === 0
            ? 'Chưa có lịch học hoạt động.'
            : 'Không có lịch phù hợp với bộ lọc.'}
        </EmptyState>
      ) : (
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead><tr>{['Ca dạy', 'Chi nhánh', 'Ngày', 'Giờ', 'Phòng', 'Trạng thái'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {list.data.map(row => {
                const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
                const branches = cls ? (Array.isArray(cls.branches) ? cls.branches[0] : cls.branches) : null
                const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms
                return (
                  <tr key={row.id}>
                    <td><Link href={`/admin/classes/${row.class_id}`}>{cls?.name ?? '—'}</Link></td>
                    <td>{branches?.name ?? '—'}</td>
                    <td>{dayLabels[row.day_of_week] ?? row.day_of_week}</td>
                    <td>{String(row.start_time).slice(0, 5)}–{String(row.end_time).slice(0, 5)}</td>
                    <td>{room?.name ?? '—'}</td>
                    <td>{row.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function RoomsView({ data }: { data: Loaded }) {
  const list = data.rooms
  if (!list?.data.length) return <EmptyState>Chưa có phòng học trong phạm vi lọc.</EmptyState>
  return (
    <div className="vibe-table-scroll">
      <table className="vibe-table">
        <thead><tr>{['Phòng', 'Chi nhánh', 'Sức chứa', 'Trạng thái', 'Ca hiện tại', 'Ca tiếp theo'].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {list.data.map(row => {
            const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
            return (
              <tr key={row.id}>
                <td>{row.name}<p className="text-xs text-[var(--vibe-muted)]">{row.code}</p></td>
                <td>{branch?.name ?? '—'}</td>
                <td>{row.capacity}</td>
                <td>{row.status}</td>
                <td>{row.currentSession}</td>
                <td>{row.nextSession}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AttendanceView({ data, params, canManage }: { data: Loaded; params: Record<string, string | undefined>; canManage: boolean }) {
  const diag = data.sessionDiag
  const list = data.sessions
  if (diag && diag.sessions === 0) {
    return (
      <section className="space-y-4">
        {diag.activeSchedules === 0
          ? <EmptyState>Chưa có lịch học hoạt động cho ngày này.</EmptyState>
          : <EmptyState>Ngày này chưa có ca học được tạo từ lịch.</EmptyState>}
        {canManage && diag.activeSchedules > 0 && (
          <form action={generateSessions} className="vibe-filter">
            <input type="hidden" name="return_to" value={href(params, { view: 'attendance', date: diag.date })} />
            <input type="hidden" name="from_date" value={diag.date} />
            <input type="hidden" name="to_date" value={diag.date} />
            <button className="vibe-button vibe-button-primary" type="submit">Đồng bộ buổi học</button>
          </form>
        )}
      </section>
    )
  }
  if (!list?.data.length) return <EmptyState>Không có buổi học phù hợp với bộ lọc.</EmptyState>
  return (
    <div className="vibe-table-scroll">
      <table className="vibe-table">
        <thead><tr>{['Ca học', 'Ca dạy', 'Giờ', 'Giáo viên', 'Phòng', 'Học viên', 'Đã điểm danh', 'Chưa điểm danh', 'Vắng', 'Trạng thái'].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {list.data.map(row => (
            <tr key={row.id}>
              <td><Link href={`/admin/attendance/${row.id}`}>{new Date(row.startsAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</Link><p className="text-xs text-[var(--vibe-muted)]">{row.occurrenceType === 'MAKEUP' ? 'Học bù' : 'Buổi thường'}</p></td>
              <td><Link href={`/admin/classes/${row.classId}`}>{row.className}</Link></td>
              <td>{new Date(row.startsAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}–{new Date(row.endsAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{row.teacherName}</td>
              <td>{row.roomName}</td>
              <td>{row.enrolled}</td>
              <td>{row.marked}</td>
              <td>{row.unmarked}</td>
              <td>{row.absent}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="vibe-actions mt-3">
        {(list.page > 1) && <Link className="vibe-button" href={href(params, { view: 'attendance', page: String(list.page - 1) })}>Trang trước</Link>}
        {list.more && <Link className="vibe-button" href={href(params, { view: 'attendance', page: String(list.page + 1) })}>Trang sau</Link>}
      </div>
    </div>
  )
}
