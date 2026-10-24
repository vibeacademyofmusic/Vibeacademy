import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // Only the bearer PDF endpoint bypasses session refresh. All portal routes retain auth.
  if (/^\/r\/learning\/[0-9a-f]{64}\/pdf$/.test(request.nextUrl.pathname)) return NextResponse.next()
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
