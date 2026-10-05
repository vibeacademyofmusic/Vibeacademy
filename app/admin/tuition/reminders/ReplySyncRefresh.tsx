'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function ReplySyncRefresh({ paused = false }: { paused?: boolean } = {}) {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => {
      if (!paused && document.visibilityState === 'visible') router.refresh()
    }
    const timer = window.setInterval(refresh, 20000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router, paused])
  return null
}
