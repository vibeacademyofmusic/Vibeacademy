export const TUITION_REPLY_CONTINUE = 'Tiếp tục học'
export const TUITION_REPLY_CONTACT = 'Liên hệ'
export const TUITION_REPLY_OTHER = 'Yêu cầu khác'
export const TUITION_REPLY_STOP = 'Dừng học'
export const TUITION_CONTACT_STATUS = 'Cần liên hệ'
export const TUITION_REPLY_SOURCE = 'Zalo ZBS'
export const TUITION_REPLY_EVENT = 'user_click_response_button'

// Official live 645192 contract. Historical aliases are parser-only compatibility and are never advertised for new sends.
export const TUITION_BUTTON_CONTINUE_V2 = TUITION_REPLY_CONTINUE
export const TUITION_BUTTON_CONTACT_V2 = TUITION_REPLY_CONTACT

const BUTTONS = {
  [TUITION_BUTTON_CONTINUE_V2]: 'CONTINUE',
  [TUITION_BUTTON_CONTACT_V2]: 'CONTACT',
  [TUITION_REPLY_OTHER]: 'CONTACT',
  [TUITION_REPLY_STOP]: 'STOP',
  'Tiếp Tục Học': 'CONTINUE',
  'Liên Hệ': 'CONTACT',
} as const

export type TuitionReplyChoice = 'CONTINUE' | 'CONTACT' | 'STOP'

export type TuitionReplyEvent = {
  id: string
  seq: number
  reminderId: string
  studentId: string
  choice: TuitionReplyChoice
  submitTime: string
  receivedAt: string
}

export function tuitionLiveTemplateButtons() {
  return [TUITION_BUTTON_CONTINUE_V2, TUITION_BUTTON_CONTACT_V2]
}

export function tuitionReplacementButtons() {
  return tuitionLiveTemplateButtons()
}

export function tuitionReplyButtons() {
  return [TUITION_REPLY_CONTINUE, TUITION_REPLY_OTHER, TUITION_REPLY_STOP]
}

export function tuitionReplyButtonFits(label: string) {
  const length = Array.from(label).length
  return length >= 5 && length <= 30 && !label.includes('<') && !label.includes('>')
}

export function tuitionReplyChoice(buttonData: string): TuitionReplyChoice | null {
  return BUTTONS[buttonData as keyof typeof BUTTONS] ?? null
}

export function tuitionReplyLabel(choice: string | null | undefined) {
  if (choice === 'CONTINUE') return TUITION_REPLY_CONTINUE
  if (choice === 'CONTACT') return TUITION_REPLY_CONTACT
  if (choice === 'STOP') return TUITION_REPLY_STOP
  return 'Chưa phản hồi'
}

export function tuitionSendLabel(status: string | null | undefined) {
  if (status === 'SENT') return 'Đã tiếp nhận'
  if (status === 'DELIVERED') return 'Đã phát đến máy'
  if (status === 'FAILED') return 'Gửi lỗi'
  if (status === 'PREPARED') return 'Đã tạo mã theo dõi'
  return 'Chưa gửi'
}

export function tuitionDispatchStatusLabel(status: string | null | undefined) {
  if (status === 'SENT' || status === 'DELIVERED') return 'Đã gửi'
  if (status === 'FAILED') return 'Gửi thất bại'
  return 'Chưa gửi'
}

export function tuitionNoticeReplyLabel(
  sendStatus: string | null | undefined,
  choice: string | null | undefined,
  sync: 'healthy' | 'failing' = 'healthy',
) {
  if (choice === 'CONTINUE') return TUITION_REPLY_CONTINUE
  if (choice === 'CONTACT') return TUITION_REPLY_OTHER
  if (choice === 'STOP') return TUITION_REPLY_STOP
  // Channel health cannot establish whether this parent clicked a button.
  // Keep the legacy argument for callers; channel failures are shown separately.
  void sync
  void sendStatus
  return 'Chưa phản hồi'
}

export type TuitionResponseSyncStatus = {
  activated: boolean
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastErrorCode: string | null
  lastErrorDetail: string | null
  authBackoffUntil: string | null
  checkpointMs: number | null
  intervalSeconds: number | null
  webhookClicks: number
  webhookPending: number
  credentialAppId: string | null
  credentialOaId: string | null
}

export function readTuitionResponseSyncStatus(value: unknown): TuitionResponseSyncStatus | null {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const numberOrNull = (item: unknown) => typeof item === 'number' && Number.isFinite(item) ? item : null
  const textOrNull = (item: unknown) => typeof item === 'string' && item.length > 0 ? item : null
  return {
    activated: row.activated === true,
    lastSuccessAt: textOrNull(row.last_success_at),
    lastErrorAt: textOrNull(row.last_error_at),
    lastErrorCode: textOrNull(row.last_error_code),
    lastErrorDetail: textOrNull(row.last_error_detail),
    authBackoffUntil: textOrNull(row.auth_backoff_until),
    checkpointMs: numberOrNull(row.checkpoint_ms),
    intervalSeconds: numberOrNull(row.interval_seconds),
    webhookClicks: typeof row.webhook_clicks === 'number' ? row.webhook_clicks : 0,
    webhookPending: typeof row.webhook_pending === 'number' ? row.webhook_pending : 0,
    credentialAppId: textOrNull(row.credential_app_id),
    credentialOaId: textOrNull(row.credential_oa_id),
  }
}

export function tuitionResponseSyncFailing(status: TuitionResponseSyncStatus | null) {
  if (!status) return true
  const apiHealthy = status.activated
    && status.lastSuccessAt != null
    && (status.lastErrorAt == null || status.lastErrorAt <= status.lastSuccessAt)
  return !apiHealthy
}

export function webhookEndpointLabel(url: string | undefined) {
  if (!url?.trim()) return 'Chưa lưu webhook URL trong cấu hình máy chủ.'
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/api/integrations/zalo/webhook' || parsed.search || parsed.hash) {
      return 'Webhook đã lưu không phải HTTPS /api/integrations/zalo/webhook.'
    }
    return `Webhook đã lưu: https://${parsed.host}${parsed.pathname}`
  } catch {
    return 'Webhook đã lưu không phải HTTPS /api/integrations/zalo/webhook.'
  }
}

export function oauthCallbackLabel(url: string | undefined) {
  if (!url?.trim()) return 'Chưa lưu callback OAuth.'
  try {
    const parsed = new URL(url.trim())
    return `Callback OAuth đã lưu: ${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return 'Callback OAuth đã lưu không đọc được.'
  }
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
    label: tuitionReplyLabel(choice) as typeof TUITION_REPLY_CONTINUE | typeof TUITION_REPLY_CONTACT | typeof TUITION_REPLY_STOP,
    needsReview: new Set(rows.map(row => row.choice)).size > 1,
    submitTime: ranked[0].submitTime,
    studentId: ranked[0].studentId,
  }
}
