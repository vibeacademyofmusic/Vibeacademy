'use client'

import { useEffect } from 'react'

export function PayosAwaiting({ pending }: { pending: boolean }) {
  useEffect(() => {
    if (!pending) return
    const timer = window.setInterval(() => window.location.reload(), 8000)
    return () => window.clearInterval(timer)
  }, [pending])
  if (!pending) return null
  return <p className="text-sm">Đang chờ payOS xác nhận khoản thu. Đường dẫn quay lại không được tính là đã thanh toán.</p>
}
