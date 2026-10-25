'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { InlineNotice, StatusBadge } from '@/app/admin/_components/vibe'
import { addDays, calendarIssues, calendarTotals, dayNames, localDate, localTime, periodFor, periods, slotCapacity, slotCounts, slotState, type CalendarSlot, type CalendarSnapshot } from './calendar-model'
import styles from './weekly-board.module.css'

const attendanceLabels: Record<string, string> = { PRESENT: 'Có mặt', LATE: 'Đi muộn', ABSENT: 'Vắng', EXCUSED: 'Vắng có phép' }
const dateLabel = (date: string) => date.split('-').reverse().join('/')
const shortDate = (date: string) => dateLabel(date).slice(0, 5)
const noRows: CalendarSlot[] = []

export default function WeeklyBoard({ snapshot, error, reference, date, branch, view }: {
  snapshot: CalendarSnapshot | null; error: string | null; reference: string | null; date: string; branch: string; view: string
}) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [program, setProgram] = useState('')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [attention, setAttention] = useState(false)
  const [mode, setMode] = useState<'week' | 'day'>('week')
  const [dayIndex, setDayIndex] = useState(() => {
    if (!snapshot) return 0
    const today = localDate(snapshot.snapshot_at)
    return Math.max(0, Array.from({ length: 7 }, (_, i) => addDays(snapshot.monday, i)).indexOf(today))
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const rows = snapshot?.rows ?? noRows
  // Conflicts include rows hidden by local filters. No network request when opening a roster.
  const issues = useMemo(() => calendarIssues(rows, snapshot?.snapshot_at ?? ''), [rows, snapshot?.snapshot_at])
  const programs = [...new Set(rows.map(row => row.program_name))].sort((a, b) => a.localeCompare(b, 'vi'))
  const teachers = new Map(rows.filter(row => row.teacher_id).map(row => [row.teacher_id!, row.teacher_name || 'Chưa có tên']))
  const rooms = new Map(rows.filter(row => row.room_id).map(row => [row.room_id!, `${row.room_name || 'Chưa có tên'}${branch ? '' : ` · ${row.branch_name}`}`]))
  const eligible = rows.filter(row => (!program || row.program_name === program) && (!teacher || row.teacher_id === teacher) && (!room || row.room_id === room))
  const attentionCount = eligible.filter(row => (issues.get(row.id)?.length ?? 0) > 0).length
  const filtered = attention ? eligible.filter(row => (issues.get(row.id)?.length ?? 0) > 0) : eligible
  const cells = new Map<string, CalendarSlot[]>()
  for (const row of filtered) {
    const key = `${localDate(row.starts_at)}:${periodFor(row.starts_at)}`
    cells.set(key, [...(cells.get(key) ?? []), row])
  }
  const selected = filtered.find(row => row.id === selectedId)
  useEffect(() => {
    const element = dialog.current
    if (selected && element && !element.open) element.showModal()
    if (!selected && element?.open) element.close()
  }, [selected])
  const totals = calendarTotals(filtered)
  const filterCount = Number(!!program) + Number(!!teacher) + Number(!!room) + Number(attention)
  const weekHref = (nextDate: string) => `/admin/students?${new URLSearchParams({ tab: 'coordination', view, date: nextDate, ...(branch ? { branch } : {}) })}`
  const activeDay = snapshot ? addDays(snapshot.monday, dayIndex) : date
  const showDay = (index: number) => { setDayIndex(index); setMode('day') }
  const resetFilters = () => { setProgram(''); setTeacher(''); setRoom(''); setAttention(false) }
  return <section className={`vibe-card ${styles.board}`} aria-labelledby="weekly-board-title" aria-busy={refreshing} data-view={mode}>
    <div className={styles.heading}>
      <div><h2 id="weekly-board-title">Lịch dạy trong tuần</h2>{snapshot && <p>Dữ liệu {localTime(snapshot.snapshot_at)} · {dateLabel(localDate(snapshot.snapshot_at))} · Giờ Việt Nam</p>}</div>
      <button type="button" className="vibe-button" disabled={refreshing} onClick={() => startTransition(() => router.refresh())}>{refreshing ? 'Đang tải…' : 'Làm mới'}</button>
    </div>
    {error || !snapshot ? <InlineNotice tone="error">{error || 'Chưa tải được lịch.'} {reference ? `Mã đối chiếu: ${reference}. ` : ''}<Link prefetch={false} href="/admin/students?tab=coordination">Về tuần hiện tại</Link></InlineNotice> : <>
      <form action="/admin/students" method="get" className={styles.controls} key={`${date}:${branch}`}>
        <input type="hidden" name="tab" value="coordination" /><input type="hidden" name="view" value={view} />
        <label className={`vibe-field ${styles.branch}`}><span>Chi nhánh</span><select name="branch" aria-label="Chi nhánh" defaultValue={branch}>
          <option value="">Tất cả chi nhánh được phép xem</option>
          {branch && !snapshot.branches.some(item => item.id === branch) && <option value={branch}>Chi nhánh không có dữ liệu được phép xem</option>}
          {snapshot.branches.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>
        <label className="vibe-field"><span>Tuần của ngày</span><input name="date" aria-label="Tuần của ngày" type="date" required min="2000-01-01" max="2100-12-31" defaultValue={date} /></label>
        <button className="vibe-button vibe-button-primary" type="submit">Xem</button>
        <nav className={styles.weekNav} aria-label="Chọn tuần">
          <Link prefetch={false} className="vibe-button" aria-label="Tuần trước" href={weekHref(addDays(snapshot.monday, -7))}><Chevron previous /></Link>
          <strong>{shortDate(snapshot.monday)} – {shortDate(addDays(snapshot.monday, 6))}</strong>
          <Link prefetch={false} className="vibe-button" aria-label="Tuần sau" href={weekHref(addDays(snapshot.monday, 7))}><Chevron /></Link>
          <Link prefetch={false} className="vibe-button" href={weekHref(localDate(snapshot.snapshot_at))}>Tuần này</Link>
        </nav>
      </form>
      <div className={styles.summaryRow}>
        <dl className={styles.metrics} aria-label="Tổng tuần theo bộ lọc, không gồm buổi hủy">
          {[['Buổi đã tạo', totals.sessions], ['Ca dự kiến', totals.planned], ['Học viên không trùng', totals.students], ['Lượt học', totals.visits]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {(attentionCount > 0 || attention) && <button type="button" className={styles.attentionFilter} aria-pressed={attention} onClick={() => setAttention(value => !value)}>Cần xử lý · {attentionCount}</button>}
        <div className={styles.switcher} role="group" aria-label="Cách xem lịch"><button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Tuần</button><button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Ngày</button></div>
      </div>
      <details className={styles.filters}>
        <summary>Bộ lọc{filterCount ? ` · ${filterCount} đang áp dụng` : ' · Bộ môn, giáo viên, phòng'}</summary>
        <div className={styles.filterFields}>
          <label className="vibe-field"><span>Bộ môn</span><select aria-label="Bộ môn" value={program} onChange={event => setProgram(event.target.value)}><option value="">Tất cả bộ môn</option>{programs.map(name => <option key={name}>{name}</option>)}</select></label>
          <label className="vibe-field"><span>Giáo viên</span><select aria-label="Giáo viên" value={teacher} onChange={event => setTeacher(event.target.value)}><option value="">Tất cả giáo viên</option>{[...teachers].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="vibe-field"><span>Phòng</span><select aria-label="Phòng" value={room} onChange={event => setRoom(event.target.value)}><option value="">Tất cả phòng</option>{[...rooms].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {filterCount > 0 && <button className="vibe-button" type="button" onClick={resetFilters}>Xóa bộ lọc</button>}
        </div>
      </details>
      <p className={styles.legend}>Tổng theo tuần và bộ lọc · Sĩ số theo danh sách, chưa phải số đã đến lớp{totals.cancelled ? ` · ${totals.cancelled} buổi hủy không cộng tổng` : ''}. Chọn ca để xem chi tiết.</p>
      {filtered.some(row => row.status !== 'CANCELLED') && totals.visits === 0 && <InlineNotice tone="warning">Các ca chưa có danh sách học viên trong hệ thống; cần đối chiếu việc xếp lịch.</InlineNotice>}
      <div className={styles.weekView}>
        <table className={styles.grid}>
          <caption className="sr-only">Lịch tuần {dateLabel(snapshot.monday)} đến {dateLabel(addDays(snapshot.monday, 6))}; chia sáng, chiều, tối theo giờ bắt đầu.</caption>
          <thead><tr><th scope="col">Buổi</th>{dayNames.map((name, index) => {
            const day = addDays(snapshot.monday, index)
            return <th scope="col" key={day} data-today={day === localDate(snapshot.snapshot_at)}><button type="button" aria-label={`Xem ${name}, ${dateLabel(day)}`} onClick={() => showDay(index)}>{name}<span>{shortDate(day)}</span></button></th>
          })}</tr></thead>
          <tbody>{periods.map(period => <tr key={period.id}>
            <th scope="row">{period.label}<small>{period.range}</small></th>
            {dayNames.map((_, index) => {
              const day = addDays(snapshot.monday, index)
              const cell = cells.get(`${day}:${period.id}`) ?? []
              return <td key={day}>
                {cell.slice(0, 2).map(row => <SlotButton key={row.id} row={row} issues={issues.get(row.id) ?? []} now={snapshot.snapshot_at} showBranch={!branch} onSelect={() => setSelectedId(row.id)} />)}
                {cell.length > 2 && <button type="button" className={styles.more} onClick={() => showDay(index)}>+{cell.length - 2} ca · Xem tất cả</button>}
                {!cell.length && <span className={styles.empty}>Chưa ghi lịch</span>}
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <div className={styles.dayView}>
        <div className={styles.days} role="group" aria-label="Chọn ngày trong tuần">{dayNames.map((name, index) => <button type="button" key={name} aria-label={`${name}, ${dateLabel(addDays(snapshot.monday, index))}`} aria-pressed={index === dayIndex} onClick={() => setDayIndex(index)}>{index === 6 ? 'CN' : `T${index + 2}`}<small>{shortDate(addDays(snapshot.monday, index))}</small></button>)}</div>
        <h3>{dayNames[dayIndex]} · {dateLabel(activeDay)}</h3>
        <div className={styles.agenda}>{periods.map(period => {
          const cell = cells.get(`${activeDay}:${period.id}`) ?? []
          return <section key={period.id} className={styles.dayPeriod} aria-label={`${period.label}, ${dateLabel(activeDay)}`}><h4>{period.label}<small>{period.range}</small></h4><div>{cell.length ? cell.map(row => <SlotButton key={row.id} row={row} issues={issues.get(row.id) ?? []} now={snapshot.snapshot_at} showBranch={!branch} onSelect={() => setSelectedId(row.id)} />) : <p className={styles.empty}>Chưa ghi lịch</p>}</div></section>
        })}</div>
      </div>
      {!filtered.length && <p role="status" className={styles.legend}>Không có lịch trong tuần và phạm vi lọc này. Điều này không xác nhận phòng hoặc giáo viên đang rảnh ngoài hệ thống.</p>}
      <details className={styles.help}><summary>Cách đọc lịch và sĩ số</summary><p>Sáng trước 12:00, chiều 12:00–17:59, tối từ 18:00; mỗi buổi chỉ xuất hiện một lần theo giờ bắt đầu. Ca dự kiến chưa tạo buổi; số học viên dự kiến chỉ là ghi danh của chính ca đó và chưa gồm học viên học bù từ ca khác. Buổi đã tạo, kể cả buổi học bù, tính mọi học viên đã đặt vào buổi đó. “Lượt học” gồm cả lịch dự kiến. Sức chứa lấy giới hạn nhỏ hơn giữa ca và phòng khi đã biết cả hai. Tổng luôn theo cả tuần và bộ lọc, kể cả khi xem một ngày. Bấm Làm mới để lấy dữ liệu mới nhất.</p></details>
    </>}
    <dialog ref={dialog} className={styles.detail} aria-labelledby="slot-detail-title" onClose={() => setSelectedId(null)} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      {selected && <SlotDetail row={selected} issues={issues.get(selected.id) ?? []} now={snapshot!.snapshot_at} onClose={() => dialog.current?.close()} />}
    </dialog>
  </section>
}

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d={previous ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function SlotButton({ row, issues, now, showBranch, onSelect }: { row: CalendarSlot; issues: string[]; now: string; showBranch: boolean; onSelect: () => void }) {
  const count = slotCounts(row).total
  const capacity = slotCapacity(row)
  const state = row.status === 'PLANNED' ? 'Dự kiến' : row.status === 'CANCELLED' ? 'Đã hủy' : row.status === 'COMPLETED' ? 'Hoàn tất' : Date.parse(row.ends_at) <= Date.parse(now) ? 'Qua giờ · chưa hoàn tất' : Date.parse(row.starts_at) <= Date.parse(now) ? 'Trong giờ học' : 'Đã tạo buổi'
  return <button type="button" className={styles.slot} data-state={row.status === 'CANCELLED' ? 'cancelled' : issues.length ? 'warning' : row.status === 'PLANNED' ? 'planned' : 'actual'} onClick={onSelect} aria-label={`${localTime(row.starts_at)}–${localTime(row.ends_at)}, ${row.program_name}, ${row.room_name || 'chưa gắn phòng'}, ${count} học viên, giới hạn ${capacity ?? 'chưa biết'}, ${state}, ${row.class_code}`}>
    <span className={styles.slotTop}><strong>{localTime(row.starts_at)}–{localTime(row.ends_at)}</strong><b className={styles.count}>{count}/{capacity ?? '—'}</b></span>
    <span className={styles.title}>{row.program_name} · {row.room_name || 'Chưa gắn phòng'}</span>
    <span className={styles.teacher}>GV: {row.teacher_name || 'Chưa xác định'}{row.assignment_type === 'SUBSTITUTE' ? ' · Dạy thay' : ''}</span>
    {showBranch && <span className={styles.branchName}>{row.branch_name}</span>}
    <span className={styles.tags}><span>{state}</span>{row.occurrence_type === 'MAKEUP' && <span>Học bù</span>}{row.original_starts_at && <span>Đổi giờ</span>}{issues.length > 0 && <span className={styles.warning}>{issues.length} cần xử lý</span>}</span>
  </button>
}

function SlotDetail({ row, issues, now, onClose }: { row: CalendarSlot; issues: string[]; now: string; onClose: () => void }) {
  const counts = slotCounts(row)
  const cancelled = row.status === 'CANCELLED'
  const planned = row.status === 'PLANNED'
  return <div className={styles.detailInner}>
    <header className={styles.detailHeader}><div><p>{dateLabel(localDate(row.starts_at))} · {localTime(row.starts_at)}–{localTime(row.ends_at)}</p><h2 id="slot-detail-title">{row.program_name} · {row.room_name || 'Chưa gắn phòng'}</h2></div><button type="button" className="vibe-button" onClick={onClose} aria-label="Đóng chi tiết ca">Đóng</button></header>
    {localDate(row.starts_at) !== localDate(row.ends_at) && <p>Kết thúc ngày {dateLabel(localDate(row.ends_at))}</p>}
    <p>{row.branch_name} · {row.class_code}</p>
    <p>Giáo viên: <strong>{row.teacher_name || 'Chưa xác định'}</strong>{row.assignment_type === 'SUBSTITUTE' ? ' · Dạy thay' : ''}</p>
    <div className="vibe-actions"><StatusBadge tone={cancelled ? 'neutral' : planned ? 'warning' : 'info'}>{slotState(row, now)}</StatusBadge>{row.occurrence_type === 'MAKEUP' && <StatusBadge tone="info">Học bù</StatusBadge>}</div>
    {row.original_starts_at && <p>Đổi từ {localTime(row.original_starts_at)} · {dateLabel(localDate(row.original_starts_at))}</p>}
    {issues.length > 0 && <InlineNotice tone="warning"><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></InlineNotice>}
    <section className={styles.roster}><h3>{counts.total}/{slotCapacity(row) ?? '—'} học viên{planned ? ' dự kiến của ca này' : ' trong danh sách buổi'}</h3><p>Giới hạn ca: {row.class_capacity ?? 'chưa biết'} · Phòng: {row.room_capacity ?? 'chưa biết'}</p>
      {planned && <p>Chưa gồm học viên học bù từ ca khác. Số dự kiến không phải sĩ số đầy đủ của buổi.</p>}
      {row.occurrence_type === 'MAKEUP' && !planned && <p>Danh sách gồm học viên được đặt vào buổi bù, kể cả học viên của ca khác.</p>}
      {!planned && !cancelled && <p>Có mặt {counts.present} · Vắng {counts.absent} · Chưa điểm danh {counts.unmarked}</p>}
      {row.roster.length ? <ul>{row.roster.map(person => <li key={person.enrollment_id}><span>{person.name}</span><small>{cancelled ? 'Buổi đã hủy' : planned ? 'Ghi danh hiệu lực' : person.attendance ? attendanceLabels[person.attendance] : 'Chưa điểm danh'}</small></li>)}</ul> : <p>Chưa có học viên trong danh sách hệ thống.</p>}
    </section>
    <footer className={styles.detailActions}>
      {row.session_id && <Link prefetch={false} className="vibe-button vibe-button-primary" href={`/admin/attendance/${row.session_id}`}>Xem điểm danh</Link>}
      {row.status === 'SCHEDULED' && <Link prefetch={false} className="vibe-button" href={`/admin/attendance/${row.session_id}`}>Đổi riêng buổi này</Link>}
      <Link prefetch={false} className="vibe-button" href={`/admin/students?${new URLSearchParams({ tab: 'coordination', view: 'week', branch: row.branch_id, date: localDate(row.starts_at), recur: row.schedule_id })}`}>Đổi lịch định kỳ</Link>
      <Link prefetch={false} className="vibe-button" href={`/admin/classes/${row.class_id}`}>Hồ sơ ca</Link>
    </footer>
  </div>
}
