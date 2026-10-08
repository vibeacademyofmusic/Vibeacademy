'use client'

import { useEffect } from 'react'

/** Older email links can land on /login. Preserve the callback for the dedicated
 * recovery page; never consume recovery credentials into the portal session. */
export default function RecoveryLinkNotice() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.slice(1))
    if (hash.get('type') === 'recovery' || ['error', 'error_code', 'error_description'].some(key => hash.has(key)) || url.searchParams.has('error_code') || url.searchParams.has('code')) {
      window.location.replace(`/auth/update-password${url.search}${url.hash}`)
    }
  }, [])
  return null
}
