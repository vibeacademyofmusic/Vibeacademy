import { timingSafeEqual } from 'node:crypto'
import { maintainZaloCredentials } from '@/lib/integrations/zalo/maintenance'
import { maintainTuitionZaloResponses } from '@/lib/integrations/zalo/tuition-response-sync'
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
    let replies: { state: string } = { state: 'UNAVAILABLE' }
    try { replies = await maintainTuitionZaloResponses(admin) } catch { replies = { state: 'UNAVAILABLE' } }
    return Response.json({ ...credentials, replies }, { headers: { 'Cache-Control': 'no-store' } })
  }
  catch { return Response.json({ result: 'MAINTENANCE_UNAVAILABLE' }, { status: 503 }) }
}
