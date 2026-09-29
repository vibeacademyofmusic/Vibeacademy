export const TUITION_REPLY_CONTINUE = 'Tiếp tục học'
export const TUITION_REPLY_STOP = 'Dừng học'
export const TUITION_REPLY_SOURCE = 'Zalo ZBS'
export const TUITION_REPLY_EVENT = 'user_click_response_button'

const BUTTONS = {
  [TUITION_REPLY_CONTINUE]: 'CONTINUE',
  [TUITION_REPLY_STOP]: 'STOP',
} as const

export type TuitionReplyChoice = 'CONTINUE' | 'STOP'

export type TuitionReplyEvent = {
  id: string
  seq: number
  reminderId: string
  studentId: string
  choice: TuitionReplyChoice
  submitTime: string
  receivedAt: string
}

export function tuitionReplyButtons() {
  return [TUITION_REPLY_CONTINUE, TUITION_REPLY_STOP]
}

export function tuitionReplyButtonFits(label: string) {
  const length = Array.from(label).length
  return length >= 5 && length <= 30 && !label.includes('<') && !label.includes('>')
}

export function tuitionReplyChoice(buttonData: string): TuitionReplyChoice | null {
  return BUTTONS[buttonData as keyof typeof BUTTONS] ?? null
}

export function tuitionReplyLabel(choice: string | null | undefined) {
  if (choice === 'CONTINUE') return 'Có'
  if (choice === 'STOP') return 'Không'
  return 'Chưa phản hồi'
}

export function tuitionSendLabel(status: string | null | undefined) {
  if (status === 'SENT') return 'Đã gửi'
  if (status === 'DELIVERED') return 'Đã phát đến máy'
  if (status === 'FAILED') return 'Gửi lỗi'
  if (status === 'PREPARED') return 'Đã tạo mã theo dõi'
  return 'Chưa gửi'
}

export function tuitionReplyEventKey(trackingId: string, submitTime: string, buttonData: string, messageId: string) {
  return `${trackingId}:${submitTime}:${buttonData}:${messageId}`
}

export function currentTuitionReply(events: TuitionReplyEvent[], reminderId: string) {
  const rows = events.filter(row => row.reminderId === reminderId)
  if (!rows.length) {
    return { choice: null, label: 'Chưa phản hồi' as const, needsReview: false, submitTime: null, studentId: null }
  }
  const ranked = [...rows].sort((left, right) => {
    if (left.submitTime !== right.submitTime) return left.submitTime < right.submitTime ? 1 : -1
    if (left.receivedAt !== right.receivedAt) return left.receivedAt < right.receivedAt ? 1 : -1
    return left.seq < right.seq ? 1 : -1
  })
  const choice = ranked[0].choice
  return {
    choice,
    label: tuitionReplyLabel(choice) as 'Có' | 'Không',
    needsReview: new Set(rows.map(row => row.choice)).size > 1,
    submitTime: ranked[0].submitTime,
    studentId: ranked[0].studentId,
  }
}
