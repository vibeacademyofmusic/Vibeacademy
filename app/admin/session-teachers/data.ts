import { adminClient, pageNumber, uuidPattern, validDate, type Params } from '../finance/operations'
import { branches, rows } from '../finance/query'
import { teachers } from '../feedback/data'
import {
  addCalendarDays,
  assignmentPageSize,
  assignmentTabs,
  assignmentWarnings,
  assignmentWindowCap,
  classesNeedingPrimary,
  isCurrentTeaching,
  isOperationalSubstitute,
  vietnamToday,
  warningSessionCount,
  type AssignmentSession,
  type AssignmentTab,
  type ClassTeacherAssignment,
} from './model'

const sessionFields = 'session_id,class_id,branch_id,occurrence_date,starts_at,ends_at,status,teacher_id,primary_teacher_id,assignment_type,reason,is_locked'
const statuses = ['SCHEDULED', 'COMPLETED', 'CANCELLED']

export async function loadAssignmentCenter(params: Params) {
  const db = await adminClient()
  const today = vietnamToday()
  const from = validDate(params.from || '') ? params.from! : today
  const to = validDate(params.to || '') ? params.to! : addCalendarDays(today, 30)
  const rangeFrom = from <= to ? from : to
  const rangeTo = from <= to ? to : from
  const tab = assignmentTabs.some(([id]) => id === params.tab) ? params.tab as AssignmentTab : 'needed'
  const page = pageNumber(params.page)
  const branchId = uuidPattern.test(params.branch || '') ? params.branch! : ''
  const teacherId = uuidPattern.test(params.teacher || '') ? params.teacher! : ''
  const status = statuses.includes(params.status || '') ? params.status! : ''
  const filters = { tab, branch: branchId, teacher: teacherId, from: rangeFrom, to: rangeTo, status, page: String(page) }

  let display = db.from('session_actual_teachers').select(sessionFields).gte('occurrence_date', rangeFrom).lte('occurrence_date', rangeTo)
  if (branchId) display = display.eq('branch_id', branchId)
  if (teacherId) display = display.eq('teacher_id', teacherId)
  if (status) display = display.eq('status', status)
  // Conflict schedule ignores branch and status filters so a hidden branch cannot conceal an overlap.
  let conflict = db.from('session_actual_teachers').select(sessionFields).gte('occurrence_date', rangeFrom).lte('occurrence_date', rangeTo)
  if (teacherId) conflict = conflict.eq('teacher_id', teacherId)
  const [sessionResult, conflictResult, branchOptions, teacherOptions] = await Promise.all([
    display.order('starts_at').order('session_id').limit(assignmentWindowCap + 1).returns<AssignmentSession[]>(),
    conflict.order('starts_at').order('session_id').limit(assignmentWindowCap + 1).returns<AssignmentSession[]>(),
    branches(db),
    teachers(db),
  ])
  if (sessionResult.error || !sessionResult.data || conflictResult.error || !conflictResult.data) {
    return { ok: false as const, filters, branches: branchOptions, teachers: teacherOptions }
  }
  const truncated = sessionResult.data.length > assignmentWindowCap || conflictResult.data.length > assignmentWindowCap
  const sessions = sessionResult.data.slice(0, assignmentWindowCap)
  const conflictSessions = conflictResult.data.slice(0, assignmentWindowCap)
  const classIds = [...new Set(sessions.map((session) => session.class_id))]
  const branchIds = [...new Set([...sessions, ...conflictSessions].map((session) => session.branch_id))]
  const sessionTeacherIds = [...new Set(sessions.flatMap((session) => [session.teacher_id, session.primary_teacher_id].filter((id): id is string => !!id)))]
  const assignmentSource = sessionTeacherIds.length
    ? await rows(db.from('class_teachers').select('class_id,teacher_id,teacher_role,is_active,assigned_at,ended_at').in('teacher_id', sessionTeacherIds).returns<Omit<ClassTeacherAssignment, 'branch_id'>[]>())
    : []
  const assignmentClassIds = [...new Set(assignmentSource.map((row) => row.class_id))]
  const classLookupIds = [...new Set([...classIds, ...assignmentClassIds])]
  const teacherIds = [...new Set([...sessionTeacherIds, ...assignmentSource.map((row) => row.teacher_id)])]
  const [classRows, branchRows, teacherRows, linkRows] = await Promise.all([
    classLookupIds.length ? rows(db.from('classes').select('id,name,branch_id').in('id', classLookupIds).returns<{ id: string; name: string; branch_id: string }[]>()) : [],
    branchIds.length ? rows(db.from('branches').select('id,name').in('id', branchIds).returns<{ id: string; name: string }[]>()) : [],
    teacherIds.length ? rows(db.from('teachers').select('id,full_name,teacher_code').in('id', teacherIds).returns<{ id: string; full_name: string | null; teacher_code: string }[]>()) : [],
    teacherIds.length ? rows(db.from('teacher_branches').select('teacher_id,branch_id').in('teacher_id', teacherIds).returns<{ teacher_id: string; branch_id: string }[]>()) : [],
  ])
  const classBranch = new Map(classRows.map((row) => [row.id, row.branch_id]))
  const assignments: ClassTeacherAssignment[] = assignmentSource.flatMap((row) => {
    const branch = classBranch.get(row.class_id)
    return branch ? [{ ...row, branch_id: branch }] : []
  })
  const classes = new Map(classRows.map((row) => [row.id, row.name]))
  const branchNames = new Map(branchRows.map((row) => [row.id, row.name]))
  const teacherNames = new Map(teacherRows.map((row) => [row.id, { name: row.full_name || row.teacher_code, code: row.teacher_code }]))
  const eligible = new Set(linkRows.map((row) => `${row.teacher_id}:${row.branch_id}`))
  const classNeeds = classesNeedingPrimary(sessions, today)
  const warnings = assignmentWarnings(sessions, today, eligible, conflictSessions)
  const warningSessions = warningSessionCount(warnings)
  return {
    ok: true as const,
    truncated,
    filters,
    today,
    branches: branchOptions,
    teachers: teacherOptions,
    sessions,
    assignments,
    classNeeds,
    classes,
    branchNames,
    teacherNames,
    warnings,
    counts: {
      needed: classNeeds.length,
      active: sessions.filter((session) => isCurrentTeaching(session, today)).length,
      substitute: sessions.filter((session) => isOperationalSubstitute(session, today)).length,
      warnings: warningSessions,
    },
    page,
  }
}
