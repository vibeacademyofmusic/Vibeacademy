import { timingSafeEqual } from 'node:crypto'
import { maintainZaloCredentials } from '@/lib/integrations/zalo/maintenance'
import { maintainTuitionZaloResponses } from '@/lib/integrations/zalo/tuition-response-sync'
import { runTuitionRenewalAutomation } from '@/lib/integrations/tuition/auto-renewal'
import { reconcilePendingTuitionZaloDeliveries } from '@/lib/integrations/zalo/tuition-delivery-status'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const actual = request.headers.get('authorization') ?? ''
  const supplied = Buffer.from(actual), wanted = Buffer.from(`Bearer ${expected ?? ''}`)
  if (!expected || supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return Response.json({ ok: false }, { status: 401 })
  try {
    const admin = zaloServiceClient()
    const credentials = await maintainZaloCredentials(admin)
    // Provider delivery status is reconciled before reply/renewal work.
    let deliveries: unknown = { state: 'UNAVAILABLE' }
    try { deliveries = await reconcilePendingTuitionZaloDeliveries(admin) } catch { deliveries = { state: 'UNAVAILABLE' } }
    let replies: { state: string } = { state: 'UNAVAILABLE' }
    try { replies = await maintainTuitionZaloResponses(admin) } catch { replies = { state: 'UNAVAILABLE' } }
    let renewals: unknown = { state: 'UNAVAILABLE' }
    try { renewals = await runTuitionRenewalAutomation(admin) } catch { renewals = { state: 'UNAVAILABLE' } }
    return Response.json({ ...credentials, deliveries, replies, renewals }, { headers: { 'Cache-Control': 'no-store' } })
  }
  catch { return Response.json({ result: 'MAINTENANCE_UNAVAILABLE' }, { status: 503 }) }
}
