'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { InlineNotice, StatusBadge } from '@/app/admin/_components/vibe'
import { addDays, calendarIssues, calendarTotals, dayNames, localDate, localTime, periodFor, periods, slotCapacity, slotCounts, slotState, type CalendarSlot, type CalendarSnapshot } from './calendar-model'
import styles from './weekly-board.module.css'

const attendanceLabels: Record<string, string> = { PRESENT: 'Có mặt', LATE: 'Đi muộn', ABSENT: 'Vắng', EXCUSED: 'Vắng có phép' }
const dateLabel = (date: string) => date.split('-').reverse().join('/')

export default function WeeklyBoard({ snapshot, error, reference, date, branch, view }: {
  snapshot: CalendarSnapshot | null; error: string | null; reference: string | null; date: string; branch: string; view: string
}) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [program, setProgram] = useState('')
  const [teacher, setTeacher] = useState('')
  const [attention, setAttention] = useState(false)
  const refresh = () => startTransition(() => router.refresh())
  const weekHref = (nextDate: string) => `/admin/students?${new URLSearchParams({ tab: 'coordination', view, date: nextDate, ...(branch ? { branch } : {}) })}`
  const rows = snapshot?.rows ?? []
  // Compute conflicts before local teacher/program filters: a hidden ca can still occupy the room.
  const issues = calendarIssues(rows, snapshot?.snapshot_at ?? '')
  const programs = [...new Set(rows.map(row => row.program_name))].sort((a, b) => a.localeCompare(b, 'vi'))
  const teachers = new Map(rows.filter(row => row.teacher_id).map(row => [row.teacher_id!, row.teacher_name || 'Chưa có tên']))
  const filtered = rows.filter(row => (!program || row.program_name === program) && (!teacher || row.teacher_id === teacher) && (!attention || (issues.get(row.id)?.length ?? 0) > 0))
  const totals = calendarTotals(filtered)
  return (
    <section className={`vibe-card ${styles.board}`} aria-labelledby="weekly-board-title" aria-busy={refreshing}>
      <div className={styles.heading}>
        <div><p className="vibe-eyebrow">ĐIỀU HÀNH ĐÀO TẠO</p><h2 id="weekly-board-title">Lịch dạy trong tuần</h2>
          <p>Chi nhánh · Phòng · Giáo viên · Học viên</p></div>
        <button type="button" className="vibe-button" disabled={refreshing} onClick={refresh}>{refreshing ? 'Đang cập nhật…' : 'Làm mới dữ liệu'}</button>
      </div>
      {error || !snapshot ? (
        <InlineNotice tone="error"><span>{error || 'Chưa tải được lịch.'} {reference ? `Mã đối chiếu: ${reference}.` : ''}</span>{' '}
          <Link prefetch={false} href="/admin/students?tab=coordination">Về tuần hiện tại</Link></InlineNotice>
      ) : <>
        <form action="/admin/students" method="get" className="vibe-filter" key={`${date}:${branch}`}>
          <input type="hidden" name="tab" value="coordination" /><input type="hidden" name="view" value={view} />
          <label className="vibe-field"><span>Chi nhánh</span><select name="branch" aria-label="Chi nhánh" defaultValue={branch}>
            <option value="">Tất cả chi nhánh được phép xem</option>
            {branch && !snapshot.branches.some(item => item.id === branch) && <option value={branch}>Chi nhánh không có dữ liệu được phép xem</option>}
            {snapshot.branches.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select></label>
          <label className="vibe-field"><span>Tuần của ngày</span><input name="date" aria-label="Tuần của ngày" type="date" required min="2000-01-01" max="2100-12-31" defaultValue={date} /></label>
          <button className="vibe-button vibe-button-primary" type="submit">Xem lịch</button>
        </form>
        <div className={styles.toolbar}>
          <nav className="vibe-actions" aria-label="Chọn tuần">
            <Link prefetch={false} className="vibe-button" href={weekHref(addDays(snapshot.monday, -7))}>Tuần trước</Link>
            <strong>{dateLabel(snapshot.monday)} – {dateLabel(addDays(snapshot.monday, 6))}</strong>
            <Link prefetch={false} className="vibe-button" href={weekHref(addDays(snapshot.monday, 7))}>Tuần sau</Link>
            <Link prefetch={false} className="vibe-button" href={weekHref(localDate(snapshot.snapshot_at))}>Tuần hiện tại</Link>
          </nav>
          <div className={styles.filters}>
            <label className="vibe-field"><span>Bộ môn</span><select aria-label="Bộ môn" value={program} onChange={event => setProgram(event.target.value)}><option value="">Tất cả bộ môn</option>{programs.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="vibe-field"><span>Giáo viên</span><select aria-label="Giáo viên" value={teacher} onChange={event => setTeacher(event.target.value)}><option value="">Tất cả giáo viên</option>{[...teachers].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label className={styles.checkbox}><input type="checkbox" checked={attention} onChange={event => setAttention(event.target.checked)} /> Chỉ ca cần xử lý</label>
          </div>
        </div>
        <dl className={styles.metrics}>
          {[
            ['Buổi đã tạo', totals.sessions, 'Không gồm buổi hủy'],
            ['Dự kiến chưa tạo buổi', totals.planned, 'Theo lịch định kỳ hiệu lực'],
            ['Học viên không trùng', totals.students, 'Trong các ô đang hiển thị'],
            ['Lượt học theo danh sách', totals.visits, 'Gồm cả lịch dự kiến'],
          ].map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{note}</small></div>)}
        </dl>
        <p className={styles.snapshot}>Dữ liệu lúc {localTime(snapshot.snapshot_at)} ngày {dateLabel(localDate(snapshot.snapshot_at))} (giờ Việt Nam). {totals.cancelled} buổi hủy được hiển thị riêng, không cộng vào sĩ số. Làm mới để xem thay đổi mới nhất.</p>
        {totals.planned > 0 && <InlineNotice tone="info">Có {totals.planned} lịch dự kiến chưa tạo buổi. Sĩ số dự kiến tính theo ghi danh có hiệu lực tại ngày học; chưa phải số học viên đã đến lớp.</InlineNotice>}
        {filtered.length > 0 && totals.visits === 0 && <InlineNotice tone="warning">Các ca đang hiển thị chưa có học viên trong danh sách hệ thống. Cần đối chiếu việc nhập và xếp lịch; số 0 này không xác nhận lớp thực tế đang trống.</InlineNotice>}
        <p className={styles.legend}>Chọn số học viên để xem danh sách. Sáng/chiều/tối phân theo giờ bắt đầu; mỗi buổi chỉ xuất hiện một lần. Vuốt ngang để xem đủ 7 ngày trên màn hình nhỏ.</p>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Lịch tuần từ thứ Hai đến Chủ nhật">
          <table className={styles.grid}>
            <caption className="sr-only">Lịch dạy theo ngày và buổi, từ {dateLabel(snapshot.monday)} đến {dateLabel(addDays(snapshot.monday, 6))}</caption>
            <thead><tr><th scope="col">Buổi</th>{dayNames.map((name, index) => {
              const day = addDays(snapshot.monday, index)
              return <th scope="col" key={day} data-today={day === localDate(snapshot.snapshot_at)}>{name}<span>{dateLabel(day)}</span></th>
            })}</tr></thead>
            <tbody>{periods.map(period => <tr key={period.id}>
              <th scope="row">{period.label}<small>{period.range}</small></th>
              {dayNames.map((_, index) => {
                const day = addDays(snapshot.monday, index)
                const cell = filtered.filter(row => localDate(row.starts_at) === day && periodFor(row.starts_at) === period.id)
                return <td key={day}>{cell.length ? cell.map(row => <SlotCard key={row.id} row={row} issues={issues.get(row.id) ?? []} now={snapshot.snapshot_at} />) : <span className={styles.empty}>Chưa ghi lịch</span>}</td>
              })}
            </tr>)}</tbody>
          </table>
        </div>
        {!filtered.length && <p role="status">Không có lịch trong tuần và phạm vi lọc đang chọn. Điều này không xác nhận phòng hoặc giáo viên đang rảnh ngoài hệ thống.</p>}
      </>}
    </section>
  )
}

function SlotCard({ row, issues, now }: { row: CalendarSlot; issues: string[]; now: string }) {
  const counts = slotCounts(row)
  const capacity = slotCapacity(row)
  const cancelled = row.status === 'CANCELLED'
  const planned = row.status === 'PLANNED'
  return <article className={styles.slot} data-state={cancelled ? 'cancelled' : issues.length ? 'warning' : planned ? 'planned' : 'actual'}>
    <div className={styles.time}>{localTime(row.starts_at)}–{localTime(row.ends_at)}{localDate(row.starts_at) !== localDate(row.ends_at) && <small> đến {dateLabel(localDate(row.ends_at))}</small>}</div>
    <Link prefetch={false} className={styles.title} href={row.session_id ? `/admin/attendance/${row.session_id}` : `/admin/classes/${row.class_id}`}>{row.program_name}</Link>
    <p className={styles.classCode}>{row.class_code}</p>
    <p><strong>{row.branch_name}</strong></p>
    <p>{row.room_name || 'Chưa gắn phòng'}</p>
    <p>GV: {row.teacher_name || 'Chưa xác định'}{row.assignment_type === 'SUBSTITUTE' ? ' · Dạy thay' : ''}</p>
    <StatusBadge tone={cancelled ? 'neutral' : planned ? 'warning' : row.status === 'COMPLETED' ? 'success' : 'info'}>{slotState(row, now)}</StatusBadge>
    {row.occurrence_type === 'MAKEUP' && <StatusBadge tone="info">Học bù</StatusBadge>}
    {row.original_starts_at && <p className={styles.change}>Đổi từ {localTime(row.original_starts_at)} · {dateLabel(localDate(row.original_starts_at))}</p>}
    {row.status === 'SCHEDULED' && <Link prefetch={false} className={styles.classCode} href={`/admin/attendance/${row.session_id}`}>Đổi riêng buổi này</Link>}
    <Link prefetch={false} className={styles.classCode} href={`/admin/students?${new URLSearchParams({ tab: 'coordination', view: 'week', branch: row.branch_id, date: localDate(row.starts_at), recur: row.schedule_id })}`}>Đổi lịch định kỳ</Link>
    <details className={styles.roster}>
      <summary>{counts.total}/{capacity ?? '—'} học viên{planned ? ' dự kiến' : ' trong danh sách'}</summary>
      <p>Giới hạn ca: {row.class_capacity ?? 'chưa biết'} · Phòng: {row.room_capacity ?? 'chưa biết'}</p>
      {row.roster.length ? <ul>{row.roster.map(person => <li key={person.enrollment_id}>{person.name}<small>{cancelled ? 'Buổi đã hủy' : planned ? 'Ghi danh hiệu lực' : person.attendance ? attendanceLabels[person.attendance] : 'Chưa điểm danh'}</small></li>)}</ul> : <p>Chưa có học viên trong danh sách.</p>}
    </details>
    {!planned && !cancelled && <p className={styles.attendance}>Có mặt {counts.present} · Vắng {counts.absent}<br />Chưa điểm danh {counts.unmarked}</p>}
    {issues.length > 0 && <ul className={styles.issues}>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </article>
}
