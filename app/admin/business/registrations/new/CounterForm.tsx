'use client'

import { useMemo, useState } from 'react'
import { createRegistration } from '../actions'
import styles from '../workspace.module.css'

type Option = { id: string; name: string }
type Level = Option & { curriculum_id: string }
export function CounterForm({
  canManageConsent,
  branches,
  lead,
  curriculums,
  levels,
  subjects,
}: {
  canManageConsent: boolean
  branches: Option[]
  lead: { id: string; status: string; branch_id: string; student_name: string | null; full_name: string | null; parent_name: string | null; phone: string | null; student_date_of_birth: string | null } | null
  curriculums: Option[]
  levels: Level[]
  subjects: (Option & { level_id: string })[]
}) {
  const [consent, setConsent] = useState(false)
  const [curriculumId, setCurriculumId] = useState('')
  const [levelId, setLevelId] = useState('')
  const levelOptions = useMemo(() => levels.filter(level => level.curriculum_id === curriculumId), [levels, curriculumId])
  const subjectOptions = subjects.filter(subject => subject.level_id === levelId)
  const blockedLead = lead && lead.status !== 'WON'

  return (
    <form action={createRegistration} className={styles.stack}>
      {lead && <input type="hidden" name="crm_lead_id" value={lead.id} />}
      <section className={styles.card}>
        <h2>Tiếp nhận</h2>
        <p>Lưu bản nháp chỉ giữ hồ sơ. Học viên và mã học viên chỉ được tạo sau khi cọc đã xác thực đạt 50% học phí đã chốt.</p>
        {blockedLead && <p className={styles.error} role="alert">Chỉ tạo hồ sơ từ khách CRM đã chốt thành công.</p>}
        <label className={styles.field}><span>Chi nhánh</span>
          <select name="branch_id" required defaultValue={lead?.branch_id ?? branches[0]?.id ?? ''}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        </label>
        <label className={styles.field}><span>Học viên</span><input name="student_name" required defaultValue={lead?.student_name || lead?.full_name || ''} /></label>
        <label className={styles.field}><span>Ngày sinh</span><input name="student_date_of_birth" type="date" required defaultValue={lead?.student_date_of_birth ?? ''} /></label>
        <label className={styles.field}><span>Phụ huynh / người giám hộ</span><input name="parent_name" required defaultValue={lead?.parent_name || lead?.full_name || ''} /></label>
        <label className={styles.field}><span>Điện thoại liên hệ</span><input name="parent_phone" required defaultValue={lead?.phone ?? ''} /></label>
      </section>
      {canManageConsent && <section className={styles.card}>
        <h2>Đồng ý nhận thông báo Zalo</h2>
        <p>Không bắt buộc. Chỉ ghi nhận khi phụ huynh đã đồng ý nhận thông báo giao dịch qua đúng số điện thoại liên hệ ở trên. Thanh toán không thay thế sự đồng ý.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="phone_consent" value="yes" checked={consent} onChange={event => setConsent(event.target.checked)} />Phụ huynh đã đồng ý nhận thông báo Zalo qua số liên hệ này (zbs-phone-v1).</label>
        {consent && <label className={styles.field}><span>Nguồn xác nhận</span><select name="consent_method" required defaultValue=""><option value="" disabled>Chọn nguồn xác nhận thực tế</option><option value="IN_PERSON">Trao đổi trực tiếp</option><option value="PHONE">Cuộc gọi với phụ huynh</option><option value="WRITTEN">Văn bản / tin nhắn của phụ huynh</option></select></label>}
      </section>}
      <section className={styles.card}>
        <h2>Chương trình học</h2>
        <p>Chọn chương trình và trình độ đang hoạt động. Đổi chương trình sẽ xóa trình độ không còn phù hợp.</p>
        <label className={styles.field}><span>Chương trình</span>
          <select name="curriculum_id" required value={curriculumId} onChange={event => { setCurriculumId(event.target.value); setLevelId('') }}>
            <option value="" disabled>Chọn chương trình</option>
            {curriculums.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Trình độ</span>
          <select name="level_id" required value={levelId} disabled={!curriculumId} onChange={event => setLevelId(event.target.value)}>
            <option value="" disabled>{curriculumId ? 'Chọn trình độ' : 'Chọn chương trình trước'}</option>
            {levelOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Môn học</span>
          <select key={levelId} name="subject_id" required disabled={!levelId} defaultValue={subjectOptions.length === 1 ? subjectOptions[0].id : ''}>
            <option value="" disabled>{levelId ? 'Chọn môn học' : 'Chọn trình độ trước'}</option>
            {subjectOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>
      <section className={styles.card}>
        <h2>Lịch mong muốn</h2>
        <label className={styles.field}><span>Ngày muốn bắt đầu</span><input name="desired_start_date" type="date" /></label>
        <label className={styles.field}><span>Khung giờ mong muốn</span><input name="preferred_schedule" placeholder="Ví dụ T7 15:00" /></label>
        <button className={styles.buttonPrimary} disabled={Boolean(blockedLead)} type="submit">Lưu bản nháp</button>
      </section>
    </form>
  )
}
