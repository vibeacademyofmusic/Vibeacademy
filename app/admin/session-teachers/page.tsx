import Link from 'next/link'
import { pageNumber, type Params } from '../finance/operations'
import { Pager, timeText } from '../finance/_components/ui'
import {
  AppPage,
  DataTable,
  EmptyState,
  FilterBar,
  FormField,
  InlineNotice,
  MetricCard,
  PageHeader,
  SectionCard,
  SelectField,
  StatusBadge,
} from '../_components/vibe'
import { loadAssignmentCenter } from './data'
import {
  assignmentPageSize,
  assignmentQuery,
  assignmentTabs,
  assignmentTypeLabel,
  durationLabel,
  isCurrentTeaching,
  needsAssignment,
  sessionStatusLabel,
  teacherWorkloads,
  warningLabel,
  type AssignmentSession,
} from './model'

function pageSlice<T>(items: T[], page: number) {
  const start = (page - 1) * assignmentPageSize
  return { rows: items.slice(start, start + assignmentPageSize), more: items.length > start + assignmentPageSize }
}

export default async function TeacherAssignmentCenter({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  let center: Awaited<ReturnType<typeof loadAssignmentCenter>>
  try {
    center = await loadAssignmentCenter(params)
  } catch {
    return (
      <AppPage>
        <PageHeader title="Phân công giáo viên" description="Điều phối giáo viên theo lịch dạy, theo dõi giáo viên thực tế và xử lý các trường hợp cần can thiệp." />
        <div className="vibe-metrics">
          <MetricCard title="Cần phân công" value="—" />
          <MetricCard title="Đang giảng dạy" value="—" />
          <MetricCard title="Dạy thay" value="—" />
          <MetricCard title="Cảnh báo" value="—" />
        </div>
        <InlineNotice tone="error">Không tải được dữ liệu phân công giáo viên.</InlineNotice>
      </AppPage>
    )
  }
  const { filters } = center
  const tab = filters.tab
  const page = pageNumber(filters.page)
  const query = {
    tab: filters.tab,
    branch: filters.branch,
    teacher: filters.teacher,
    from: filters.from,
    to: filters.to,
    status: filters.status,
    page: filters.page,
  }
  const unavailable = !center.ok || center.truncated
  const counts = center.ok && !center.truncated ? center.counts : null

  const name = (id: string | null) => !id ? 'Chưa xác định' : center.ok ? center.teacherNames.get(id)?.name || 'Chưa xác định' : '—'
  const className = (id: string) => center.ok ? center.classes.get(id) || 'Chưa xác định' : '—'
  const branchName = (id: string) => center.ok ? center.branchNames.get(id) || 'Chưa xác định' : '—'
  const sessionRows = (items: AssignmentSession[]) => items.map((session) => [
    timeText(session.starts_at),
    className(session.class_id),
    branchName(session.branch_id),
    name(session.primary_teacher_id),
    name(session.teacher_id),
    assignmentTypeLabel(session.assignment_type),
    <StatusBadge key={session.session_id} tone={session.is_locked || session.status === 'COMPLETED' ? 'neutral' : session.status === 'CANCELLED' ? 'warning' : 'info'}>{sessionStatusLabel(session)}</StatusBadge>,
    <Link key={`${session.session_id}-open`} prefetch={false} href={`/admin/attendance/${session.session_id}`}>Mở buổi</Link>,
  ])

  let body = null
  if (center.ok && !center.truncated) {
    if (tab === 'teachers') {
      const workloads = teacherWorkloads(center.sessions, center.assignments, center.today)
      const slice = pageSlice(workloads, page)
      body = (
        <SectionCard title="Giáo viên">
          <p>Số lớp lấy từ phân công lớp đang hiệu lực. Buổi sắp tới là buổi đã lên lịch từ hôm nay. Dạy thay đếm trong khoảng lọc. Chưa cấu hình định mức tải giảng dạy.</p>
          {slice.rows.length ? (
            <DataTable
              headers={['Giáo viên', 'Mã', 'Lớp chính', 'Lớp trợ giảng', 'Buổi sắp tới', 'Dạy thay', 'Chi nhánh', 'Thời lượng sắp tới']}
              rows={slice.rows.map((item) => {
                const teacher = center.teacherNames.get(item.teacherId)
                return [
                  teacher?.name || 'Chưa xác định',
                  teacher?.code || '—',
                  item.primaryClasses,
                  item.assistantClasses,
                  item.upcoming,
                  item.substitute,
                  item.branches.map((id) => branchName(id)).join(', ') || '—',
                  item.minutes === null ? '—' : durationLabel(item.minutes),
                ]
              })}
            />
          ) : <EmptyState>Chưa có session phù hợp bộ lọc.</EmptyState>}
          <Pager path="/admin/session-teachers" params={query} page={page} more={slice.more} />
        </SectionCard>
      )
    } else if (tab === 'warnings') {
      const slice = pageSlice(center.warnings, page)
      body = (
        <SectionCard title="Cảnh báo">
          <p>Lớp chưa có giáo viên chính và buổi chưa resolve giáo viên là hai việc khác nhau. Trùng lịch dùng toàn bộ lịch giáo viên trong khoảng ngày, kể cả buổi ở chi nhánh đang bị bộ lọc ẩn. Buổi đã hoàn tất không tính chồng giờ.</p>
          {slice.rows.length ? (
            <DataTable
              headers={['Loại', 'Mô tả', 'Giáo viên', 'Lớp', 'Thời gian', 'Thao tác']}
              rows={slice.rows.map((warning) => [
                warningLabel(warning.code),
                warning.text,
                name(warning.teacherId),
                className(warning.classId),
                timeText(warning.startsAt),
                warning.code === 'CLASS_NO_PRIMARY_TEACHER'
                  ? <Link key={warning.code + warning.classId} prefetch={false} href={`/admin/classes/${warning.classId}`}>Phân công giáo viên chính</Link>
                  : <Link key={warning.code + warning.sessionId} prefetch={false} href={`/admin/attendance/${warning.sessionId}`}>Mở buổi</Link>,
              ])}
            />
          ) : <EmptyState>Chưa có session phù hợp bộ lọc.</EmptyState>}
          <Pager path="/admin/session-teachers" params={query} page={page} more={slice.more} />
        </SectionCard>
      )
    } else {
      if (tab === 'needed') {
        const missing = new Set(center.classNeeds.map((item) => item.classId))
        const unresolved = center.sessions.filter((session) => needsAssignment(session, center.today) && !missing.has(session.class_id))
        const slice = pageSlice(center.classNeeds, page)
        const unresolvedSlice = pageSlice(unresolved, page)
        body = (
          <SectionCard title="Cần phân công">
            <p>Đây là phân công giáo viên chính của lớp. Sau khi gán, buổi tương lai tự lấy giáo viên đó. Không tạo phân công riêng cho từng buổi.</p>
            {slice.rows.length ? (
              <DataTable
                headers={['Lớp', 'Chi nhánh', 'Lịch học', 'Giáo viên chính', 'Số buổi tương lai', 'Ngày gần nhất', 'Thao tác']}
                rows={slice.rows.map((item) => [
                  className(item.classId),
                  branchName(item.branchId),
                  timeText(item.nearestStartsAt),
                  'Chưa xác định',
                  item.futureCount,
                  item.nearestDate,
                  <Link key={item.classId} prefetch={false} href={`/admin/classes/${item.classId}`}>Phân công giáo viên chính</Link>,
                ])}
              />
            ) : <EmptyState>Chưa có lớp nào thiếu giáo viên chính trong bộ lọc.</EmptyState>}
            <Pager path="/admin/session-teachers" params={query} page={page} more={slice.more} />
            {unresolved.length ? (
              <>
                <p>Buổi chưa resolve giáo viên dù lớp không nằm trong hàng chờ thiếu giáo viên chính.</p>
                <DataTable headers={['Ngày / giờ', 'Lớp', 'Chi nhánh', 'Giáo viên chính', 'Giáo viên thực tế', 'Loại phân công', 'Trạng thái', 'Thao tác']} rows={sessionRows(unresolvedSlice.rows)} />
              </>
            ) : null}
          </SectionCard>
        )
      } else {
        const history = filters.status === 'COMPLETED'
        const source = history
          ? center.sessions.filter((session) => session.status === 'COMPLETED')
          : center.sessions.filter((session) => isCurrentTeaching(session, center.today))
        const slice = pageSlice(source, page)
        body = (
          <SectionCard title={history ? 'Lịch sử buổi đã hoàn tất' : 'Đang giảng dạy'}>
            <p>{history ? 'Các buổi đã hoàn tất trong bộ lọc. Chỉ số đang giảng dạy không tính lịch sử này.' : 'Buổi đã lên lịch từ hôm nay và đã có giáo viên thực tế. Buổi đã hoàn tất không tính vào chỉ số này.'}</p>
            {slice.rows.length ? <DataTable headers={['Ngày / giờ', 'Lớp', 'Chi nhánh', 'Giáo viên chính', 'Giáo viên thực tế', 'Loại phân công', 'Trạng thái', 'Thao tác']} rows={sessionRows(slice.rows)} /> : <EmptyState>Chưa có session phù hợp bộ lọc.</EmptyState>}
            <Pager path="/admin/session-teachers" params={query} page={page} more={slice.more} />
          </SectionCard>
        )
      }
    }
  }

  return (
    <AppPage>
      <PageHeader title="Phân công giáo viên" description="Điều phối giáo viên theo lịch dạy, theo dõi giáo viên thực tế và xử lý các trường hợp cần can thiệp." />
      <div className="vibe-metrics">
        <MetricCard title="Cần phân công" value={counts ? counts.needed : '—'} />
        <MetricCard title="Đang giảng dạy" value={counts ? counts.active : '—'} />
        <MetricCard title="Dạy thay" value={counts ? counts.substitute : '—'} />
        <MetricCard title="Cảnh báo" value={counts ? counts.warnings : '—'} />
      </div>
      <form method="get" action="/admin/session-teachers">
        <input type="hidden" name="tab" value={tab} />
        <FilterBar>
          <SelectField label="Chi nhánh" name="branch" defaultValue={filters.branch}>
            <option value="">Tất cả</option>
            {center.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </SelectField>
          <SelectField label="Giáo viên" name="teacher" defaultValue={filters.teacher}>
            <option value="">Tất cả</option>
            {center.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.teacher_code}</option>)}
          </SelectField>
          <FormField label="Từ ngày" name="from" type="date" defaultValue={filters.from} />
          <FormField label="Đến ngày" name="to" type="date" defaultValue={filters.to} />
          <SelectField label="Trạng thái buổi" name="status" defaultValue={filters.status}>
            <option value="">Tất cả</option>
            <option value="SCHEDULED">Đã lên lịch</option>
            <option value="COMPLETED">Đã hoàn tất</option>
            <option value="CANCELLED">Đã hủy</option>
          </SelectField>
          <button className="vibe-button vibe-button-primary" type="submit">Lọc</button>
        </FilterBar>
      </form>
      <nav className="vibe-tabs" role="tablist" aria-label="Khu vực phân công">
        {assignmentTabs.map(([id, label]) => (
          <Link key={id} role="tab" aria-selected={tab === id} href={assignmentQuery(query, { tab: id, page: undefined })}>{label}</Link>
        ))}
      </nav>
      {!center.ok ? <InlineNotice tone="error">Không tải được dữ liệu phân công giáo viên.</InlineNotice> : null}
      {center.ok && center.truncated ? <InlineNotice tone="error">Không đọc đủ nguồn dữ liệu.</InlineNotice> : null}
      {body}
      <InlineNotice>Giáo viên chính thuộc phân công lớp. Dạy thay và phân công riêng chỉ là ngoại lệ của một buổi. Buổi hoàn tất được khóa theo ảnh chụp giáo viên thực tế. Trang này không gợi ý giáo viên và không có định mức tải giảng dạy.</InlineNotice>
    </AppPage>
  )
}
