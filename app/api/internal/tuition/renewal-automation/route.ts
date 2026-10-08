import { timingSafeEqual } from 'node:crypto'
import { runTuitionRenewalAutomation } from '@/lib/integrations/tuition/auto-renewal'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const supplied = Buffer.from(request.headers.get('authorization') ?? ''), wanted = Buffer.from(`Bearer ${expected ?? ''}`)
  if (!expected || supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return Response.json({ ok: false }, { status: 401 })
  try { return Response.json(await runTuitionRenewalAutomation(zaloServiceClient()), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ state: 'UNAVAILABLE' }, { status: 503 }) }
}
