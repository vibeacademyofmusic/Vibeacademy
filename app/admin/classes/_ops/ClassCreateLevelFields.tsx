'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { createClass } from '../actions'
import styles from './create-wizard.module.css'

type Branch = { id: string; name: string }
type Program = { id: string; name: string; code: string }
type Level = { id: string; name: string; sequence_no: number }
type Teacher = { id: string; full_name: string | null; teacher_code: string }
type Room = { id: string; name: string; branch_id: string }

const steps = [
  { title: 'Chi nhánh và chương trình', hint: 'Chọn nơi dạy và chương trình. Phạm vi trình độ có thể để trống, hoặc chọn đủ Từ và Đến.' },
  { title: 'Lịch dạy', hint: 'Có thể bỏ qua lịch lúc này. Nếu nhập lịch, cần đủ thứ, giờ, phòng và ngày hiệu lực.' },
  { title: 'Thông tin ca dạy', hint: 'Đặt mã, tên và sức chứa. Hoàn thành để tạo ca.' },
]

export default function ClassCreateLevelFields({
  branches,
  programs,
  levelsByCurriculum,
  teachers,
  rooms,
}: {
  branches: Branch[]
  programs: Program[]
  levelsByCurriculum: Record<string, Level[]>
  teachers: Teacher[]
  rooms: Room[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [notice, setNotice] = useState('')
  const [branchId, setBranchId] = useState('')
  const [programId, setProgramId] = useState('')
  const [fromLevel, setFromLevel] = useState('')
  const [toLevel, setToLevel] = useState('')
  const [classType, setClassType] = useState('GROUP')
  const levels = useMemo(() => levelsByCurriculum[programId] ?? [], [programId, levelsByCurriculum])
  const branchRooms = branchId ? rooms.filter(room => room.branch_id === branchId) : []

  function value(name: string) {
    const field = formRef.current?.elements.namedItem(name)
    return field && 'value' in field ? String(field.value).trim() : ''
  }

  function validate(index: number) {
    if (index === 0) {
      if (!branchId || !programId) return 'Chọn chi nhánh và chương trình để tiếp tục.'
      if ((fromLevel && !toLevel) || (!fromLevel && toLevel)) return 'Phạm vi trình độ cần cả Từ và Đến, hoặc để trống.'
      return ''
    }
    if (index === 1) {
      const day = value('day_of_week')
      const start = value('start_time')
      const end = value('end_time')
      const room = value('room_id')
      const from = value('effective_from')
      const to = value('effective_to')
      const requested = Boolean(day || start || end || room || from || to)
      if (requested && (!day || !start || !end || !room || !from)) return 'Lịch cần thứ, giờ bắt đầu, giờ kết thúc, phòng và ngày hiệu lực.'
      if (start && end && end <= start) return 'Giờ kết thúc phải sau giờ bắt đầu.'
      if (from && to && to < from) return 'Ngày hết hiệu lực không được trước ngày bắt đầu lịch.'
      return ''
    }
    const code = value('code').replace(/\s+/g, '_').toUpperCase()
    const name = value('name')
    const capacity = Number(value('capacity'))
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) return 'Mã ca dạy gồm chữ, số, gạch ngang hoặc gạch dưới, từ 2 đến 50 ký tự.'
    if (!name) return 'Nhập tên ca dạy để hoàn thành.'
    if (!Number.isInteger(capacity) || capacity <= 0) return 'Sức chứa phải là số nguyên lớn hơn 0.'
    if (classType === 'ONE_ON_ONE' && capacity !== 1) return 'Ca 1-1 có sức chứa đúng 1.'
    if (classType === 'GROUP' && capacity < 2) return 'Ca nhóm cần sức chứa từ 2 trở lên.'
    const startDate = value('start_date')
    const endDate = value('end_date')
    if (startDate && endDate && endDate < startDate) return 'Ngày kết thúc ca không được trước ngày bắt đầu.'
    return ''
  }

  function goNext() {
    const message = validate(step)
    setNotice(message)
    if (!message) setStep(current => current + 1)
  }

  function finish(event: FormEvent<HTMLFormElement>) {
    const message = validate(2)
    setNotice(message)
    if (message) event.preventDefault()
  }

  return (
    <form ref={formRef} action={createClass} onSubmit={finish} className={styles.form}>
      <ol className={styles.steps} aria-label="Các bước tạo ca dạy">
        {steps.map((item, index) => (
          <li key={item.title} data-state={index === step ? 'current' : index < step ? 'done' : 'upcoming'} aria-current={index === step ? 'step' : undefined}>
            <span className={styles.mark}>{index + 1}</span>
            {item.title}
          </li>
        ))}
      </ol>
      <p className={styles.hint}>{steps[step].hint}</p>

      <div className={styles.panel} hidden={step !== 0}>
        <label className="vibe-field"><span>Chi nhánh</span>
          <select name="branch_id" required value={branchId} onChange={event => setBranchId(event.target.value)}>
            <option value="">Chọn chi nhánh</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Chương trình</span>
          <select name="curriculum_id" required value={programId} onChange={event => { setProgramId(event.target.value); setFromLevel(''); setToLevel('') }}>
            <option value="">Chọn chương trình</option>
            {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Từ trình độ</span>
          <select name="accepted_from_level_id" value={fromLevel} onChange={event => setFromLevel(event.target.value)}>
            <option value="">— (chưa cấu hình)</option>
            {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Đến trình độ</span>
          <select name="accepted_to_level_id" value={toLevel} onChange={event => setToLevel(event.target.value)}>
            <option value="">— (chưa cấu hình)</option>
            {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.panel} hidden={step !== 1}>
        <label className="vibe-field"><span>Giáo viên chính</span>
          <select name="teacher_id" defaultValue="">
            <option value="">Để sau — ca vẫn là bản nháp</option>
            {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.teacher_code}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Thứ trong tuần</span>
          <select name="day_of_week" defaultValue="">
            <option value="">Chưa chọn lịch</option>
            <option value="1">Thứ 2</option><option value="2">Thứ 3</option><option value="3">Thứ 4</option>
            <option value="4">Thứ 5</option><option value="5">Thứ 6</option><option value="6">Thứ 7</option>
            <option value="7">Chủ nhật</option>
          </select>
        </label>
        <label className="vibe-field"><span>Giờ bắt đầu</span><input name="start_time" type="time" /></label>
        <label className="vibe-field"><span>Giờ kết thúc</span><input name="end_time" type="time" /></label>
        <label className="vibe-field"><span>Phòng</span>
          <select key={branchId} name="room_id" defaultValue="">
            <option value="">{branchId ? 'Chọn phòng' : 'Chọn chi nhánh trước'}</option>
            {branchRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Ngày hiệu lực lịch</span><input name="effective_from" type="date" /></label>
        <label className="vibe-field"><span>Hết hiệu lực lịch</span><input name="effective_to" type="date" /></label>
      </div>

      <div className={styles.panel} hidden={step !== 2}>
        <label className="vibe-field"><span>Mã ca dạy</span><input name="code" required /></label>
        <label className="vibe-field"><span>Tên ca dạy</span><input name="name" required /></label>
        <label className="vibe-field"><span>Loại</span>
          <select name="class_type" value={classType} onChange={event => setClassType(event.target.value)}>
            <option value="GROUP">Nhóm</option><option value="ONE_ON_ONE">1-1</option>
          </select>
        </label>
        <label className="vibe-field"><span>Sức chứa</span><input key={classType} name="capacity" type="number" min={1} defaultValue={classType === 'ONE_ON_ONE' ? 1 : 4} required /></label>
        <label className="vibe-field"><span>Ngày bắt đầu ca</span><input name="start_date" type="date" /></label>
        <label className="vibe-field"><span>Ngày kết thúc ca</span><input name="end_date" type="date" /></label>
      </div>

      {notice ? <p className={styles.alert} role="alert">{notice}</p> : null}
      <div className={styles.nav}>
        {step > 0 && <button className="vibe-button" type="button" onClick={() => { setNotice(''); setStep(current => current - 1) }}>Quay lại</button>}
        {step < 2 && <button className="vibe-button vibe-button-primary" type="button" onClick={goNext}>Tiếp tục</button>}
        {step === 2 && <button className="vibe-button vibe-button-primary" type="submit">Hoàn thành</button>}
      </div>
    </form>
  )
}
