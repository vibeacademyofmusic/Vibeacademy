'use client'

import { useFormStatus } from 'react-dom'
import { useState } from 'react'
import { savePause } from './actions'

function Submit({ cancel }: { cancel: boolean }) {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Đang lưu…' : cancel ? 'Hủy bảo lưu' : 'Tạo bảo lưu'}</button>
}

export default function PauseForm({ enrollmentId, pauseId, minDate, maxDate }: { enrollmentId: string; pauseId?: string; minDate?: string; maxDate?: string }) {
  const [startDate, setStartDate] = useState('')
  return <form action={savePause} onSubmit={event => { if (pauseId && !window.confirm('Hủy toàn bộ đợt bảo lưu này? Học viên sẽ trở lại danh sách học thường trong khoảng ngày này.')) event.preventDefault() }} className="mt-3 space-y-3">
    <input type="hidden" name="enrollment_id" value={enrollmentId} />
    <input type="hidden" name="operation" value={pauseId ? 'cancel' : 'create'} />
    {pauseId && <input type="hidden" name="pause_id" value={pauseId} />}
    {!pauseId && <div className="flex flex-wrap gap-4">
      <label className="text-sm">Ngày bắt đầu bảo lưu<input className="mt-1 block rounded border p-2" type="date" name="starts_on" min={minDate} max={maxDate} value={startDate} onChange={event => setStartDate(event.target.value)} required /></label>
      <label className="text-sm">Ngày cuối cùng bảo lưu (bao gồm ngày này)<input className="mt-1 block rounded border p-2" type="date" name="ends_on" min={startDate && (!minDate || startDate > minDate) ? startDate : minDate} max={maxDate} required /></label>
    </div>}
    <label className="block text-sm">{pauseId ? 'Lý do hủy' : 'Lý do bảo lưu'}<textarea name="reason" required maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border p-2" /></label>
    <Submit cancel={!!pauseId} />
  </form>
}
