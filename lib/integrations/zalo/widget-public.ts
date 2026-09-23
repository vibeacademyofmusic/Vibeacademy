// Public Zalo widget identifiers. The OA secret is never exported from this module.

export const ZALO_PUBLIC_APP_ID = '1355275380325944240'
export const ZALO_PUBLIC_OA_ID = '4520912928458797082'
export const ZALO_WIDGET_CALLBACK = 'onVibeZaloConsent'
export const ZALO_WIDGET_REASON =
  'VIBE Academy sử dụng Zalo để gửi xác nhận đăng ký, lịch học và thông báo học tập.'

export const ZALO_WIDGET_UX_ACTIONS = [
  'loaded_successfully',
  'click_interaction_accepted',
  'click_followed',
  'dismiss_follow',
  'updated_follow_widget',
] as const

export function zaloCallbackCanActivate(_action: string | null | undefined) {
  return false
}
