import Link from 'next/link'
import { requestClient } from '@/lib/auth/request'
import { EmptyState, InlineNotice, OperationsFilterBar, PageHeader, StatusBadge } from '../_components/vibe'
import { attendanceFilters, attendanceListHref, attendanceStates } from './launcher-model'
import { attendanceLoadMessage } from './attendance-loader'
import styles from './attendance.module.css'

type Option = { id: string; name: string }
type Row = {
  session_id: string; class_name: string; class_code: string; teacher_name: string | null;
  assignment_type: string; room_name: string | null; branch_name: string; starts_at: string; ends_at: string;
  total: number; marked: number; absent: number; student_names: string | null; student_attendance: string | null; attendance_state: string;
}
type Result = { rows: Row[]; total: number; branches: Option[]; classes: Option[]; teachers: Option[] }
const time = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export default async function AttendanceLauncher({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const filters = attendanceFilters(params)
  const db = await requestClient()
  const { data, error } = await db.rpc('attendance_session_search', { p_date: filters.date, p_branch: filters.branch || null,
      p_class: filters.class || null, p_teacher: filters.teacher || null, p_student: filters.student || null,
      p_status: filters.status || null, p_offset: (filters.page - 1) * 25 })
  const result = data as Result | null
  const returnTo = attendanceListHref(params)
  const rosterHref = (row: Row) => `/admin/attendance/${row.session_id}?return_to=${encodeURIComponent(returnTo)}#attendance-roster`
  const notice = attendanceLoadMessage({ launcher: error })
  return <div className="vibe-page">
    <PageHeader title="Điểm danh" description="Lọc buổi học và mở sổ điểm danh trực tiếp. Giờ hiển thị theo Việt Nam." />
    {params.success && <InlineNotice tone="success">{params.success}</InlineNotice>}
    {params.error && <InlineNotice tone="error">{params.error}</InlineNotice>}
    <OperationsFilterBar action="/admin/students" hidden={{ tab: 'attendance' }} resetHref="/admin/students?tab=attendance" fields={[
      { name: 'date', label: 'Ngày', type: 'date', value: filters.date },
      { name: 'branch', label: 'Chi nhánh', type: 'select', value: filters.branch, options: result?.branches },
      { name: 'class', label: 'Ca dạy', type: 'select', value: filters.class, options: result?.classes },
      { name: 'teacher', label: 'Giáo viên', type: 'select', value: filters.teacher, options: result?.teachers },
      { name: 'student', label: 'Học viên', type: 'search', value: filters.student, placeholder: 'Tên hoặc mã học viên' },
      { name: 'status', label: 'Trạng thái điểm danh', type: 'select', value: filters.status, options: Object.entries(attendanceStates).map(([id, name]) => ({ id, name })) },
    ]} />
    {notice ? <InlineNotice tone="error">{notice}</InlineNotice> : <section className="vibe-card">
      <div className="vibe-actions mb-4"><h2 className="font-semibold">{result?.total ?? 0} buổi học phù hợp</h2>
        {result?.total === 1 && result.rows[0] && <Link prefetch={false} className="vibe-button vibe-button-primary" href={rosterHref(result.rows[0])}>Mở điểm danh</Link>}
      </div>
      {!result?.rows.length ? <EmptyState>Không có buổi học phù hợp. Hãy đổi ngày hoặc điều chỉnh bộ lọc.</EmptyState> : <div className="vibe-table-scroll">
        <table className={`vibe-table ${styles.sessionTable}`}><thead><tr>{['Giờ', 'Ca dạy', 'Học viên / số học viên', 'Giáo viên thực dạy', 'Phòng', 'Chi nhánh', 'Đã điểm danh', 'Chưa điểm danh', 'Vắng', 'Trạng thái', 'Hành động'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{result.rows.map(row => <tr key={row.session_id}>
            <td data-label="Giờ">{time(row.starts_at)}–{time(row.ends_at)}</td>
            <td data-label="Ca dạy"><strong>{row.class_name}</strong><small className="block">{row.class_code}</small></td>
            <td data-label="Học viên">{filters.student || row.total === 1 ? row.student_names : `${row.total} học viên`}{filters.student && <small className="block">{row.student_attendance}</small>}{filters.student && <small className="block">Tổng: {row.total} học viên trong buổi</small>}</td>
            <td data-label="Giáo viên thực dạy">{row.teacher_name || 'Chưa phân công'}{row.assignment_type === 'SUBSTITUTE' && <small className="block">Dạy thay</small>}</td>
            <td data-label="Phòng">{row.room_name || '—'}</td><td data-label="Chi nhánh">{row.branch_name}</td>
            <td data-label="Đã điểm danh">{row.marked}</td><td data-label="Chưa điểm danh">{row.total - row.marked}</td><td data-label="Vắng">{row.absent}</td>
            <td data-label="Trạng thái"><StatusBadge tone={row.attendance_state === 'COMPLETE' ? 'success' : row.attendance_state === 'IN_PROGRESS' ? 'info' : 'neutral'}>{attendanceStates[row.attendance_state]}</StatusBadge>{row.absent > 0 && <StatusBadge tone="warning">Có học viên vắng</StatusBadge>}</td>
            <td data-label="Hành động"><Link prefetch={false} className="vibe-button vibe-button-primary" href={rosterHref(row)}>Mở điểm danh</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav className="vibe-actions mt-4" aria-label="Trang điểm danh">
        {filters.page > 1 && <Link className="vibe-button" href={attendanceListHref({ ...params, page: String(filters.page - 1) })}>Trang trước</Link>}
        {(result?.total ?? 0) > filters.page * 25 && <Link className="vibe-button" href={attendanceListHref({ ...params, page: String(filters.page + 1) })}>Trang sau</Link>}
      </nav>
    </section>}
  </div>
}
