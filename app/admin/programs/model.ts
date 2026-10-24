export const hierarchy = ['Program', 'Level', 'Subject', 'Lesson'] as const

export function shownCount(failed: boolean, count: number | null) {
  if (failed || count == null) return '—'
  return String(count)
}

export function statusLabel(status: string) {
  if (status === 'ACTIVE') return 'Đang hoạt động'
  if (status === 'INACTIVE') return 'Ngừng hoạt động'
  return status
}

export function statusTone(status: string): 'success' | 'neutral' {
  return status === 'ACTIVE' ? 'success' : 'neutral'
}

export type LevelFact = {
  id: string
  name: string
  sequence: number
  status: string
  code: string
  levelType: string
  levelNumber: number | null
  completionRule: string
  subjectCount: number
  componentCount: number
  activeLessonCount: number
  health: 'ready' | 'incomplete'
}

export type AttentionFact = {
  levelId: string
  levelName: string
  subjectId: string
  subjectName: string
  kind: 'structure' | 'content'
}
export type SubjectFact = { id: string; levelId: string }
export type ComponentFact = { id: string; subjectId: string }
export type LessonFact = { id: string; componentId: string }

export function hierarchyPath(levels: LevelFact[]) {
  const ordered = [...levels].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name))
  if (!ordered.length) return 'Chưa có Level'
  const first = ordered[0].name
  const last = ordered[ordered.length - 1].name
  const span = first === last ? first : `${first} → ${last}`
  return `${span} → Môn → Lesson`
}

export function structureMeta(levelCount: number, subjectCount: number, lessonCount: number) {
  return `${levelCount} Level · ${subjectCount} môn · ${lessonCount} Lesson`
}

export type HealthComponent = {
  status: string
  isRequired: boolean
  completionRule: string
  requiredActiveLessons: number
}

export type HealthSubject = {
  status: string
  completionRule: string
  components: HealthComponent[]
  activeLessonCount: number
}

export function componentItemRuleSatisfied(component: HealthComponent) {
  if (component.status !== 'ACTIVE' || !component.isRequired) return true
  if (component.completionRule !== 'ALL_REQUIRED_ITEMS') return true
  return component.requiredActiveLessons > 0
}

export function subjectHasRequiredActiveComponent(subject: HealthSubject) {
  return subject.components.some(component => component.status === 'ACTIVE' && component.isRequired)
}

export function subjectAcademicValid(subject: HealthSubject) {
  if (subject.status !== 'ACTIVE') return true
  if (subject.completionRule !== 'ALL_REQUIRED_COMPONENTS') return true
  if (!subjectHasRequiredActiveComponent(subject)) return false
  return subject.components
    .filter(component => component.status === 'ACTIVE' && component.isRequired)
    .every(componentItemRuleSatisfied)
}

export function subjectContentReady(subject: HealthSubject) {
  if (subject.status !== 'ACTIVE') return true
  return subject.activeLessonCount > 0
}

export function programAcademicHealth(input: {
  activeLevelCount: number
  activeLevelsMissingActiveSubjects: number
  subjects: HealthSubject[]
}) {
  if (input.activeLevelCount === 0 || input.activeLevelsMissingActiveSubjects > 0) return 'incomplete' as const
  if (input.subjects.some(subject => !subjectAcademicValid(subject))) return 'incomplete' as const
  return 'ready' as const
}

export function levelAcademicHealth(input: {
  status: string
  activeSubjectCount: number
  subjects: HealthSubject[]
}) {
  if (input.status !== 'ACTIVE') return 'ready' as const
  if (input.activeSubjectCount === 0) return 'incomplete' as const
  if (input.subjects.some(subject => !subjectAcademicValid(subject))) return 'incomplete' as const
  return 'ready' as const
}

export function subjectCompletionLabel(rule: string) {
  if (rule === 'ALL_REQUIRED_COMPONENTS') return 'Đánh giá theo nhóm đánh giá'
  if (rule === 'DIRECT_ASSESSMENT') return 'Đánh giá trực tiếp'
  if (rule === 'MANUAL') return 'Thủ công'
  if (rule === 'ALL_REQUIRED_SUBJECTS') return 'Hoàn thành mọi môn bắt buộc'
  return rule
}

export function levelTypeLabel(type: string) {
  if (type === 'FOUNDATION') return 'Nền tảng'
  if (type === 'GRADE') return 'Cấp độ'
  if (type === 'DIPLOMA') return 'Văn bằng'
  if (type === 'OTHER') return 'Khác'
  return type
}

export function requirementLabel(required: boolean) {
  return required ? 'Bắt buộc' : 'Tùy chọn'
}

export function healthLabel(health: 'ready' | 'incomplete') {
  return health === 'ready' ? 'Đủ cấu trúc học thuật' : 'Cần bổ sung cấu trúc học thuật'
}

export function contentReadinessLabel(ready: boolean) {
  return ready ? null : 'Nội dung Lesson chưa đầy đủ'
}

export function showComponentGroups(completionRule: string, components: { status: string }[]) {
  const activeCount = components.filter(component => component.status === 'ACTIVE').length
  if (activeCount > 1) return true
  return completionRule === 'ALL_REQUIRED_COMPONENTS'
}

export function componentRuleLabel(rule: string) {
  if (rule === 'DIRECT_ASSESSMENT') return 'Đánh giá trực tiếp'
  if (rule === 'ALL_REQUIRED_ITEMS') return 'Hoàn thành từ Lesson bắt buộc'
  return rule
}

export type ClassFact = {
  courseId: string
  status: string
  startDate: string | null
  branchId: string | null
}

export function courseDelivery(classes: ClassFact[], today: string) {
  const open = classes.filter(row => row.status !== 'CANCELLED')
  return {
    classCount: classes.length,
    starting: classes.some(row => (row.status === 'DRAFT' || row.status === 'ACTIVE') && Boolean(row.startDate) && row.startDate! > today),
    ended: open.length > 0 && open.every(row => row.status === 'COMPLETED'),
    needsClass: classes.length === 0,
  }
}
