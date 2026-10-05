import { correlationFromError, writePilotFailure } from './lib/observability/pilot-failure'

// Recovery at server start supplements the independent scheduler, never replaces it.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    try {
      const { zaloServiceClient } = await import('./lib/integrations/zalo/service')
      await zaloServiceClient().rpc('replay_pending_tuition_zalo_clicks', {
        p_oa_id: process.env.ZALO_OA_ID?.trim() ?? '', p_limit: 20,
      })
    } catch { /* Durable pending events remain available for the independent scheduler. */ }
    if (process.env.ZALO_GATEWAY_SSH_HOST?.trim()) {
      const gateway = globalThis as typeof globalThis & { __vibeZaloGatewayApply?: ReturnType<typeof setInterval> }
      if (!gateway.__vibeZaloGatewayApply) {
        const { applyGatewayClicks } = await import('./scripts/zalo/apply-gateway-clicks.cjs')
        const interval = Number(process.env.ZALO_GATEWAY_APPLY_INTERVAL_MS || 15000)
        const run = () => {
          try { applyGatewayClicks(process.env) } catch {
            console.error(JSON.stringify({ component: 'zalo_gateway_apply', outcome: 'failed' }))
          }
        }
        run()
        if (interval >= 15000) gateway.__vibeZaloGatewayApply = setInterval(run, interval)
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build' && process.env.ZALO_TOKEN_RENEWAL_ENABLED === 'true') {
    try {
      const { maintainZaloCredentials } = await import('./lib/integrations/zalo/maintenance')
      const { zaloServiceClient } = await import('./lib/integrations/zalo/service')
      await maintainZaloCredentials(zaloServiceClient())
    } catch { /* Safe health is persisted by the independent scheduler; no secrets logged. */ }
  }
}

// Existing console.error calls stay as they are. This is the one server-error
// record that carries environment, time, and a correlation id. Headers, query
// strings, and error messages are omitted because they can hold secrets or
// student data.
export async function onRequestError(error: unknown) {
  writePilotFailure({ failure: 'SERVER_REQUEST', correlationId: correlationFromError(error) })
}
