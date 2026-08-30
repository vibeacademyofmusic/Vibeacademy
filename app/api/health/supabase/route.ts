import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return NextResponse.json(
      {
        connected: false,
        error: 'Missing Supabase environment variables',
      },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: {
        apikey: key,
      },
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)

    return NextResponse.json({
      connected: response.ok,
      status: response.status,
      message: response.ok
        ? 'Vibe Academy System is connected to Supabase'
        : 'Supabase responded, but authentication failed',
      supabase: data,
    })
  } catch {
    return NextResponse.json(
      {
        connected: false,
        message: 'Could not reach Supabase',
      },
      { status: 500 }
    )
  }
}