import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function continueRequest(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-vibe-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = continueRequest(request)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },

        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )

          supabaseResponse = continueRequest(request)

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )

          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  await supabase.auth.getClaims()

  return supabaseResponse
}
