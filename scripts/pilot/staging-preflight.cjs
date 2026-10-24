// Run in the staging build environment. Never loads local .env files or prints values.
const EXISTING_STAGING_REF = 'owpfqwdrmyzcmjahehek'
const PRODUCTION_REF = 'qhznfywwrhmcwbkujclm'
function check(env) {
  const errors = []
  const expectedRef = env.VIBE_PILOT_APPROVED_SUPABASE_REF || EXISTING_STAGING_REF
  if (!/^[a-z]{20}$/.test(expectedRef) || expectedRef === PRODUCTION_REF) errors.push('Approved non-production project reference required')
  if (env.VERCEL_ENV !== 'preview') errors.push('VERCEL_ENV must be preview')
  if (env.VIBE_PILOT_ENVIRONMENT !== 'staging') errors.push('Staging acknowledgement missing')
  let url
  try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL) } catch {}
  if (!url || url.protocol !== 'https:' || url.hostname !== `${expectedRef}.supabase.co` || url.username || url.password || url.search || url.hash || url.pathname !== '/') errors.push('Approved staging database URL required')
  for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ZALO_OA_SECRET_KEY']) if (!env[key]?.trim()) errors.push(`${key} missing`)
  if (env.ZALO_APP_ID !== '1355275380325944240' || env.ZALO_OA_ID !== '4520912928458797082') errors.push('Pilot App/OA scope mismatch')
  if (env.ZALO_TEMPLATE_SEND_ENABLED !== 'false') errors.push('Template dispatch must remain disabled')
  if (env.ZALO_PILOT_OUTBOUND !== 'disabled') errors.push('Outbound must remain disabled')
  if (env.ZALO_TOKEN_RENEWAL_ENABLED !== 'false') errors.push('Credential renewal must remain disabled until ownership handoff')
  return errors
}
if (require.main === module) {
  const errors = check(process.env)
  console.log(JSON.stringify({ready: errors.length === 0, errors}))
  if (errors.length) process.exitCode = 1
}
module.exports = { check }
