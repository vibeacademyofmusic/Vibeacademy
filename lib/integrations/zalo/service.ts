import 'server-only';
import { createClient } from '@supabase/supabase-js';
const RENEWABLE_ZALO_STATES = new Set(['READY', 'NEEDS_REFRESH', 'REFRESHING', 'VERIFYING'])

// Manual tuition sends may refresh a live credential. A rejected refresh token cannot.
export async function zaloManualSendBlock() {
    try {
        const { readCredential } = await import('./oauth')
        const credential = await readCredential(zaloServiceClient())
        if (credential?.access_token && credential.refresh_token && RENEWABLE_ZALO_STATES.has(credential.state)) return null
        return 'ZALO_RECONNECT_REQUIRED'
    } catch {
        return 'ZALO_RECONNECT_REQUIRED'
    }
}

export function zaloServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        throw new Error('ZALO_CREDENTIAL_STORE_UNAVAILABLE');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Return only connection metadata to the server-rendered admin page.
export async function readZaloConnectionView() {
    try {
        const { readCredential, identity } = await import('./oauth')
        const admin = zaloServiceClient()
        const c = await readCredential(admin)
        const { data: checks } = await admin.rpc('zalo_connection_evidence', identity(process.env))
        const { data: scheduler } = await admin.rpc('zalo_scheduler_health')
        const schedulerAlive = !!scheduler?.next_check_at && Date.parse(scheduler.next_check_at) + 120000 > Date.now()
        return { checks: (checks ?? []) as { source: string; result: string; checked_at: string; http_status: number | null; provider_error: number | null; oa_matches: boolean | null }[], schedulerAlive, scheduler: scheduler as { checked_at: string; next_check_at: string; result: string } | null, readError: false, accessPresent: !!c?.access_token, refreshPresent: !!c?.refresh_token, ready: c?.state === 'READY' && !!c.expires_at && Date.parse(c.expires_at) > Date.now() + 300_000,
            metadata: c ? { state: c.state, version: c.version, expires_at: c.expires_at, error_code: c.error_code, last_refreshed_at: c.last_refreshed_at ?? null } : null }
    } catch {
        return { checks: [], schedulerAlive: false, scheduler: null, readError: true, accessPresent: false, refreshPresent: false, ready: false, metadata: null }
    }
}
