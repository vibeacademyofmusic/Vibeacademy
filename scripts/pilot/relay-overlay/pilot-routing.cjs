// Copy beside handler.cjs in the existing relay only after staging cutover approval.
function webhookUpstream(pathname, env) {
  if (pathname === '/api/integrations/zalo/webhook' && env.ZALO_PILOT_WEBHOOK_UPSTREAM?.trim()) {
    return env.ZALO_PILOT_WEBHOOK_UPSTREAM.trim()
  }
  return env.PREVIEW_WEBHOOK_UPSTREAM
}
module.exports = { webhookUpstream }
