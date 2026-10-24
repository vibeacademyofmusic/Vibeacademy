import plan from './piano-sight-reading-2025-2026.json'

export type SightReadingPiece = {
  code: string
  grade: number
  lessonCode: string
  title: string
  parameters: string
  sourceLabel: string
  materialStatus: 'MISSING' | 'READY'
}

export type SightReadingLesson = {
  grade: number
  sort: number
  code: string
  topic: string
  nameVi: string
  nameEn: string
  objective: string
  inherited: string
  introduced: string
  teacher: string
  steps: string[]
  errors: string[]
  checklist: string[]
  scope: { keys: string; times: string; hands: string; length: string; features: string }
  pieces: SightReadingPiece[]
  source: string
  printedPages: string
  pdfPages: string
  checkedOn: string
  materialNote: string
}

type GradeRow = {
  grade: number
  label: string
  introduced: { lengths: unknown[]; times: string[]; keys: string[]; hands: string | null; features: string[]; repeated: string[] }
  cumulative: { lengths: { bars: string; time: string | null; approximate: boolean }[]; times: string[]; keys: string[]; hands: string[]; features: string[] }
  lengthNote: string
}

export const sightReadingPlan = plan as {
  source: { title: string; file: string; url: string; printedPages: string; pdfPages: string; valid: string; checkedOn: string; comparison: string; sha256: string }
  preparation: string
  glossary: [string, string][]
  dynamics: [string, string][]
  durations: [string, string][]
  grades: GradeRow[]
  lessons: SightReadingLesson[]
}

const lessons = new Map(sightReadingPlan.lessons.map(lesson => [lesson.code, lesson]))

export function isPianoGradeSightReading(programCode: string, levelCode: string, familyCode: string) {
  return programCode === 'PIANO' && /^GRADE_[1-8]$/.test(levelCode) && familyCode === 'SIGHTREADING'
}

export function sightReadingLesson(code?: string | null) {
  return code ? lessons.get(code) : undefined
}

export function sightReadingGrade(grade: number) {
  return sightReadingPlan.grades.find(row => row.grade === grade)
}

export function sightReadingLessonsForGrade(grade: number) {
  return sightReadingPlan.lessons.filter(lesson => lesson.grade === grade)
}
