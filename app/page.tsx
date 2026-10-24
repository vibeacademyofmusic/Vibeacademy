'use client'

import { useEffect } from 'react'

const recoveryKeys = ['error', 'error_code', 'error_description', 'code', 'token_hash']

export default function HomePage() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.slice(1))
    const recovery = hash.get('type') === 'recovery' || recoveryKeys.some(key => url.searchParams.has(key) || hash.has(key))
    window.location.replace(recovery ? `/auth/update-password${url.search}${url.hash}` : '/login')
  }, [])
  return null
}
