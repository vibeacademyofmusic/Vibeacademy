// External provider calls are allowed only when this variable is exactly
// "enabled". Missing, empty, false, and every other value stay blocked,
// including when VERCEL_ENV is production.

export const ZALO_PILOT_OUTBOUND_DISABLED = 'ZALO_PILOT_OUTBOUND_DISABLED'

export function zaloPilotOutboundBlocked(env: NodeJS.ProcessEnv = process.env) {
  return env.ZALO_PILOT_OUTBOUND !== 'enabled'
}
