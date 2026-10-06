'use client'

import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | undefined
const recoveryCookie = 'vibe-password-recovery'
export const recoveryProofStore = {
  get: () => window.sessionStorage.getItem('vibe-recovery-session'),
  set: (sessionId: string) => window.sessionStorage.setItem('vibe-recovery-session', sessionId),
}

export function createRecoveryClient() {
  if (!client) client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      isSingleton: false,
      cookieOptions: { name: recoveryCookie, path: '/', sameSite: 'lax', maxAge: 3600, secure: window.location.protocol === 'https:' },
      auth: { detectSessionInUrl: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) },
    },
  )
  return client
}

export async function endRecoverySession() {
  try { await createRecoveryClient().auth.signOut({ scope: 'local' }) } finally {
    // Also clear our isolated cookies if revocation is temporarily unreachable.
    // Never touch the normal application session or its PKCE verifier.
    for (const item of document.cookie.split(';')) {
      const name = item.trim().split('=')[0]
      if (name === recoveryCookie || name.startsWith(`${recoveryCookie}.`) || name.startsWith(`${recoveryCookie}-`)) {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
      }
    }
    window.sessionStorage.removeItem('vibe-recovery-session')
    client = undefined
  }
}
