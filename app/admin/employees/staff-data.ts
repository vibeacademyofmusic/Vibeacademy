import type { SupabaseClient } from '@supabase/supabase-js'
import { publicCard, vietnamToday, type PublicCard } from '@/lib/staff/profile'

export type TeachingRow = {
  id: string
  curriculum_id: string
  subject_name: string
  capacity: string
  effective_from: string
  effective_to: string | null
  status: string
  reason: string
}

export type PositionRow = {
  id: string
  position_code: string
  effective_from: string
  effective_to: string | null
  status: string
  reason: string
}

export type SubjectOption = { id: string; name: string; code: string }
export type IdentityChoice = {
  id: string
  label: string
  detail: string
  kind: 'teacher' | 'profile'
  blocked: string | null
}

export async function loadStaffFace(db: SupabaseClient, employeeId: string) {
  const today = vietnamToday()
  const [card, teaching, positions, subjects] = await Promise.all([
    db.rpc('staff_name_card', { p_employee: employeeId }),
    db.from('staff_teaching_assignments').select('id,curriculum_id,capacity,effective_from,effective_to,status,reason').eq('employee_id', employeeId).order('effective_from', { ascending: false }),
    db.from('staff_position_assignments').select('id,position_code,effective_from,effective_to,status,reason').eq('employee_id', employeeId).order('effective_from', { ascending: false }),
    db.from('operational_curriculums').select('id,name,code').order('name').limit(300),
  ])
  if (card.error || teaching.error || positions.error || subjects.error) {
    throw new Error('Could not load staff profile')
  }
  const row = Array.isArray(card.data) ? card.data[0] : card.data
  const portraitPath = typeof row?.portrait_path === 'string' ? row.portrait_path : null
  let portraitUrl: string | null = null
  if (portraitPath) {
    const signed = await db.storage.from('staff-portraits').createSignedUrl(portraitPath, 300)
    portraitUrl = signed.data?.signedUrl || null
  }
  const subjectIds = [...new Set(((teaching.data || []) as { curriculum_id: string }[]).map(item => item.curriculum_id))]
  const names = subjectIds.length
    ? await db.from('curriculums').select('id,name').in('id', subjectIds)
    : { data: [], error: null }
  if (names.error) throw new Error('Could not load staff profile')
  const subjectNames = new Map((names.data || []).map(item => [item.id, item.name]))
  const teachingRows = ((teaching.data || []) as TeachingRow[]).map(item => ({
    ...item,
    subject_name: subjectNames.get(item.curriculum_id) || '',
  }))
  const facts: PublicCard = publicCard({
    fullName: row?.full_name || '',
    employeeCode: row?.employee_code || '',
    teaching: teachingRows.map(item => ({
      capacity: item.capacity,
      subjectName: item.subject_name,
      status: item.status,
      effectiveFrom: item.effective_from,
      effectiveTo: item.effective_to,
    })),
    positions: ((positions.data || []) as PositionRow[]).map(item => ({
      code: item.position_code,
      status: item.status,
      effectiveFrom: item.effective_from,
      effectiveTo: item.effective_to,
    })),
    branchName: row?.branch_name || null,
    today,
  })
  return {
    today,
    facts,
    portraitUrl,
    teaching: teachingRows,
    positions: (positions.data || []) as PositionRow[],
    subjects: (subjects.data || []) as SubjectOption[],
  }
}

export async function searchIdentity(db: SupabaseClient, query: string): Promise<IdentityChoice[]> {
  const term = query.trim().replace(/[%_,]/g, '')
  if (term.length < 2) return []
  const pattern = `%${term}%`
  const [byName, byCode, profiles] = await Promise.all([
    db.from('teachers').select('id,full_name,teacher_code').ilike('full_name', pattern).limit(8),
    db.from('teachers').select('id,full_name,teacher_code').ilike('teacher_code', pattern).limit(8),
    db.from('profiles').select('id,full_name').ilike('full_name', pattern).limit(8),
  ])
  if (byName.error || byCode.error || profiles.error) return []
  const teachers = [...new Map([...(byName.data || []), ...(byCode.data || [])].map(row => [row.id, row])).values()]
  const teacherIds = teachers.map(row => row.id)
  const profileIds = (profiles.data || []).map(row => row.id)
  const filters = [
    teacherIds.length ? `teacher_id.in.(${teacherIds.join(',')})` : '',
    profileIds.length ? `profile_id.in.(${profileIds.join(',')})` : '',
  ].filter(Boolean)
  const links = filters.length
    ? await db.from('employees').select('employee_code,teacher_id,profile_id').or(filters.join(','))
    : { data: [], error: null }
  if (links.error) return []
  const linkedTeacher = new Map((links.data || []).filter(row => row.teacher_id).map(row => [row.teacher_id as string, row.employee_code as string]))
  const linkedProfile = new Map((links.data || []).filter(row => row.profile_id).map(row => [row.profile_id as string, row.employee_code as string]))
  const teacherChoices: IdentityChoice[] = teachers.map(row => ({
    id: row.id,
    kind: 'teacher',
    label: row.full_name,
    detail: `Giáo viên ${row.teacher_code}`,
    blocked: linkedTeacher.get(row.id) ? `Đã thuộc ${linkedTeacher.get(row.id)}` : null,
  }))
  const profileChoices: IdentityChoice[] = (profiles.data || []).map(row => ({
    id: row.id,
    kind: 'profile',
    label: row.full_name,
    detail: 'Hồ sơ đăng nhập',
    blocked: linkedProfile.get(row.id) ? `Đã thuộc ${linkedProfile.get(row.id)}` : null,
  }))
  return [...teacherChoices, ...profileChoices]
}
