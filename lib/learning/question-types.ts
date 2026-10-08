// Capability catalogue. Scoring and private answer keys live only in the database.
export const questionTypes = [
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NOTE_IDENTIFICATION',
  'NOTE_PLACEMENT', 'REST_IDENTIFICATION', 'ACCIDENTAL_PLACEMENT', 'KEY_SIGNATURE',
  'SCALE_CONSTRUCTION', 'INTERVAL_CONSTRUCTION', 'TRIAD_CONSTRUCTION',
  'RHYTHM_GROUPING', 'REWRITE', 'ERROR_CORRECTION', 'COMPOSITION', 'MANUAL_REVIEW',
] as const
export type QuestionType = typeof questionTypes[number]
export const automaticQuestionTypes: readonly QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']
export type DeliveredQuestion = {code:string;type:QuestionType;prompt:string;options:string[]|null;points:number;mode:'AUTO'|'HYBRID'|'MANUAL'}
export const assessmentStates: Record<string,string> = {IN_PROGRESS:'Đang làm',PENDING_REVIEW:'Chờ chấm',PASSED:'Đạt',FAILED:'Chưa đạt'}
export const notationQuestionTypes: readonly QuestionType[] = questionTypes.filter(t=>!automaticQuestionTypes.includes(t)&&t!=='MANUAL_REVIEW')
