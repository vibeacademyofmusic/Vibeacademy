'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'

import { FormField, InlineNotice, SectionCard, SelectField } from '@/app/admin/_components/vibe'
import { createCrmLead } from './actions'
import { interestLevelLabel, sourceLabel } from './model'

type Option = { id: string; name: string }
type Slot = { weekday: string; start: string; end: string }
const blankSlot = (): Slot => ({ weekday: '1', start: '', end: '' })
const weekdays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' } as const

export function LeadCreateForm({ branches, programs }: { branches: Option[]; programs: Option[] }) {
  const router = useRouter()
  const request = useRef<string | null>(null)
  const inFlight = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const fieldError = (name: string) => error?.field === name ? <p className="text-sm text-red-700" role="alert">{error.message}</p> : null

  function begin() {
    request.current = crypto.randomUUID()
    setSlots([])
    setSavedId(null)
    setError(null)
    setOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const formData = new FormData(event.currentTarget)
    const submittedSlots = slots.map((slot, index) => ({ weekday: Number(slot.weekday), start: String(formData.get(`slot_start_${index}`) || ''), end: String(formData.get(`slot_end_${index}`) || '') }))
    for (let i = 0; i < submittedSlots.length; i++) {
      const slot = submittedSlots[i]
      if (!slot.start || !slot.end || slot.end <= slot.start) {
        setError({ field: 'preferred_slots', message: 'Giờ kết thúc phải sau giờ bắt đầu.' })
        return
      }
      if (submittedSlots.some((other, j) => i !== j && other.weekday === slot.weekday && other.start < slot.end && slot.start < other.end)) {
        setError({ field: 'preferred_slots', message: 'Các khung giờ cùng ngày không được trùng nhau.' })
        return
      }
    }
    if (!request.current) request.current = crypto.randomUUID()
    formData.set('request_id', request.current)
    formData.set('preferred_slots', JSON.stringify(submittedSlots))
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const result = await createCrmLead(formData)
      if (!result.ok) {
        setError({ field: result.field, message: result.error || 'Không lưu được hồ sơ. Thử lại với cùng mã yêu cầu.' })
      } else {
        setSavedId(result.id || null)
        setOpen(false)
        router.refresh()
      }
    } catch {
      setError({ message: 'Chưa nhận được kết quả. Thử lại để kiểm tra hồ sơ đã lưu với cùng mã yêu cầu.' })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return <>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="vibe-button vibe-button-primary" onClick={begin} disabled={pending}>Thêm khách hàng</button>
      {savedId && <InlineNotice>Đã lưu hồ sơ <Link className="underline font-semibold" href={`/admin/business/crm/${savedId}`}>{savedId}</Link>.</InlineNotice>}
    </div>
    {open && <SectionCard title="Thêm khách hàng">
      <form onSubmit={submit} className="space-y-6" noValidate={false}>
        {error && <InlineNotice tone="error">{error.message}</InlineNotice>}
        <fieldset className="vibe-filter" style={fieldGrid}>
          <legend className="font-semibold">A. Người liên hệ và học viên</legend>
          <FormField label="Người liên hệ" name="full_name" maxLength={200} />
          <FormField label="Phụ huynh" name="parent_name" maxLength={200} />
          <FormField label="Học viên dự kiến" name="student_name" required maxLength={200} />
          {fieldError('student_name')}
          <FormField label="Ngày sinh học viên" name="student_date_of_birth" type="date" />
          {fieldError('student_date_of_birth')}
          <FormField label="Số điện thoại" name="phone" maxLength={40} />
          <FormField label="Email" name="email" type="email" maxLength={200} />
        </fieldset>
        <fieldset className="vibe-filter" style={fieldGrid}>
          <legend className="font-semibold">B. Nhu cầu học</legend>
          <SelectField label="Chi nhánh" name="branch_id" required><option value="">Chọn chi nhánh</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
          {fieldError('branch_id')}
          <SelectField label="Bộ môn" name="program_interest" required><option value="">Chọn bộ môn</option>{programs.map(program => <option key={program.id} value={program.name}>{program.name}</option>)}</SelectField>
          {fieldError('program_interest')}
          <p className="text-sm text-gray-500">Trình độ: Chưa xác định. Sẽ chọn khi đăng ký.</p>
          <SelectField label="Nguồn" name="source_type" defaultValue="MANUAL">{Object.entries(sourceLabel).map(([source, label]) => <option key={source} value={source}>{label}</option>)}</SelectField>
          <SelectField label="Mức độ quan tâm" name="interest_level" defaultValue="REFERENCE">{Object.entries(interestLevelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="font-semibold">C. Lịch học mong muốn</legend>
          <p className="text-sm text-gray-500">Chưa xác định thì để trống. Đây là nhu cầu, chưa phải ca đã xác nhận.</p>
          <div className="vibe-filter" style={fieldGrid}>
            <FormField label="Ngày dự kiến bắt đầu" name="desired_start_date" type="date" />
            {fieldError('desired_start_date')}
            <FormField label="Số buổi/tuần (nếu biết)" name="preferred_sessions_per_week" type="number" min={1} max={7} />
            {fieldError('preferred_sessions_per_week')}
            <FormField label="Ghi chú lịch" name="schedule_note" maxLength={500} />
            {fieldError('schedule_note')}
          </div>
          {slots.map((slot, index) => <div key={index} className="vibe-filter">
            <label>Thứ <select aria-label={`Thứ của khung ${index + 1}`} value={slot.weekday} onChange={event => setSlots(items => items.map((item, i) => i === index ? { ...item, weekday: event.target.value } : item))}>{weekdays.map((day, i) => <option key={day} value={String(i + 1)}>{day}</option>)}</select></label>
            <label>Giờ bắt đầu <input aria-label={`Giờ bắt đầu khung ${index + 1}`} name={`slot_start_${index}`} type="time" required defaultValue={slot.start} /></label>
            <label>Giờ kết thúc <input aria-label={`Giờ kết thúc khung ${index + 1}`} name={`slot_end_${index}`} type="time" required defaultValue={slot.end} /></label>
            <button type="button" className="vibe-button" onClick={() => setSlots(items => items.filter((_, i) => i !== index))}>Bỏ khung</button>
          </div>)}
          <button type="button" className="vibe-button" onClick={() => setSlots(items => [...items, blankSlot()])} disabled={slots.length >= 14}>Thêm khung giờ</button>
          {error?.field === 'preferred_slots' && <p role="alert" className="text-red-700">{error.message}</p>}
        </fieldset>
        <div className="flex gap-3">
          <button type="submit" className="vibe-button vibe-button-primary" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
          <button type="button" className="vibe-button" disabled={pending} onClick={() => setOpen(false)}>Đóng</button>
        </div>
      </form>
    </SectionCard>}
  </>
}
