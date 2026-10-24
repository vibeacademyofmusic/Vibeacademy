'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { createClass } from '../actions'
import { dayChoices, planIndependentShifts, windowProblems, type ExistingShiftRow, type KeyedWindow } from '@/lib/teaching-shifts/independent'
import styles from './create-wizard.module.css'

type Branch = { id: string; name: string }
type Program = { id: string; name: string; code: string }
type Level = { id: string; name: string; sequence_no: number }
type Teacher = { id: string; full_name: string | null; teacher_code: string }
type Room = { id: string; name: string; branch_id: string; capacity: number | null }

const steps = [
  { title: 'Chi nhánh và chương trình', hint: 'Chọn nơi dạy và chương trình. Phạm vi trình độ có thể để trống, hoặc chọn đủ Từ và Đến.' },
  { title: 'Lịch dạy', hint: 'Mỗi lần chỉ tạo một ca ở một thứ và một khung giờ. Muốn thêm ca cùng giờ ở phòng khác, lưu ca này rồi tạo ca tiếp theo.' },
  { title: 'Xem trước và tạo', hint: 'Xác nhận sức chứa thực tế trước khi lưu. Ca cùng phòng và lịch đã có sẽ được mở, không tạo trùng.' },
]

export default function ClassCreateLevelFields({
  branches,
  programs,
  levelsByCurriculum,
  teachers,
  rooms,
  existingShifts = [],
  initialBranchId = '',
  initialProgramId = '',
  initialLevelId = '',
}: {
  branches: Branch[]
  programs: Program[]
  levelsByCurriculum: Record<string, Level[]>
  teachers: Teacher[]
  rooms: Room[]
  existingShifts?: ExistingShiftRow[]
  initialBranchId?: string
  initialProgramId?: string
  initialLevelId?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [notice, setNotice] = useState('')
  const [branchId, setBranchId] = useState(initialBranchId)
  const [programId, setProgramId] = useState(initialProgramId)
  const [fromLevel, setFromLevel] = useState(initialLevelId)
  const [toLevel, setToLevel] = useState(initialLevelId)
  const [classType, setClassType] = useState('GROUP')
  const [slots, setSlots] = useState<KeyedWindow[]>([])
  const [roomId, setRoomId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const levels = useMemo(() => levelsByCurriculum[programId] ?? [], [programId, levelsByCurriculum])
  const branchRooms = branchId ? rooms.filter(room => room.branch_id === branchId) : []
  const program = programs.find(item => item.id === programId)
  const plan = useMemo(() => {
    const problems = windowProblems(slots)
    if (!program || !branchId || !slots.length || problems.incomplete || problems.invalid || problems.overlap) return []
    return planIndependentShifts({
      programCode: program.code,
      programName: program.name,
      branchId,
      curriculumId: programId,
      days: slots.map(slot => slot.day),
      start: slots[0].start,
      end: slots[0].end,
      windows: slots,
      roomId: roomId || undefined,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || null,
      existing: existingShifts,
    })
  }, [program, branchId, programId, slots, roomId, effectiveFrom, effectiveTo, existingShifts])

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
      const room = value('room_id')
      const from = value('effective_from')
      const to = value('effective_to')
      const problems = windowProblems(slots)
      const requested = Boolean(slots.length || room || from || to)
      if (requested && !slots.length) return 'Chọn một thứ cho ca dạy.'
      if (problems.incomplete) return 'Mỗi dòng cần giờ bắt đầu và giờ kết thúc riêng.'
      if (problems.invalid) return 'Giờ kết thúc phải sau giờ bắt đầu.'
      if (slots.length > 1) return 'Mỗi lần chỉ tạo một ca. Hãy lưu từng thứ và khung giờ riêng.'
      if (requested && (!room || !from)) return 'Lịch cần phòng và ngày hiệu lực.'
      if (from && to && to < from) return 'Ngày hết hiệu lực không được trước ngày bắt đầu lịch.'
      return ''
    }
    const capacity = Number(value('capacity'))
    if (!value('capacity') || !Number.isInteger(capacity) || capacity <= 0) return 'Nhập sức chứa thực tế đã xác nhận, là số nguyên lớn hơn 0.'
    if (classType === 'ONE_ON_ONE' && capacity !== 1) return 'Ca 1-1 có sức chứa đúng 1.'
    if (classType === 'GROUP' && capacity < 2) return 'Ca nhóm cần sức chứa từ 2 trở lên.'
    const room = rooms.find(item => item.id === value('room_id'))
    if (slots.length && room && (!Number.isInteger(room.capacity) || Number(room.capacity) <= 0)) return 'Phòng chưa xác định sức chứa. Hãy xác nhận trước khi tạo ca.'
    if (room?.capacity && capacity > room.capacity) return `Sức chứa vượt sức chứa phòng (${room.capacity}).`
    const code = value('code').replace(/\s+/g, '_').toUpperCase()
    const name = value('name')
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) return 'Mã ca dạy gồm chữ, số, gạch ngang hoặc gạch dưới, từ 2 đến 50 ký tự.'
    if (!name) return 'Nhập tên ca dạy để hoàn thành.'
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

  const plannedShift = plan[0]

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
          <select name="branch_id" required value={branchId} onChange={event => { setBranchId(event.target.value); setRoomId('') }}>
            <option value="">Chọn chi nhánh</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Chương trình</span>
          <select name="curriculum_id" required value={programId} onChange={event => { setProgramId(event.target.value); setFromLevel(''); setToLevel('') }}>
            <option value="">Chọn chương trình</option>
            {programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
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
          <select name="day_of_week" value={slots[0]?.day ?? ''} onChange={event => {
            const day = Number(event.target.value)
            setSlots(Number.isInteger(day) && day >= 1 && day <= 7
              ? [{ key: 1, day, start: slots[0]?.start ?? '', end: slots[0]?.end ?? '' }]
              : [])
          }}>
            <option value="">Chưa chọn lịch — tạo bản nháp</option>
            {dayChoices.map(choice => <option key={choice.day} value={choice.day}>{choice.label}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Giờ bắt đầu</span><input name="start_time" type="time" value={slots[0]?.start ?? ''} disabled={!slots.length} required={slots.length > 0} onChange={event => setSlots(current => current.map(slot => ({ ...slot, start: event.target.value })))} /></label>
        <label className="vibe-field"><span>Giờ kết thúc</span><input name="end_time" type="time" value={slots[0]?.end ?? ''} disabled={!slots.length} required={slots.length > 0} onChange={event => setSlots(current => current.map(slot => ({ ...slot, end: event.target.value })))} /></label>
        <label className="vibe-field"><span>Phòng</span>
          <select name="room_id" value={roomId} onChange={event => setRoomId(event.target.value)}>
            <option value="">{branchId ? 'Chọn phòng' : 'Chọn chi nhánh trước'}</option>
            {branchRooms.map(room => <option key={room.id} value={room.id}>{room.name}{room.capacity ? ` · ${room.capacity} chỗ` : ''}</option>)}
          </select>
        </label>
        <label className="vibe-field"><span>Ngày hiệu lực lịch</span><input name="effective_from" type="date" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} /></label>
        <label className="vibe-field"><span>Hết hiệu lực lịch</span><input name="effective_to" type="date" value={effectiveTo} onChange={event => setEffectiveTo(event.target.value)} /></label>
      </div>

      <div className={styles.panel} hidden={step !== 2}>
        {plannedShift && (
          <div className={styles.preview}>
            <p>{plannedShift.existing ? 'Ca cùng phòng và lịch đã có. Mở ca đó để tiếp tục.' : 'Sẽ tạo một ca riêng. Cùng giờ ở phòng khác vẫn là ca riêng.'}</p>
            <ul>
                <li>
                  <strong>{plannedShift.name}</strong>
                  <span>Mã gợi ý: {plannedShift.code}. Nếu mã đã dùng ở phòng khác, hệ thống sẽ thêm số thứ tự.</span>
                  {plannedShift.existing ? (
                    <a href={`/admin/classes/${plannedShift.existing.id}`}>Mở ca đã có {plannedShift.existing.code}</a>
                  ) : (
                    <span>Ca mới. Kiểm tra phòng và sức chứa trước khi lưu.</span>
                  )}
                </li>
            </ul>
          </div>
        )}
        <label className="vibe-field"><span>Mã ca dạy</span><input key={plannedShift?.code || 'code'} name="code" required defaultValue={plannedShift?.code || ''} /></label>
        <label className="vibe-field"><span>Tên ca dạy</span><input key={plannedShift?.name || 'name'} name="name" required defaultValue={plannedShift?.name || ''} /></label>
        <label className="vibe-field"><span>Loại</span>
          <select name="class_type" value={classType} onChange={event => setClassType(event.target.value)}>
            <option value="GROUP">Nhóm</option><option value="ONE_ON_ONE">1-1</option>
          </select>
        </label>
        <label className="vibe-field"><span>Sức chứa đã xác nhận</span><input name="capacity" type="number" min={1} placeholder={classType === 'ONE_ON_ONE' ? 'Nhập 1' : 'Nhập sức chứa thực tế'} required /></label>
        <label className="vibe-field"><span>Ngày bắt đầu ca</span><input name="start_date" type="date" /></label>
        <label className="vibe-field"><span>Ngày kết thúc ca</span><input name="end_date" type="date" /></label>
      </div>

      {notice ? <p className={styles.alert} role="alert">{notice}</p> : null}
      <div className={styles.nav}>
        {step > 0 && <button className="vibe-button" type="button" onClick={() => { setNotice(''); setStep(current => current - 1) }}>Quay lại</button>}
        {step < 2 && <button className="vibe-button vibe-button-primary" type="button" onClick={goNext}>Tiếp tục</button>}
        {step === 2 && <button className="vibe-button vibe-button-primary" type="submit">Tạo một ca</button>}
      </div>
    </form>
  )
}
