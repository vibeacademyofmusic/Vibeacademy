'use client'

import { useMemo, useState } from 'react'
import { assignPlacement } from '../students/placement-actions'
import { dayChoices, sessionsFromScheduleLabel, weeklySelectionConflict, weeklySessionCount, type TimeWindow } from '@/lib/teaching-shifts/independent'
import styles from './panel.module.css'
import type { CandidateRow } from './data'

export default function ShiftScheduleForm({
  rows,
  windows = [],
  placedClassIds = [],
  requestId,
  placementId,
  version,
  returnTo,
  start,
  today,
  requiredWeekly,
  alreadyWeekly,
  studentName,
}: {
  rows: CandidateRow[]
  windows?: TimeWindow[]
  placedClassIds?: string[]
  requestId: string
  placementId: string
  version: string
  returnTo: string
  start: string
  today: string
  requiredWeekly: number | null
  alreadyWeekly: number
  studentName: string
}) {
  const [selected, setSelected] = useState<string[]>(() => [...new Set(placedClassIds.filter(id => rows.some(row => row.class_id === id)))])
  const chosen = rows.filter(row => row.class_id && selected.includes(row.class_id))
  const sessions = chosen.flatMap(row => sessionsFromScheduleLabel(row.class_id || '', row.schedule_label))
  const weekly = sessions.length + alreadyWeekly
  const progress = weeklySessionCount(requiredWeekly, weekly)
  const conflict = useMemo(() => weeklySelectionConflict(sessions), [sessions])

  function toggle(classId: string) {
    setSelected(current => current.includes(classId) ? current.filter(id => id !== classId) : [...current, classId])
  }

  return (
    <form action={assignPlacement} className="mt-3 space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="placement_id" value={placementId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="required_weekly_sessions" value={requiredWeekly ?? ''} />
      <p className="text-sm font-semibold text-[var(--vibe-navy)]">Lịch tuần — chọn từng ca độc lập</p>
      {windows.length === 0 && rows.map(row => (
        <Choice key={row.class_id} row={row} selected={selected} start={start} onToggle={toggle} />
      ))}
      {windows.map(window => {
        const label = dayChoices.find(choice => choice.day === window.day)?.label ?? `Thứ ${window.day}`
        const matches = rows.filter(row => sessionMatches(row, window))
        return (
          <section key={`${window.day}-${window.start}-${window.end}`} className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--vibe-navy)]">{label} · {window.start}–{window.end}</h3>
            {matches.length === 0 && <p className="text-sm">Chưa có ca đúng {label} {window.start}–{window.end}.</p>}
            {matches.map(row => <Choice key={row.class_id} row={row} selected={selected} start={start} onToggle={toggle} />)}
          </section>
        )
      })}
      {windows.length > 0 && rows.some(row => !windows.some(window => sessionMatches(row, window))) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--vibe-navy)]">Ca không thuộc các dòng đã chọn</h3>
          {rows.filter(row => !windows.some(window => sessionMatches(row, window))).map(row => (
            <Choice key={row.class_id} row={row} selected={selected} start={start} onToggle={toggle} />
          ))}
        </section>
      )}
      {progress && (
        <p className="text-sm" role="status">
          Đã chọn {progress.selected} buổi/tuần — yêu cầu {progress.required} buổi/tuần
          {progress.missing > 0 ? `. Còn thiếu ${progress.missing} buổi/tuần.` : '.'}
        </p>
      )}
      {!progress && <p className="text-sm text-[var(--vibe-muted)]">Hồ sơ chưa quy định số buổi/tuần. Chỉ xếp các ca đã chọn.</p>}
      {conflict && <p className="text-sm text-[var(--vibe-red)]" role="alert">Các ca đã chọn có thời gian chồng lấn. Bỏ một ca trước khi lưu.</p>}
      <label className="block text-sm">Ngày tham gia
        <input name="start_date" type="date" required min={today} defaultValue={start} className="mt-1 rounded border px-2 py-1" />
      </label>
      {chosen.length > 0 && <p className="text-sm">Xác nhận {studentName} vào {chosen.length} ca, ngày {start}.</p>}
      <button className="vibe-button vibe-button-primary" type="submit" disabled={!chosen.length || conflict}>Lưu lịch học</button>
    </form>
  )
}

function sessionMatches(row: CandidateRow, window: TimeWindow) {
  return sessionsFromScheduleLabel(row.class_id || '', row.schedule_label).some(session =>
    session.day === window.day && session.start.slice(0, 5) === window.start.slice(0, 5) && session.end.slice(0, 5) === window.end.slice(0, 5)
  )
}

function Choice({ row, selected, start, onToggle }: { row: CandidateRow; selected: string[]; start: string; onToggle: (id: string) => void }) {
  const id = row.class_id || ''
  const on = selected.includes(id)
  return (
    <label className={styles.choice} data-selected={on}>
      <span className="flex items-center gap-2 font-semibold text-[var(--vibe-navy)]">
        <input type="checkbox" name="class_id" value={id} checked={on} onChange={() => onToggle(id)} />
        {row.class_code} · {row.class_name}
      </span>
      <span className="mt-1 block text-sm">{row.schedule_label || 'Chưa có lịch tuần'}</span>
      <span className="block text-sm text-[var(--vibe-muted)]">{row.branch_name ? `${row.branch_name} · ` : ''}Giáo viên: {row.teacher_name || 'Chưa có'} · Phòng: {row.room_name || 'Chưa có'} · Còn {row.open_seats ?? '—'}/{row.capacity ?? '—'} chỗ</span>
      <span className="block text-sm">Bắt đầu áp dụng: {start} · Buổi đầu: {row.first_session_at ? new Date(row.first_session_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Chưa có buổi trong 3 tuần'}</span>
    </label>
  )
}
