// Pilot and every non-production process block provider calls unless an
// explicit local override is set. Production (VERCEL_ENV=production) keeps
// its existing gates when ZALO_PILOT_OUTBOUND is unset.

export const ZALO_PILOT_OUTBOUND_DISABLED = 'ZALO_PILOT_OUTBOUND_DISABLED'

export function zaloPilotOutboundBlocked(env: NodeJS.ProcessEnv = process.env) {
  if (env.ZALO_PILOT_OUTBOUND === 'disabled') return true
  if (env.ZALO_PILOT_OUTBOUND === 'enabled') return false
  return env.VERCEL_ENV !== 'production'
}
