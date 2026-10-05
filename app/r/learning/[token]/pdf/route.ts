import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { serveLearningReportPdf } from '@/lib/reports/public-pdf'
import { reportPdfHeaders } from '@/lib/reports/public-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  try { return await serveLearningReportPdf(request, token, zaloServiceClient()) }
  catch { return new Response(request.method === 'HEAD' ? null : 'Chưa tải được báo cáo. Vui lòng thử lại sau.', { status: 503, headers: reportPdfHeaders }) }
}
export const HEAD = GET
