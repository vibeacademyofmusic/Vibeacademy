type SiteEnvironment = Record<string, string | undefined>

export function recoveryRedirectUrl(env: SiteEnvironment = process.env) {
  const configured = env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_APP_URL
  const staging = env.VIBE_PILOT_ENVIRONMENT === 'staging' || env.NEXT_PUBLIC_SUPABASE_URL === 'https://owpfqwdrmyzcmjahehek.supabase.co'
  const local = env.NODE_ENV === 'development' && !env.VERCEL
  const value = configured || (staging ? 'https://staging.vibe.edu.vn' : local ? 'http://localhost:3000' : '')
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(local && loopback && url.protocol === 'http:')) ||
      (!local && loopback) || url.hostname.endsWith('.vercel.app') ||
      (staging && url.origin !== 'https://staging.vibe.edu.vn')) {
    throw new Error('RECOVERY_SITE_URL_INVALID')
  }
  return `${url.origin}/auth/update-password`
}
