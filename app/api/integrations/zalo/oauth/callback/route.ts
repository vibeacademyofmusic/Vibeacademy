import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIntegrationAdmin } from '@/app/admin/system/integrations/access'
import { finishAuthorization, callbackUrl } from '@/lib/integrations/zalo/authorization'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { connectionError } from '@/lib/integrations/zalo/oauth'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const db = await requireIntegrationAdmin()
  const { data } = await db.auth.getUser()
  if (!data.user) return new Response(null, { status: 403 })
  const jar = await cookies(), url = new URL(request.url)
  let result: string
  try {
    if (url.origin !== new URL(callbackUrl()).origin) throw new Error('CALLBACK_ORIGIN')
    result = await finishAuthorization(zaloServiceClient(), data.user.id, {
      state: url.searchParams.get('state') ?? '', cookieState: jar.get('vibe_zalo_oauth')?.value ?? '',
      code: url.searchParams.get('code') ?? '', oaId: url.searchParams.get('oa_id') ?? '',
    })
  } catch (error) { result = connectionError(error) }
  jar.delete('vibe_zalo_oauth')
  const target = new URL('/admin/system/integrations/zalo', url.origin)
  target.searchParams.set('result', result)
  const response = NextResponse.redirect(target, 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
