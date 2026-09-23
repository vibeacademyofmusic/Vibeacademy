'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  ZALO_PUBLIC_APP_ID,
  ZALO_PUBLIC_OA_ID,
  ZALO_WIDGET_CALLBACK,
  ZALO_WIDGET_REASON,
  ZALO_WIDGET_UX_ACTIONS,
  zaloCallbackCanActivate,
} from '@/lib/integrations/zalo/widget-public'
import { refreshRegistrationZaloLink, requestRegistrationZaloLink } from '../actions'

export type ZaloConnectionView = {
  link_status: string
  external_link_key: string | null
  linked_at: string | null
  last_verified_at: string | null
  masked_user_id: string | null
}

const UX_ACTIONS = new Set<string>(ZALO_WIDGET_UX_ACTIONS)

function when(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function ZaloConnectionCard({
  applicationId,
  connection,
}: {
  applicationId: string
  connection: ZaloConnectionView
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const status = connection.link_status
  const showWidget = (status === 'PENDING' || status === 'REVIEW') && Boolean(connection.external_link_key)

  useEffect(() => {
    const target = window as unknown as Record<string, ((payload?: { action?: string }) => void) | undefined>
    target[ZALO_WIDGET_CALLBACK] = (payload) => {
      const action = payload?.action ?? null
      if (zaloCallbackCanActivate(action)) return
      if (action && UX_ACTIONS.has(action) && action === 'click_interaction_accepted') {
        setChecking(true)
      }
    }
    return () => {
      delete target[ZALO_WIDGET_CALLBACK]
    }
  }, [])

  useEffect(() => {
    if (!checking || status === 'ACTIVE') return
    const timer = window.setInterval(() => router.refresh(), 2000)
    const stop = window.setTimeout(() => {
      window.clearInterval(timer)
      setChecking(false)
    }, 20000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [checking, router, status])

  useEffect(() => {
    const sdk = (window as Window & { ZaloSocialSDK?: { reload?: () => void } }).ZaloSocialSDK
    sdk?.reload?.()
  }, [connection.external_link_key, showWidget])

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 text-sm">
      <h2 className="font-semibold">KẾT NỐI ZALO</h2>
      {status === 'ACTIVE' ? (
        <div className="mt-3 space-y-2">
          <p className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">Đã kết nối</p>
          <p>ĐÃ KẾT NỐI</p>
          <p>Liên kết lúc {when(connection.linked_at)}</p>
          <p>Xác minh lần cuối {when(connection.last_verified_at)}</p>
          {connection.masked_user_id ? <p>Mã Zalo {connection.masked_user_id}</p> : null}
        </div>
      ) : status === 'REVIEW' ? (
        <div className="mt-3 space-y-3">
          <p className="font-medium">CẦN KIỂM TRA</p>
          <p className="text-gray-600">Không thể hoàn tất kết nối vì Zalo user này đã gắn với một hồ sơ khác.</p>
        </div>
      ) : status === 'PENDING' ? (
        <div className="mt-3 space-y-3">
          <p className="font-medium">ĐANG CHỜ XÁC NHẬN</p>
          <p className="text-gray-600">Kết nối Zalo để nhận xác nhận đăng ký, lịch học và các thông báo từ VIBE Academy.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="font-medium">CHƯA KẾT NỐI</p>
          <p className="text-gray-600">Kết nối Zalo để nhận xác nhận đăng ký, lịch học và các thông báo từ VIBE Academy.</p>
          <form action={requestRegistrationZaloLink}>
            <input type="hidden" name="application_id" value={applicationId} />
            <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Kết nối Zalo</button>
          </form>
        </div>
      )}
      {showWidget ? (
        <div
          className="zalo-consent-widget mt-4"
          data-callback={ZALO_WIDGET_CALLBACK}
          data-oaid={ZALO_PUBLIC_OA_ID}
          data-appid={ZALO_PUBLIC_APP_ID}
          data-user-external-id={connection.external_link_key ?? ''}
          data-reason-msg={ZALO_WIDGET_REASON}
          data-status="show"
        />
      ) : null}
      {status !== 'ACTIVE' && status !== 'NONE' ? (
        <form action={refreshRegistrationZaloLink} className="mt-4">
          <input type="hidden" name="application_id" value={applicationId} />
          <button className="rounded-lg border border-gray-300 px-3 py-2">Kiểm tra trạng thái</button>
        </form>
      ) : null}
      {showWidget ? <Script src="https://sp.zalo.me/plugins/sdk.js" strategy="afterInteractive" /> : null}
    </section>
  )
}
