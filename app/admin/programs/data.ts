import { createClient } from '@/lib/supabase/server'
import { businessDate } from '@/app/admin/_lib/business-date'
import {
  contentReadinessLabel,
  courseDelivery,
  healthLabel,
  hierarchyPath,
  levelAcademicHealth,
  programAcademicHealth,
  shownCount,
  structureMeta,
  subjectAcademicValid,
  subjectContentReady,
  type AttentionFact,
  type ClassFact,
  type HealthSubject,
  type LevelFact,
} from './model'

export type ProgramView = {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  path: string
  meta: string
  health: 'ready' | 'incomplete'
  healthLabel: string
  contentLabel: string | null
  levelCount: number
  subjectCount: number
  componentCount: number
  lessonCount: number
  courseCount: number
  levelsMissingSubjects: number
  subjectsMissingLessons: number
  levels: LevelFact[]
  attention: AttentionFact[]
}

export type CourseView = {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  curriculumId: string
  curriculumName: string | null
  levelName: string | null
  classCount: number
  enrollmentCount: number
  branches: string[]
  starting: boolean
  ended: boolean
  needsClass: boolean
}

type CurriculumRow = { id: string; code: string; name: string; description: string | null; status: string }
type LevelRow = {
  id: string
  curriculum_id: string
  code: string
  name: string
  sequence_no: number
  level_number: number | null
  level_type: string
  completion_rule: string
  status: string
}
type SubjectRow = { id: string; level_id: string; name: string; status: string; is_required: boolean; completion_rule: string }
type ComponentRow = { id: string; subject_id: string; status: string; is_required: boolean; completion_rule: string }
type ItemRow = { id: string; component_id: string; status: string; is_required: boolean }
type CourseRow = { id: string; curriculum_id: string; level_id: string | null; code: string; name: string; description: string | null; status: string }
type ClassRow = { id: string; course_id: string; branch_id: string; status: string; start_date: string | null }
type EnrollmentRow = { class_id: string; status: string }
type BranchRow = { id: string; name: string }

function countBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(key(row), (map.get(key(row)) ?? 0) + 1)
  return map
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function loadPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999)
    if (error) return { data: null, error }
    const page = data ?? []
    rows.push(...page)
    if (page.length < 1000) return { data: rows, error: null }
  }
}

