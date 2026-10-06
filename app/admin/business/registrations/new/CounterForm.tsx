'use client'

import { useMemo, useState } from 'react'
import { createRegistration } from '../actions'

type Option = { id: string; name: string }
type Level = Option & { curriculum_id: string }
type Subject = Option & { level_id: string }

export function CounterForm({
  branches,
  lead,
  curriculums,
  levels,
  subjects,
}: {
  branches: Option[]
  lead: { id: string; status: string; branch_id: string; student_name: string | null; full_name: string | null; parent_name: string | null; phone: string | null; student_date_of_birth: string | null } | null
  curriculums: Option[]
  levels: Level[]
  subjects: Subject[]
}) {
  const [curriculumId, setCurriculumId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const levelOptions = useMemo(() => levels.filter(level => level.curriculum_id === curriculumId), [levels, curriculumId])
  const subjectOptions = useMemo(() => subjects.filter(subject => subject.level_id === levelId), [subjects, levelId])
  const blockedLead = lead && lead.status !== 'WON'

  return (
    <form action={createRegistration} className="grid gap-4">
      {lead && <input type="hidden" name="crm_lead_id" value={lead.id} />}
      <section className="vibe-card grid gap-3">
        <h2>Tiếp nhận</h2>
        <p className="text-sm text-slate-600">Lưu bản nháp chỉ giữ hồ sơ. Học viên và mã học viên chỉ được tạo sau khi cọc đã xác thực đạt 50% học phí đã chốt.</p>
        {blockedLead && <p className="vibe-notice" data-tone="error" role="alert">Chỉ tạo hồ sơ từ khách CRM đã chốt thành công.</p>}
        <label className="vibe-field"><span>Chi nhánh</span>
          <select name="branch_id" required defaultValue={lead?.branch_id ?? branches[0]?.id ?? ''}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        </label>
        <label className="vibe-field"><span>Học viên</span><input name="student_name" required defaultValue={lead?.student_name || lead?.full_name || ''} /></label>
        <label className="vibe-field"><span>Ngày sinh</span><input name="student_date_of_birth" type="date" required defaultValue={lead?.student_date_of_birth ?? ''} /></label>
        <label className="vibe-field"><span>Phụ huynh / người giám hộ</span><input name="parent_name" required defaultValue={lead?.parent_name || lead?.full_name || ''} /></label>
        <label className="vibe-field"><span>Điện thoại liên hệ</span><input name="parent_phone" required defaultValue={lead?.phone ?? ''} /></label>
      </section>
      <section className="vibe-card grid gap-3">
        <h2>Chương trình học</h2>
        <p className="text-sm text-slate-600">Chọn đúng cây Curriculum → Level → Subject đang hoạt động. Đổi cấp trên sẽ xóa lựa chọn không còn phù hợp.</p>
        <label className="vibe-field"><span>Chương trình</span>
          <select name="curriculum_id" required value={curriculumId} onChange={event => { setCurriculumId(event.target.value); setLevelId(''); setSubjectId('') }}>
            <option value="" disabled>Chọn chương trình</option>
            {curriculums.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Trình độ</span>
          <select name="level_id" required value={levelId} disabled={!curriculumId} onChange={event => { setLevelId(event.target.value); setSubjectId('') }}>
            <option value="" disabled>{curriculumId ? 'Chọn trình độ' : 'Chọn chương trình trước'}</option>
            {levelOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Môn học</span>
          <select name="subject_id" required value={subjectId} disabled={!levelId} onChange={event => setSubjectId(event.target.value)}>
            <option value="" disabled>{levelId ? 'Chọn môn học' : 'Chọn trình độ trước'}</option>
            {subjectOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>
      <section className="vibe-card grid gap-3">
        <h2>Lịch mong muốn</h2>
        <label className="vibe-field"><span>Ngày muốn bắt đầu</span><input name="desired_start_date" type="date" /></label>
        <label className="vibe-field"><span>Khung giờ mong muốn</span><input name="preferred_schedule" placeholder="Ví dụ T7 15:00" /></label>
        <button className="vibe-button vibe-button-primary" disabled={Boolean(blockedLead)} type="submit">Lưu bản nháp</button>
      </section>
    </form>
  )
}
