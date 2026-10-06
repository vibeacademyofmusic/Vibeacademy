import { timingSafeEqual } from 'node:crypto'
import { readCredential } from '@/lib/integrations/zalo/oauth'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { zaloAccessHeaders } from '@/lib/integrations/zalo/app-secret-proof'
export const runtime = 'nodejs'
export const maxDuration = 30

// Read-only provider verification. Never returns tokens or secrets.
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const supplied = Buffer.from(request.headers.get('authorization') ?? '')
  const wanted = Buffer.from(`Bearer ${expected ?? ''}`)
  if (!expected || supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return Response.json({ ok: false }, { status: 401 })
  const ids = (new URL(request.url).searchParams.get('templates') ?? '645192,645028').split(',').filter(id => /^\d{4,10}$/.test(id)).slice(0, 4)
  const appSecret = process.env.ZALO_APP_SECRET?.trim() ?? ''
  const credential = await readCredential(zaloServiceClient() as never, process.env)
  if (!credential?.access_token || !appSecret) return Response.json({ result: 'NOT_CONFIGURED' })
  const headers = { ...zaloAccessHeaders(credential.access_token, appSecret), accept: 'application/json' }
  const call = async (url: string) => {
    const response = await fetch(url, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const body = await response.json().catch(() => null) as { error?: number; message?: string; data?: unknown } | null
    return { http: response.status, error: body?.error ?? null, message: body?.message ?? null, data: body?.data ?? null }
  }
  const oa = await call('https://openapi.zalo.me/v2.0/oa/getoa')
  const oaData = (oa.data ?? {}) as { oa_id?: unknown }
  const templates: Record<string, unknown> = {}
  for (const id of ids) {
    templates[id] = {
      info: await call(`https://business.openapi.zalo.me/template/info/v2?template_id=${id}`),
      sample: await call(`https://business.openapi.zalo.me/template/sample-data?template_id=${id}`),
    }
  }
  return Response.json({
    credential: { state: credential.state, version: credential.version, appMatch: credential.app_id === (process.env.ZALO_APP_ID ?? '').trim(), oaMatch: String(oaData.oa_id ?? '') === (process.env.ZALO_OA_ID ?? '').trim() },
    oa: { http: oa.http, error: oa.error, message: oa.message },
    templates,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
