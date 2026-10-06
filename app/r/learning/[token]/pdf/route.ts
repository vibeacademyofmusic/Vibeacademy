import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { serveLearningReportPdf } from '@/lib/reports/public-pdf'
import { reportPdfHeaders } from '@/lib/reports/public-link'
import { reviewSamplePdf } from '@/lib/reports/zbs-review-sample'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const sample = reviewSamplePdf(token)
  if (sample) return new Response(request.method === 'HEAD' ? null : new Uint8Array(sample), { headers: { ...reportPdfHeaders, 'Content-Type': 'application/pdf', 'Content-Length': String(sample.length), 'Content-Disposition': 'inline; filename="bao-cao-minh-hoa.pdf"' } })
  try { return await serveLearningReportPdf(request, token, zaloServiceClient()) }
  catch { return new Response(request.method === 'HEAD' ? null : 'Chưa tải được báo cáo. Vui lòng thử lại sau.', { status: 503, headers: reportPdfHeaders }) }
}
export const HEAD = GET
