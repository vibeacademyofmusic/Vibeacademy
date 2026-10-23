'use client'

import { useRef, useState } from 'react'
import { savePlacementAvailability } from './actions'
import {
  addSameDayWindow,
  applyTimeToRemaining,
  dayChoices,
  dayPresets,
  selectPresetWindows,
  toggleDayWindow,
  windowProblems,
  type KeyedWindow,
  type TimeWindow,
} from '@/lib/teaching-shifts/independent'
import styles from './panel.module.css'

export function PlacementWindowsForm({
  initial,
  mode,
  note,
  required,
  placementId,
  returnTo,
  canEdit,
}: {
  initial: TimeWindow[]
  mode: string
  note: string
  required: number | null
  placementId: string
  returnTo: string
  canEdit: boolean
}) {
  const [rows, setRows] = useState<KeyedWindow[]>(() => initial.map((window, index) => ({ key: index + 1, ...window })))
  const [choice, setChoice] = useState(mode === 'HARD' ? 'HARD' : 'PREFERENCE')
  const problems = windowProblems(rows)
  const blocked = problems.invalid || problems.overlap || (rows.length > 0 && problems.incomplete) || (choice === 'HARD' && !rows.length)
  return (
    <form id="availability" action={savePlacementAvailability} className="mt-3 space-y-2 rounded-xl border border-[var(--vibe-line)] p-3">
      <input type="hidden" name="placement_id" value={placementId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <p className="text-sm font-semibold text-[var(--vibe-navy)]">Khung giờ từng buổi</p>
      <p className="text-sm text-[var(--vibe-muted)]">Chọn tổ hợp hoặc từng thứ. Mỗi dòng có giờ riêng. Giờ chỉ được sao chép khi bấm nút áp dụng.</p>
      <TimeWindowFields rows={rows} onChange={setRows} disabled={!canEdit} />
      {problems.invalid && <p className="text-sm text-[var(--vibe-red)]" role="alert">Giờ kết thúc phải sau giờ bắt đầu.</p>}
      {problems.overlap && <p className="text-sm text-[var(--vibe-red)]" role="alert">Các khung giờ cùng một ngày đang chồng nhau.</p>}
      <label className="block text-sm">Cách dùng
        <select name="availability_mode" value={choice} onChange={event => setChoice(event.target.value)} className="ml-2 rounded border px-2 py-1">
          <option value="PREFERENCE">Ưu tiên, vẫn xem ca khác</option>
          <option value="HARD">Ràng buộc, ẩn ca ngoài khung</option>
        </select>
      </label>
      <label className="block text-sm">Số buổi/tuần yêu cầu
        <input name="required_weekly_sessions" type="number" min={1} max={7} inputMode="numeric" placeholder="Chỉ nhập khi hồ sơ có quy định" defaultValue={required ?? ''} className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="block text-sm">Ghi chú thêm
        <input name="availability_note" maxLength={500} defaultValue={note} className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      {canEdit && <button className="vibe-button" type="submit" disabled={blocked}>Lưu khung giờ và tìm ca</button>}
    </form>
  )
}

export default function TimeWindowFields({
  rows,
  onChange,
  names = { day: 'window_day', start: 'window_start', end: 'window_end' },
  checkboxName,
  disabled = false,
}: {
  rows: KeyedWindow[]
  onChange: (rows: KeyedWindow[]) => void
  names?: { day: string; start: string; end: string }
  checkboxName?: string
  disabled?: boolean
}) {
  const nextKey = useRef(Math.max(0, ...rows.map(row => row.key)) + 1)
  const selectedDays = new Set(rows.map(row => row.day))

  function commit(result: { rows: KeyedWindow[]; nextKey: number }) {
    nextKey.current = result.nextKey
    onChange(result.rows)
  }

  return (
    <div className={styles.windows}>
      <div className="flex flex-wrap gap-2">
        {dayPresets.map(preset => (
          <button key={preset.id} className="vibe-button" type="button" disabled={disabled} onClick={() => commit(selectPresetWindows(rows, [...preset.days], nextKey.current))}>{preset.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {dayChoices.map(choice => (
          <label key={choice.day} className="text-sm">
            <input
              type="checkbox"
              name={checkboxName}
              value={choice.day}
              checked={selectedDays.has(choice.day)}
              disabled={disabled}
              onChange={() => commit(toggleDayWindow(rows, choice.day, nextKey.current))}
            /> {choice.label}
          </label>
        ))}
      </div>
      {rows.map((row, index) => {
        const label = dayChoices.find(choice => choice.day === row.day)?.label ?? `Thứ ${row.day}`
        return (
          <div key={row.key} className={styles.window}>
            <input type="hidden" name={names.day} value={row.day} />
            <p className="text-sm font-semibold text-[var(--vibe-navy)]">{label}</p>
            <div className={styles.times}>
              <label className="text-sm">Giờ bắt đầu
                <input name={names.start} type="time" required disabled={disabled} value={row.start} onChange={event => onChange(rows.map(item => item.key === row.key ? { ...item, start: event.target.value } : item))} className="mt-1 block rounded border px-2 py-1" />
              </label>
              <label className="text-sm">Giờ kết thúc
                <input name={names.end} type="time" required disabled={disabled} value={row.end} onChange={event => onChange(rows.map(item => item.key === row.key ? { ...item, end: event.target.value } : item))} className="mt-1 block rounded border px-2 py-1" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="vibe-button" type="button" disabled={disabled || rows.length < 2 || !row.start || !row.end || row.end <= row.start} onClick={() => onChange(applyTimeToRemaining(rows, index))}>Áp dụng giờ này cho các buổi còn lại</button>
              <button className="vibe-button" type="button" disabled={disabled} onClick={() => commit(addSameDayWindow(rows, row.day, nextKey.current))}>Thêm khung giờ</button>
              {rows.filter(item => item.day === row.day).length > 1 && (
                <button className="vibe-button" type="button" disabled={disabled} onClick={() => onChange(rows.filter(item => item.key !== row.key))}>Bỏ khung giờ</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
