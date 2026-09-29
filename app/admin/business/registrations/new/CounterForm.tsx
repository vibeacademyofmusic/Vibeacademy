'use client'

import { useMemo, useState } from 'react'
import { createRegistration, updateRegistrationIntake } from '../actions'
import { homeAddress, isOver18, normalizeVnPhone, vietnamToday } from '../intake'
import styles from '../workspace.module.css'

type Option = { id: string; name: string }
type Level = Option & { curriculum_id: string }
export type IntakeValues = {
  id?: string
  version?: number
  branch_id?: string
  student_name?: string | null
  student_date_of_birth?: string | null
  student_over_18?: boolean
  parent_name?: string | null
  parent_phone?: string | null
  zalo_phone?: string | null
  home_address?: string | null
  curriculum_id?: string | null
  level_id?: string | null
  desired_start_date?: string | null
  preferred_schedule?: string | null
}

export function CounterForm({
  branches,
  lead,
  curriculums,
  levels,
  existing,
  consentPhone = null,
  today = vietnamToday(),
}: {
  branches: Option[]
  lead: { id: string; status: string; branch_id: string; student_name: string | null; full_name: string | null; parent_name: string | null; phone: string | null; student_date_of_birth: string | null } | null
  curriculums: Option[]
  levels: Level[]
  existing?: IntakeValues | null
  consentPhone?: string | null
  today?: string
}) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [consent, setConsent] = useState(false)
  const [over18, setOver18] = useState(existing?.student_over_18 ?? false)
  const [parentName, setParentName] = useState(existing?.parent_name || lead?.parent_name || lead?.full_name || '')
  const [parentPhone, setParentPhone] = useState(existing?.parent_phone || lead?.phone || '')
  const [birth, setBirth] = useState(existing?.student_date_of_birth || lead?.student_date_of_birth || '')
  const [zaloPhone, setZaloPhone] = useState(existing?.zalo_phone || '')
  const [address, setAddress] = useState(existing?.home_address || '')
  const [curriculumId, setCurriculumId] = useState(existing?.curriculum_id || '')
  const [levelId, setLevelId] = useState(existing?.level_id || '')
  const [formError, setFormError] = useState('')
  const levelOptions = useMemo(() => levels.filter(level => level.curriculum_id === curriculumId), [levels, curriculumId])
  const blockedLead = lead && lead.status !== 'WON'
  const ageMismatch = Boolean(birth) && over18 !== isOver18(birth, today)
  const savedConsent = consentPhone ? normalizeVnPhone(consentPhone) : null
  const currentZalo = normalizeVnPhone(zaloPhone)
  const consentMatches = Boolean(savedConsent && currentZalo && savedConsent === currentZalo)
  const consentLeftBehind = Boolean(savedConsent && currentZalo && savedConsent !== currentZalo)

  function validate() {
    if (!homeAddress(address)) return 'Địa chỉ nhà không được để trống hoặc chỉ gồm khoảng trắng.'
    if (!normalizeVnPhone(zaloPhone)) return 'Số Zalo không hợp lệ. Chỉ dùng chữ số, không chứa chữ, và phải là số Việt Nam.'
    if (ageMismatch) return 'Ngày sinh không khớp ô Trên 18 tuổi. Trên 18 tuổi nghĩa là đã qua ngày sinh nhật thứ 18 theo giờ Việt Nam, không tính đúng ngày sinh nhật.'
    if (!over18 && (!parentName.trim() || !normalizeVnPhone(parentPhone))) return 'Học viên chưa trên 18 tuổi thì cần họ tên và số điện thoại phụ huynh hợp lệ.'
    if (over18 && parentPhone.trim() && !normalizeVnPhone(parentPhone)) return 'Số điện thoại phụ huynh không hợp lệ.'
    return ''
  }

  return (
    <form action={existing?.id ? updateRegistrationIntake : createRegistration} className={styles.stack} onSubmit={event => {
      const message = validate()
      if (message) { event.preventDefault(); setFormError(message) }
    }}>
      {lead && <input type="hidden" name="crm_lead_id" value={lead.id} />}
      <input type="hidden" name="request_id" value={requestId} />
      {existing?.id && <input type="hidden" name="application_id" value={existing.id} />}
      {existing?.version != null && <input type="hidden" name="version" value={existing.version} />}
      <input type="hidden" name="student_over_18" value={over18 ? 'yes' : 'no'} />
      <section className={styles.card}>
        <h2>Tiếp nhận</h2>
        <p>Lưu bản nháp chỉ giữ hồ sơ. Học viên và mã học viên chỉ được tạo sau khi thanh toán đã xác thực đạt 50% học phí đã chốt.</p>
        {blockedLead && <p className={styles.error} role="alert">Chỉ tạo hồ sơ từ khách CRM đã chốt thành công.</p>}
        {formError && <p className={styles.error} role="alert">{formError}</p>}
        <label className={styles.field}><span>Chi nhánh</span>
          <select name="branch_id" required defaultValue={existing?.branch_id || lead?.branch_id || branches[0]?.id || ''}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        </label>
        <label className={styles.field}><span>Học viên</span><input name="student_name" required defaultValue={existing?.student_name || lead?.student_name || lead?.full_name || ''} /></label>
        <label className={styles.field}><span>Ngày sinh</span><input name="student_date_of_birth" type="date" required value={birth} onChange={event => setBirth(event.target.value)} /></label>
        <label className={styles.field}><span>Địa chỉ nhà</span><textarea name="home_address" required maxLength={300} value={address} onChange={event => setAddress(event.target.value)} /></label>
      </section>
      <section className={styles.card}>
        <div className={styles.headingRow}>
          <h2>Phụ huynh</h2>
          <label className={styles.check}><input type="checkbox" checked={over18} onChange={event => setOver18(event.target.checked)} />Trên 18 tuổi</label>
        </div>
        <p className={styles.hint}>Ô này không được tích sẵn. Trên 18 tuổi nghĩa là đã qua ngày sinh nhật thứ 18, không tính đúng ngày đó. Bật hoặc tắt không xóa thông tin phụ huynh đã nhập.</p>
        {ageMismatch && <p className={styles.error} role="alert">Ngày sinh không khớp với ô Trên 18 tuổi.</p>}
        <input type="hidden" name="parent_name" value={parentName} />
        <input type="hidden" name="parent_phone" value={parentPhone} />
        {!over18 && <>
          <label className={styles.field}><span>Phụ huynh / người giám hộ</span><input required value={parentName} onChange={event => setParentName(event.target.value)} /></label>
          <label className={styles.field}><span>Điện thoại phụ huynh</span><input required inputMode="tel" autoComplete="tel" value={parentPhone} onChange={event => setParentPhone(event.target.value)} /></label>
        </>}
      </section>
      <section className={styles.card}>
        <h2>Số Zalo và đồng ý nhận tin</h2>
        <p className={styles.hint}>Số điện thoại cung cấp là số Zalo. Số đúng định dạng chưa chứng minh tài khoản Zalo tồn tại. Có số điện thoại chưa phải đã đồng ý nhận tin. Nguồn được ghi là Đăng ký tại quầy và cũng không thay cho sự đồng ý.</p>
        <label className={styles.field}><span>Số điện thoại dùng Zalo</span><input name="zalo_phone" required inputMode="tel" autoComplete="tel" value={zaloPhone} onChange={event => setZaloPhone(event.target.value)} /></label>
        {consentMatches && <p className={styles.hint}>Đã ghi nhận đồng ý cho số Zalo đang lưu trên hồ sơ này. Ô bên dưới vẫn bỏ chọn. Tích lại không tạo thêm một lần đồng ý cho cùng số.</p>}
        {consentLeftBehind && <p className={styles.hint}>Đổi số Zalo không giữ đồng ý của số trước. Muốn nhận tin ở số mới thì phải tích ô đồng ý cho số đó.</p>}
        <label className={styles.check}><input type="checkbox" name="phone_consent" value="yes" checked={consent} onChange={event => setConsent(event.target.checked)} />Tôi đồng ý nhận thông báo đăng ký, học tập và thanh toán qua Zalo.</label>
      </section>
      <section className={styles.card}>
        <h2>Chương trình học</h2>
        <p>Chọn chương trình và trình độ đang hoạt động. Môn học không chọn ở bước này; việc học sẽ gắn sau, khi vào ca. Đổi chương trình sẽ xóa trình độ không còn phù hợp.</p>
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
      </section>
      <section className={styles.card}>
        <h2>Lịch mong muốn</h2>
        <label className={styles.field}><span>Ngày muốn bắt đầu</span><input name="desired_start_date" type="date" defaultValue={existing?.desired_start_date || ''} /></label>
        <label className={styles.field}><span>Khung giờ mong muốn</span><input name="preferred_schedule" placeholder="Ví dụ T7 15:00" defaultValue={existing?.preferred_schedule || ''} /></label>
        <button className={styles.buttonPrimary} disabled={Boolean(blockedLead)} type="submit">{existing?.id ? 'Lưu thông tin' : 'Lưu bản nháp'}</button>
      </section>
    </form>
  )
}
