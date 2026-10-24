import plan from './aural-bilingual.json'

export type Bilingual = { vi: string; en: string }
export type AuralLesson = {
  grade: number
  sort: number
  code: string
  section: string
  stage: string
  mode: 'GUIDED' | 'INDEPENDENT' | 'EXAM'
  memory: boolean
  title: Bilingual
  objective: Bilingual
  explain: Bilingual[]
  teacher: Bilingual
  learner: Bilingual
  prompt: Bilingual
  errors: Bilingual
  fix: Bilingual
  checklist: Bilingual[]
  next: Bilingual
  material: Bilingual
  review: Bilingual
}
export type AuralLanguage = 'both' | 'vi' | 'en'
export const auralPlan = plan as unknown as {
  checkedOn: string
  translation: Bilingual
  sources: Record<string, { title: string; file: string; url: string; printed: string; pdf: string; valid: string; note: string }>
  playNote: Record<string, Bilingual>
  glossary: [string, string][]
  sha256: string
  lessons: AuralLesson[]
}
const byCode = new Map(auralPlan.lessons.map(lesson => [lesson.code, lesson]))
export const auralLanguageLabels: Record<AuralLanguage, Bilingual> = {
  both: { vi: 'Việt–Anh', en: 'Vietnamese–English' },
  vi: { vi: 'Tiếng Việt', en: 'Vietnamese' },
  en: { vi: 'Tiếng Anh', en: 'English' },
}
export function isGradeAural(programCode: string, levelCode: string, familyCode: string) {
  return ['PIANO', 'GUITAR', 'VIOLIN'].includes(programCode) && /^GRADE_[1-8]$/.test(levelCode) && (familyCode === 'AURAL' || familyCode === 'AURAL_SKILLS')
}
export function auralLesson(code?: string | null) {
  return code ? byCode.get(code) : undefined
}
export function auralLessonsForGrade(grade: number) {
  return auralPlan.lessons.filter(lesson => lesson.grade === grade)
}
export function auralProgram(name?: string | null) {
  const value = (name || '').toLowerCase()
  if (value.includes('guitar')) return 'GUITAR'
  if (value.includes('violin') || value.includes('vĩ') || value.includes('vi ')) return 'VIOLIN'
  return 'PIANO'
}
