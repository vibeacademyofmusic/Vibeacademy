'use client'

import { useMemo, useState } from 'react'

type Branch = { id: string; name: string }
type Program = { id: string; name: string; code: string }
type Level = { id: string; name: string; sequence_no: number }
type Teacher = { id: string; full_name: string | null; teacher_code: string }
type Room = { id: string; name: string; branch_id: string }

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
  const [branchId, setBranchId] = useState('')
  const [programId, setProgramId] = useState('')
  const levels = useMemo(() => {
    if (programId) return levelsByCurriculum[programId] ?? []
    return Object.values(levelsByCurriculum).flat()
  }, [programId, levelsByCurriculum])
  const branchRooms = branchId ? rooms.filter(room => room.branch_id === branchId) : rooms

  return (
    <>
      <label className="vibe-field">
        <span>Chi nhánh</span>
        <select name="branch_id" required value={branchId} onChange={event => setBranchId(event.target.value)}>
          <option value="">Chọn chi nhánh</option>
          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <label className="vibe-field">
        <span>Chương trình</span>
        <select name="curriculum_id" required value={programId} onChange={event => setProgramId(event.target.value)}>
          <option value="">Chọn chương trình</option>
          {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </label>
      <label className="vibe-field" key={`${programId}-from`}>
        <span>Từ trình độ</span>
        <select name="accepted_from_level_id" defaultValue="">
          <option value="">— (chưa cấu hình)</option>
          {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
        </select>
      </label>
      <label className="vibe-field" key={`${programId}-to`}>
        <span>Đến trình độ</span>
        <select name="accepted_to_level_id" defaultValue="">
          <option value="">— (chưa cấu hình)</option>
          {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
        </select>
      </label>
      <label className="vibe-field">
        <span>Giáo viên chính</span>
        <select name="teacher_id" defaultValue="">
          <option value="">Để sau — ca vẫn là bản nháp</option>
          {teachers.map(teacher => (
            <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.teacher_code}</option>
          ))}
        </select>
      </label>
      <label className="vibe-field">
        <span>Thứ trong tuần</span>
        <select name="day_of_week" defaultValue="">
          <option value="">Chưa chọn lịch</option>
          <option value="1">Thứ 2</option>
          <option value="2">Thứ 3</option>
          <option value="3">Thứ 4</option>
          <option value="4">Thứ 5</option>
          <option value="5">Thứ 6</option>
          <option value="6">Thứ 7</option>
          <option value="7">Chủ nhật</option>
        </select>
      </label>
      <label className="vibe-field">
        <span>Giờ bắt đầu</span>
        <input name="start_time" type="time" />
      </label>
      <label className="vibe-field">
        <span>Giờ kết thúc</span>
        <input name="end_time" type="time" />
      </label>
      <label className="vibe-field">
        <span>Phòng</span>
        <select name="room_id" defaultValue="">
          <option value="">Chọn phòng</option>
          {branchRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </label>
      <label className="vibe-field">
        <span>Ngày hiệu lực lịch</span>
        <input name="effective_from" type="date" />
      </label>
      <label className="vibe-field">
        <span>Hết hiệu lực lịch</span>
        <input name="effective_to" type="date" />
      </label>
    </>
  )
}
