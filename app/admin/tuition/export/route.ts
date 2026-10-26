import { adminClient, vietnamDateTime } from '../../finance/operations'
import { sourcePeriods } from '../source-periods'
import { sourcePeriodsCsv } from '../source-periods-export'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  // Same authorization and branch-scoped RLS as the tuition page.
  const db = await adminClient()
  const query = new URL(request.url).searchParams
  const params = { period_student: query.get('period_student') ?? '', period_state: query.get('period_state') ?? '' }
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' }
  try {
    const today = vietnamDateTime().slice(0, 10)
    const csv = sourcePeriodsCsv(await sourcePeriods(db), today, params)
    return new Response(csv, { headers: { ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vibe-ky-hoc-phi-${today}.csv"`,
    } })
  } catch {
    return new Response('Chưa xuất được danh sách. Vui lòng quay lại trang học phí và thử lại.', { status: 503, headers })
  }
}