export async function loadWorkspace() {
  const supabase = await createClient()
  const today = businessDate()
  const [curriculums, levels, subjects, components, items, courses, classes, enrollments, branches] = await Promise.all([
    loadPaged<CurriculumRow>( (from, to) => supabase.from('operational_curriculums').select('id, code, name, description, status').order('name').range(from, to)),
    loadPaged<LevelRow>( (from, to) => supabase.from('curriculum_levels').select('id, curriculum_id, code, name, sequence_no, level_number, level_type, completion_rule, status').range(from, to)),
    loadPaged<SubjectRow>( (from, to) => supabase.from('curriculum_subjects').select('id, level_id, name, status, is_required, completion_rule').range(from, to)),
    loadPaged<ComponentRow>( (from, to) => supabase.from('curriculum_subject_components').select('id, subject_id, status, is_required, completion_rule').range(from, to)),
    loadPaged<ItemRow>( (from, to) => supabase.from('curriculum_component_items').select('id, component_id, status, is_required').range(from, to)),
    loadPaged<CourseRow>( (from, to) => supabase.from('courses').select('id, curriculum_id, level_id, code, name, description, status').order('name').range(from, to)),
    loadPaged<ClassRow>( (from, to) => supabase.from('classes').select('id, course_id, branch_id, status, start_date').range(from, to)),
    loadPaged<EnrollmentRow>( (from, to) => supabase.from('enrollments').select('class_id, status').range(from, to)),
    loadPaged<BranchRow>( (from, to) => supabase.from('branches').select('id, name').range(from, to)),
  ])

  const programFailed = Boolean(curriculums.error || levels.error || subjects.error || components.error || items.error)
  const courseFailed = Boolean(courses.error || classes.error || enrollments.error || branches.error)
  const usageFailed = Boolean(courses.error)

  const levelRows = (levels.data ?? []) as LevelRow[]
  const subjectRows = (subjects.data ?? []) as SubjectRow[]
  const componentRows = (components.data ?? []) as ComponentRow[]
  const itemRows = (items.data ?? []) as ItemRow[]
  const courseRows = (courses.data ?? []) as CourseRow[]
  const classRows = (classes.data ?? []) as ClassRow[]
  const enrollmentRows = (enrollments.data ?? []) as EnrollmentRow[]
  const branchName = new Map(((branches.data ?? []) as BranchRow[]).map(branch => [branch.id, branch.name]))

  const levelsByProgram = new Map<string, LevelRow[]>()
  for (const level of levelRows) {
    const list = levelsByProgram.get(level.curriculum_id) ?? []
    list.push(level)
    levelsByProgram.set(level.curriculum_id, list)
  }
  const subjectsByLevel = countBy(subjectRows.filter(subject => subject.status === 'ACTIVE'), row => row.level_id)
  const lessonTotals = new Map<string, { requiredActive: number; active: number }>()
  for (const item of itemRows) {
    const current = lessonTotals.get(item.component_id) ?? { requiredActive: 0, active: 0 }
    if (item.status === 'ACTIVE') {
      current.active += 1
      if (item.is_required) current.requiredActive += 1
    }
    lessonTotals.set(item.component_id, current)
  }
  const subjectLevel = new Map(subjectRows.map(row => [row.id, row.level_id]))
  const levelProgram = new Map(levelRows.map(row => [row.id, row.curriculum_id]))

  const programs: ProgramView[] = ((curriculums.data ?? []) as CurriculumRow[]).map(curriculum => {
    const programLevels = levelsByProgram.get(curriculum.id) ?? []
    const programSubjects = subjectRows.filter(subject => levelProgram.get(subject.level_id) === curriculum.id)
    const programComponents = componentRows.filter(component => {
      const levelId = subjectLevel.get(component.subject_id)
      return levelId ? levelProgram.get(levelId) === curriculum.id : false
    })
    const lessonCount = programComponents.reduce((sum, component) => sum + (lessonTotals.get(component.id)?.active ?? 0), 0)
    const activeLevels = levelRows.filter(level => level.curriculum_id === curriculum.id && level.status === 'ACTIVE')
    const levelsMissingSubjects = activeLevels.filter(level => (subjectsByLevel.get(level.id) ?? 0) === 0).length
    const healthBySubject = new Map<string, HealthSubject>()
    const healthSubjects: HealthSubject[] = programSubjects.map(subject => {
      const own = programComponents.filter(component => component.subject_id === subject.id)
      const healthSubject: HealthSubject = {
        status: subject.status,
        completionRule: subject.completion_rule,
        activeLessonCount: own.reduce((sum, component) => sum + (lessonTotals.get(component.id)?.active ?? 0), 0),
        components: own.map(component => ({
          status: component.status,
          isRequired: component.is_required,
          completionRule: component.completion_rule,
          requiredActiveLessons: lessonTotals.get(component.id)?.requiredActive ?? 0,
        })),
      }
      healthBySubject.set(subject.id, healthSubject)
      return healthSubject
    })
    const attention: AttentionFact[] = []
    const levelFacts: LevelFact[] = programLevels.map(level => {
      const ownSubjects = programSubjects.filter(subject => subject.level_id === level.id)
      const ownHealth = ownSubjects.map(subject => healthBySubject.get(subject.id)).filter((row): row is HealthSubject => Boolean(row))
      const ownComponents = programComponents.filter(component => ownSubjects.some(subject => subject.id === component.subject_id))
      const activeSubjectCount = ownSubjects.filter(subject => subject.status === 'ACTIVE').length
      for (const subject of ownSubjects) {
        const healthSubject = healthBySubject.get(subject.id)
        if (!healthSubject || subject.status !== 'ACTIVE') continue
        if (!subjectAcademicValid(healthSubject)) {
          attention.push({ levelId: level.id, levelName: level.name, subjectId: subject.id, subjectName: subject.name, kind: 'structure' })
        }
        if (!subjectContentReady(healthSubject)) {
          attention.push({ levelId: level.id, levelName: level.name, subjectId: subject.id, subjectName: subject.name, kind: 'content' })
        }
      }
      return {
        id: level.id,
        name: level.name,
        sequence: level.sequence_no,
        status: level.status,
        code: level.code,
        levelType: level.level_type,
        levelNumber: level.level_number,
        completionRule: level.completion_rule,
        subjectCount: ownSubjects.length,
        componentCount: ownComponents.filter(component => component.status === 'ACTIVE').length,
        activeLessonCount: ownComponents.reduce((sum, component) => sum + (lessonTotals.get(component.id)?.active ?? 0), 0),
        health: levelAcademicHealth({ status: level.status, activeSubjectCount, subjects: ownHealth }),
      }
    }).sort((a, b) => a.sequence - b.sequence)
    const subjectsMissingLessons = healthSubjects.filter(subject => subject.status === 'ACTIVE' && !subjectContentReady(subject)).length
    const contentReady = healthSubjects.filter(subject => subject.status === 'ACTIVE').every(subjectContentReady)
    const health = programAcademicHealth({
      activeLevelCount: activeLevels.length,
      activeLevelsMissingActiveSubjects: levelsMissingSubjects,
      subjects: healthSubjects,
    })
    return {
      id: curriculum.id,
      code: curriculum.code,
      name: curriculum.name,
      description: curriculum.description,
      status: curriculum.status,
      path: hierarchyPath(levelFacts),
      meta: structureMeta(programLevels.length, programSubjects.length, lessonCount),
      health,
      healthLabel: healthLabel(health),
      contentLabel: contentReadinessLabel(contentReady),
      levelCount: programLevels.length,
      subjectCount: programSubjects.length,
      componentCount: programComponents.filter(component => component.status === 'ACTIVE').length,
      lessonCount,
      courseCount: courseRows.filter(course => course.curriculum_id === curriculum.id).length,
      levelsMissingSubjects,
      subjectsMissingLessons,
      levels: levelFacts,
      attention,
    }
  })

  const classesByCourse = new Map<string, ClassFact[]>()
  for (const row of classRows) {
    const list = classesByCourse.get(row.course_id) ?? []
    list.push({ courseId: row.course_id, status: row.status, startDate: row.start_date, branchId: row.branch_id })
    classesByCourse.set(row.course_id, list)
  }
  const classCourse = new Map(classRows.map(row => [row.id, row.course_id]))
  const enrollmentsByCourse = new Map<string, number>()
  for (const enrollment of enrollmentRows) {
    if (enrollment.status === 'WITHDRAWN') continue
    const courseId = classCourse.get(enrollment.class_id)
    if (!courseId) continue
    enrollmentsByCourse.set(courseId, (enrollmentsByCourse.get(courseId) ?? 0) + 1)
  }
  const levelName = new Map(levelRows.map(level => [level.id, level.name]))
  const curriculumName = new Map(((curriculums.data ?? []) as CurriculumRow[]).map(row => [row.id, row.name]))

  const courseViews: CourseView[] = courseRows.map(course => {
    const delivery = courseDelivery(classesByCourse.get(course.id) ?? [], today)
    const branches = [...new Set((classesByCourse.get(course.id) ?? []).map(row => row.branchId).filter((id): id is string => Boolean(id)).map(id => branchName.get(id) ?? '—'))]
    return {
      id: course.id,
      code: course.code,
      name: course.name,
      description: course.description,
      status: course.status,
      curriculumId: course.curriculum_id,
      curriculumName: curriculumName.get(course.curriculum_id) ?? null,
      levelName: course.level_id ? levelName.get(course.level_id) ?? null : null,
      classCount: delivery.classCount,
      enrollmentCount: enrollmentsByCourse.get(course.id) ?? 0,
      branches,
      starting: delivery.starting,
      ended: delivery.ended,
      needsClass: course.status === 'ACTIVE' && delivery.needsClass,
    }
  })

  const activePrograms = programs.filter(program => program.status === 'ACTIVE')
  const metrics = {
    programs: [
      { id: 'active', title: 'Chương trình đang hoạt động', value: shownCount(programFailed, programs.filter(program => program.status === 'ACTIVE').length) },
      { id: 'gap', title: 'Chương trình cần bổ sung cấu trúc học thuật', value: shownCount(programFailed, activePrograms.filter(program => program.health === 'incomplete').length) },
      { id: 'used', title: 'Khóa học đang sử dụng chương trình', value: shownCount(programFailed || usageFailed, courseRows.length) },
      { id: 'unused', title: 'Chương trình chưa được sử dụng', value: shownCount(programFailed || usageFailed, activePrograms.filter(program => program.courseCount === 0).length) },
    ],
    courses: [
      { id: 'active', title: 'Khóa học đang hoạt động', value: shownCount(courseFailed, courseViews.filter(course => course.status === 'ACTIVE').length) },
      { id: 'starting', title: 'Sắp bắt đầu', value: shownCount(courseFailed, courseViews.filter(course => course.starting).length) },
      { id: 'ended', title: 'Đã kết thúc', value: shownCount(courseFailed, courseViews.filter(course => course.ended).length) },
      { id: 'attention', title: 'Cần xử lý', value: shownCount(courseFailed, courseViews.filter(course => course.needsClass).length) },
    ],
  }

  const programLevelsMissing = programs.filter(program => program.levelCount === 0).length
  const levelsWithoutSubjects = programs.filter(program => program.levelsMissingSubjects > 0).length
  const subjectsWithoutLessons = programs.reduce((sum, program) => sum + program.subjectsMissingLessons, 0)

  return {
    failed: { programs: programFailed, courses: courseFailed },
    programs,
    courses: courseViews,
    metrics,
    queue: {
      programs: [
        { id: 'no-level', label: `${programFailed ? '—' : programLevelsMissing} chương trình chưa có cấp độ`, hrefGap: 'no-level' },
        { id: 'level-subject', label: `${programFailed ? '—' : levelsWithoutSubjects} chương trình có cấp độ chưa có môn học`, hrefGap: 'level-subject' },
        { id: 'lesson', label: `${programFailed ? '—' : subjectsWithoutLessons} môn chưa có nội dung Lesson`, hrefGap: 'lesson' },
      ],
      courses: [
        { id: 'no-class', label: `${courseFailed ? '—' : courseViews.filter(course => course.needsClass).length} khóa học chưa có lớp`, hrefGap: 'no-class' },
      ],
    },
    today,
  }
}
