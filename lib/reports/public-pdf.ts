import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderLearningPdf } from './pdf'
import { REPORT_LINK_PATTERN, REPORT_PDF_BUCKET, reportPdfHeaders } from './public-link'

export type ReportAdmin = Pick<SupabaseClient, 'rpc' | 'storage'>
type Asset = { report_id: string; version: number; path: string | null; sha256: string | null; bytes: number | null; state: string }
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const validPdf = (bytes: Buffer) => bytes.length > 5 && bytes.length <= 10_485_760 && bytes.subarray(0, 5).toString() === '%PDF-'

/** Durable claim plus immutable storage path: a worker crash never replaces a published PDF. */
export async function prepareLearningReportPdf(admin: ReportAdmin, reportId: string) {
  const { data: claim, error } = await admin.rpc('claim_learning_report_pdf', { p_report: reportId })
  if (error) throw new Error('PDF_CLAIM_UNAVAILABLE')
  if (!claim || claim.state !== 'CLAIMED') return claim?.state ?? 'UNAVAILABLE'
  try {
    const bucket = admin.storage.from(REPORT_PDF_BUCKET)
    const existing = await bucket.download(claim.path)
    let bytes: Buffer
    if (existing.data) bytes = Buffer.from(await existing.data.arrayBuffer())
    else {
      // Missing objects are recoverable; storage outages must not be mistaken for absence.
      if (!existing.error || !['404', '400'].includes(String((existing.error as { statusCode?: string }).statusCode)) || !/not found|does not exist/i.test(existing.error.message)) throw new Error('PDF_STORAGE_UNAVAILABLE')
      bytes = await renderLearningPdf(claim.document)
      if (!validPdf(bytes)) throw new Error('PDF_INVALID')
      const saved = await bucket.upload(claim.path, bytes, { contentType: 'application/pdf', upsert: false, cacheControl: '0' })
      if (saved.error) {
        // Another expired lease may have completed its upload. Reuse its exact bytes.
        const recovered = await bucket.download(claim.path)
        if (!recovered.data) throw new Error('PDF_STORAGE_UNAVAILABLE')
        bytes = Buffer.from(await recovered.data.arrayBuffer())
      }
    }
    if (!validPdf(bytes)) throw new Error('PDF_INVALID')
    const finished = await admin.rpc('finish_learning_report_pdf', { p_report: reportId, p_lease: claim.lease, p_sha256: digest(bytes), p_bytes: bytes.length })
    if (finished.error || finished.data !== true) throw new Error('PDF_COMMIT_UNAVAILABLE')
    return 'READY'
  } catch {
    await admin.rpc('finish_learning_report_pdf', { p_report: reportId, p_lease: claim.lease }).then(() => {}, () => {})
    throw new Error('PDF_PREPARATION_FAILED')
  }
}

/** No session, cookie, user lookup or auth redirect. Possession of the link grants this PDF only. */
export async function serveLearningReportPdf(request: Request, token: string, admin: ReportAdmin) {
  const message = (status: number, text: string) => new Response(request.method === 'HEAD' ? null : text, { status, headers: { ...reportPdfHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
  if (!REPORT_LINK_PATTERN.test(token)) return message(404, 'Liên kết báo cáo không còn khả dụng.')
  try {
    const resolved = await admin.rpc('resolve_learning_report_pdf', { p_token: token })
    if (resolved.error) throw new Error('PDF_LOOKUP_UNAVAILABLE')
    let asset = resolved.data as Asset | null
    if (!asset) return message(404, 'Liên kết báo cáo không còn khả dụng.')
    if (asset.state !== 'READY') {
      await prepareLearningReportPdf(admin, asset.report_id)
      const refreshed = await admin.rpc('resolve_learning_report_pdf', { p_token: token })
      if (refreshed.error) throw new Error('PDF_LOOKUP_UNAVAILABLE')
      asset = refreshed.data as Asset | null
    }
    if (!asset) return message(404, 'Liên kết báo cáo không còn khả dụng.')
    if (asset.state !== 'READY' || !asset.path) return message(503, 'Báo cáo đang được chuẩn bị. Vui lòng mở lại sau ít phút.')
    const stored = await admin.storage.from(REPORT_PDF_BUCKET).download(asset.path)
    if (!stored.data || stored.error) throw new Error('PDF_STORAGE_UNAVAILABLE')
    const bytes = Buffer.from(await stored.data.arrayBuffer())
    if (!validPdf(bytes) || bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error('PDF_INTEGRITY_FAILED')
    const checked = await admin.rpc('resolve_learning_report_pdf', { p_token: token })
    if (checked.error) throw new Error('PDF_LOOKUP_UNAVAILABLE')
    if (!checked.data) return message(404, 'Liên kết báo cáo không còn khả dụng.')
    if (request.method !== 'HEAD') {
      // This is a file request (including possible previews/bots), never a verified parent read.
      await admin.rpc('note_learning_report_pdf_request', { p_token: token }).then(() => {}, () => {})
    }
    const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: {
      ...reportPdfHeaders, 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.length),
      'Content-Disposition': `${disposition}; filename="VIBE-report-v${asset.version}.pdf"`,
    } })
  } catch { return message(503, 'Chưa tải được báo cáo. Vui lòng thử lại sau.') }
}
