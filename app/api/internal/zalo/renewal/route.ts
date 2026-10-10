import { timingSafeEqual } from 'node:crypto'
import { maintainZaloCredentials } from '@/lib/integrations/zalo/maintenance'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'

export const runtime = 'nodejs'
export const maxDuration = 60

// Credential rotation only. Tuition delivery, replies, and payment notices
// stay on the manual maintenance route so this schedule cannot message parents.
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const actual = request.headers.get('authorization') ?? ''
  const supplied = Buffer.from(actual), wanted = Buffer.from(`Bearer ${expected ?? ''}`)
  if (!expected || supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return Response.json({ ok: false }, { status: 401 })
  }
  try {
    const credentials = await maintainZaloCredentials(zaloServiceClient())
    return Response.json(credentials, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ result: 'MAINTENANCE_UNAVAILABLE' }, { status: 503 })
  }
}
