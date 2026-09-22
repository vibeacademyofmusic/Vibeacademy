'use server'

import { createClient } from '@/lib/supabase/server'

type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Result<T>> {
  const db = (await createClient()) as any

  const { data, error } = await db.rpc(
    name,
    args,
  )

  if (error) {
    return {
      ok: false,
      error: error.message || 'QR attendance request failed',
    }
  }

  return {
    ok: true,
    data: data as T,
  }
}

export async function getQrBranchesAction() {
  return rpc<any[]>(
    'get_attendance_qr_manageable_branches',
  )
}

export async function getQrStatusAction(
  branchId: string,
) {
  return rpc<any>(
    'get_attendance_qr_status',
    {
      p_branch: branchId,
    },
  )
}

export async function startQrSessionAction(
  branchId: string,
) {
  return rpc<any>(
    'start_attendance_qr_session',
    {
      p_branch: branchId,
    },
  )
}

export async function mintQrTokenAction(
  sessionId: string,
) {
  return rpc<any>(
    'mint_attendance_qr_token',
    {
      p_session: sessionId,
    },
  )
}

export async function stopQrSessionAction(
  sessionId: string,
) {
  return rpc<any>(
    'stop_attendance_qr_session',
    {
      p_session: sessionId,
      p_reason: 'ADMIN_STOP',
    },
  )
}

export async function getQrRecentScansAction(
  branchId: string,
) {
  return rpc<any[]>(
    'get_attendance_qr_recent_scans',
    {
      p_branch: branchId,
      p_limit: 30,
    },
  )
}
