'use client'

import { useActionState } from 'react'
import { saveJournal } from './actions'
import { observations, type Journal } from './types'

export default function JournalForm({ attendanceId, journal }: { attendanceId: string; journal?: Journal }) {
  const [state, action, pending] = useActionState(saveJournal, {})
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="attendance_record_id" value={attendanceId} />
      <input type="hidden" name="journal_id" value={journal?.id ?? ''} />
      <input type="hidden" name="updated_at" value={journal?.updated_at ?? ''} />
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
        {([
          ['content', 'Nội dung học *', 4000],
          ['repertoire', 'Bài học / Tác phẩm', 2000],
          ['skills', 'Kỹ năng đã luyện', 2000],
          ['homework', 'Bài tập về nhà', 4000],
          ['notes', 'Ghi chú / Nhận xét', 4000],
        ] as const).map(([name, label, max]) => (
          <label key={name} className="block text-sm font-medium">
            {label}
            <textarea name={name} defaultValue={journal?.[name] ?? ''} required={name === 'content'} maxLength={max} rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3 font-normal" />
            <span className="text-xs font-normal text-gray-500">Tối đa {max} ký tự</span>
          </label>
        ))}
        <label className="block text-sm font-medium">Nhận xét nhanh
          <select name="observation" defaultValue={journal?.observation ?? 'NOT_RECORDED'} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-3">
            {Object.entries(observations).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="text-xs font-normal text-gray-500">Chỉ ghi nhận buổi học, không thay đổi kết quả môn học.</span>
        </label>
      </fieldset>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
      <button disabled={pending} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? 'Đang lưu…' : journal ? 'Cập nhật nhật ký' : 'Lưu nhật ký'}
      </button>
    </form>
  )
}
