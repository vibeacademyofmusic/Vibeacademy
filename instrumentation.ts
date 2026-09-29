// Recovery at server start supplements the independent scheduler, never replaces it.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build' && process.env.ZALO_TOKEN_RENEWAL_ENABLED === 'true') {
    try {
      const { maintainZaloCredentials } = await import('./lib/integrations/zalo/maintenance')
      const { zaloServiceClient } = await import('./lib/integrations/zalo/service')
      await maintainZaloCredentials(zaloServiceClient())
    } catch { /* Safe health is persisted by the independent scheduler; no secrets logged. */ }
  }
}
