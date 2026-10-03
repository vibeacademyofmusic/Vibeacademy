export const zaloPublicProfile = {
  oaName: 'Vibe Academy',
  oaId: '4520912928458797082',
  appName: 'VIBE Academy System',
  appId: '1355275380325944240',
  verifiedLabel: 'Đã xác thực',
  packageName: 'Cơ bản',
  zca: 'ZCA-213532',
  packageNote: 'Chưa mở đầy đủ OpenAPI gửi tin. Có thể nâng gói khi bắt đầu outbound messaging.',
} as const

const EVENT_LABELS: Record<string, string> = {
  user_send_text: 'Tin nhắn văn bản',
  user_send_image: 'Hình ảnh',
  user_send_link: 'Liên kết',
  user_send_audio: 'Âm thanh',
  user_send_video: 'Video',
  user_send_sticker: 'Nhãn dán',
  user_send_location: 'Vị trí',
  user_send_business_card: 'Danh thiếp',
  user_send_file: 'Tệp đính kèm',
  user_received_message: 'Người dùng đã nhận tin',
  oa_send_anonymous_text: 'OA gửi văn bản ẩn danh',
  oa_send_anonymous_image: 'OA gửi hình ẩn danh',
  oa_send_anonymous_file: 'OA gửi tệp ẩn danh',
  oa_send_anonymous_sticker: 'OA gửi nhãn dán ẩn danh',
}

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Đã tiếp nhận',
  UNSUPPORTED: 'Chưa hỗ trợ',
}

const PROCESSING_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  PROCESSED: 'Đã xử lý',
  FAILED: 'Lỗi xử lý',
}

const ENTITY_LABELS: Record<string, string> = {
  REGISTRATION: 'Hồ sơ đăng ký',
  PARENT: 'Phụ huynh',
  STUDENT: 'Học viên',
}

const LINK_LABELS: Record<string, string> = {
  PENDING: 'Đang chờ xác nhận',
  ACTIVE: 'Đã kết nối',
  REVOKED: 'Ngắt kết nối',
}

export const connectionLabels = {
  NONE: 'CHƯA KẾT NỐI',
  PENDING: 'ĐANG CHỜ XÁC NHẬN',
  ACTIVE: 'ĐÃ KẾT NỐI',
  REVOKED: 'NGẮT KẾT NỐI',
} as const

export type ZaloConnectionState = keyof typeof connectionLabels

export type ZaloAdminConfig = {
  environmentLabel: string
  webhookPublicLabel: string
  webhookRuntimeLabel: string
  oaSecretConfigured: boolean
  accessTokenConfigured: boolean
  refreshTokenConfigured: boolean
}

type Env = Record<string, string | undefined>

function present(value: string | undefined) {
  return Boolean(value?.trim())
}

export function zaloRuntimeEnvironment(env: Env) {
  if (env.VERCEL_ENV === 'production' || env.VIBE_RUNTIME_ENV === 'production') return 'Production'
  if (env.VERCEL_ENV === 'preview' || env.VIBE_RUNTIME_ENV === 'staging') return 'Staging'
  return 'Cục bộ'
}

export function zaloWebhookPublicLabel(env: Env) {
  const url = env.ZALO_WEBHOOK_PUBLIC_URL?.trim() ?? ''
  return url.startsWith('https://') ? 'Đã cấu hình' : 'Chưa triển khai Staging'
}

export function zaloWebhookRuntimeLabel(env: Env, totalEvents: number) {
  const ready = present(env.ZALO_APP_ID) && present(env.ZALO_OA_ID) && present(env.ZALO_OA_SECRET_KEY)
  if (!ready) return 'Chưa cấu hình'
  if (totalEvents === 0) return 'Đang chờ sự kiện đầu tiên'
  return 'Đã cấu hình'
}

export function readZaloAdminConfig(env: Env, totalEvents: number): ZaloAdminConfig {
  return {
    environmentLabel: zaloRuntimeEnvironment(env),
    webhookPublicLabel: zaloWebhookPublicLabel(env),
    webhookRuntimeLabel: zaloWebhookRuntimeLabel(env, totalEvents),
    oaSecretConfigured: present(env.ZALO_OA_SECRET_KEY),
    accessTokenConfigured: present(env.ZALO_OA_ACCESS_TOKEN),
    refreshTokenConfigured: present(env.ZALO_OA_REFRESH_TOKEN),
  }
}

export function maskOperationalText(value: string | null | undefined) {
  if (!value?.trim()) return null
  return value
    .replace(/eyJ[A-Za-z0-9_-]{8,}/g, '[đã ẩn]')
    .replace(/(access_token|refresh_token|app_secret|oa_secret|secret_key|service_role)(\s*[:=]\s*)\S+/gi, '$1$2[đã ẩn]')
    .slice(0, 180)
}

export function formatAdminTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function eventTypeLabel(value: string) {
  return EVENT_LABELS[value] ?? 'Sự kiện khác'
}

export function eventStatusLabel(value: string) {
  return STATUS_LABELS[value] ?? 'Chưa rõ'
}

export function processingLabel(value: string) {
  return PROCESSING_LABELS[value] ?? 'Chờ xử lý'
}

export function entityLabel(value: string) {
  return ENTITY_LABELS[value] ?? 'Khách hàng'
}

export function linkStatusLabel(value: string) {
  return LINK_LABELS[value] ?? 'Chưa kết nối'
}

export function connectionState(value: string | null | undefined): ZaloConnectionState {
  if (value === 'PENDING' || value === 'ACTIVE' || value === 'REVOKED') return value
  return 'NONE'
}

export const outboundEvents = [
  'Hoàn tất đăng ký',
  'Xác nhận thanh toán',
  'Đã xếp lớp',
  'Phát hành báo cáo học tập',
  'Nhắc học phí',
  'Khóa học sắp hết hạn',
] as const
