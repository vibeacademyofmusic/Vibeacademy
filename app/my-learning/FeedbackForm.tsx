'use client'

import { useState } from 'react'
import { reasonsForRating } from '@/app/feedback/reasons'
import { submitFeedback } from './actions'

export default function FeedbackForm({
  student,
  session,
  respondents,
}: {
  student: string
  session: string
  respondents: string[]
}) {
  const [rating, setRating] = useState(0)
  const reasons = reasonsForRating(rating)
  return <form action={submitFeedback} className="mt-3 space-y-4">
    <input type="hidden" name="student" value={student} />
    <input type="hidden" name="session" value={session} />
    {respondents.length === 1
      ? <input type="hidden" name="respondent" value={respondents[0]} />
      : <label className="block text-sm font-medium">Người gửi
        <select className="mt-1 block w-full rounded border p-2" name="respondent">
          {respondents.map(role => <option key={role} value={role}>{role === 'STUDENT' ? 'Học viên' : 'Phụ huynh'}</option>)}
        </select>
      </label>}
    <fieldset>
      <legend className="text-sm font-medium">Đánh giá chung</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map(value => <label key={value} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded border px-3 ${rating === value ? 'border-slate-900 bg-slate-100 font-semibold' : ''}`}>
          <input className="sr-only" type="radio" name="rating" value={value} required checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} sao`} />
          <span>{value} sao</span>
        </label>)}
      </div>
    </fieldset>
    {reasons.length > 0 && <fieldset>
      <legend className="text-sm font-medium">{rating <= 2 ? 'Điều cần cải thiện' : 'Điều bạn hài lòng'}</legend>
      <div className="mt-2 grid gap-2">
        {reasons.map(([code, label]) => <label key={code} className="flex min-h-11 items-center gap-2 rounded border px-3 py-2 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-100">
          <input type="checkbox" name="reason" value={code} />
          <span>{label}</span>
        </label>)}
      </div>
    </fieldset>}
    <label className="block text-sm font-medium">Ý kiến khác (không bắt buộc)
      <textarea name="comment" maxLength={4000} className="mt-1 block w-full rounded border p-3" rows={3} />
    </label>
    <button className="w-full rounded bg-slate-900 px-4 py-3 text-white sm:w-auto">Gửi phản hồi</button>
  </form>
}
