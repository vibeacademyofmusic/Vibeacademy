export const observations = {
  NOT_RECORDED: 'Chưa nhận xét',
  PRACTICING: 'Đang luyện tập',
  NEEDS_REVIEW: 'Cần ôn thêm',
  ACHIEVED: 'Đã thực hiện tốt',
} as const

export type Journal = {
  id: string
  attendance_record_id: string
  content: string
  repertoire: string
  skills: string
  homework: string
  notes: string
  observation: keyof typeof observations
  updated_at: string
}

export type JournalState = { error?: string; success?: string }
