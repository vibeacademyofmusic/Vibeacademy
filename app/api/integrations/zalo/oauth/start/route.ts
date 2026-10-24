import { NextResponse } from 'next/server'
import { requireIntegrationAdmin } from '@/app/admin/system/integrations/access'
import { startAuthorization, callbackUrl } from '@/lib/integrations/zalo/authorization'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { connectionError } from '@/lib/integrations/zalo/oauth'

export const runtime = 'nodejs'

// Native POST navigation preserves the OAuth redirect and HttpOnly state cookie.
async function begin(request: Request) {
  const origin = new URL(request.url).origin
  const db = await requireIntegrationAdmin()
  const { data } = await db.auth.getUser()
  if (!data.user) return new Response(null, { status: 403 })
  try {
    const auth = await startAuthorization(zaloServiceClient(), data.user.id)
    const response = NextResponse.redirect(auth.url, 303)
    response.cookies.set('vibe_zalo_oauth', auth.state, {
      httpOnly: true, secure: callbackUrl().startsWith('https:'), sameSite: 'lax',
      path: '/api/integrations/zalo/oauth/callback', maxAge: 600,
    })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    const target = new URL('/admin/system/integrations/zalo', origin)
    target.searchParams.set('result', connectionError(error))
    return NextResponse.redirect(target, 303)
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 })
  return begin(request)
}

// Owner-facing link; authorization itself still happens on Zalo, with bound state.
export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(null, { status: 403 })
  return begin(request)
}
