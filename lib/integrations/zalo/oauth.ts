import 'server-only';
import { verifyZaloToken } from './connection';
import { randomUUID } from 'node:crypto';
import { renewalSettings } from './renewal-settings';
export type ZaloAdmin = {
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: unknown;
    }>;
};
export type Credential = {
    app_id: string;
    oa_id: string;
    access_token: string | null;
    refresh_token: string | null;
    expires_at: string | null;
    version: number;
    state: string;
    operation_id: string | null;
    operation_started_at: string | null;
    committed_operation: string | null;
    error_code: string | null;
    last_refreshed_at?: string | null;
    refresh_expires_at?: string | null;
};
export class ZaloConnectionError extends Error {
    constructor(public code: string) { super(code); }
}
const fail = (code: string): never => { throw new ZaloConnectionError(code); };
export function connectionError(error: unknown) { return error instanceof ZaloConnectionError ? error.code : 'ZALO_CREDENTIAL_STORE_UNAVAILABLE'; }
export function identity(env: NodeJS.ProcessEnv) {
    const app = env.ZALO_APP_ID?.trim(), oa = env.ZALO_OA_ID?.trim();
    if (!app || !oa || !/^\d{8,32}$/.test(app) || !/^\d{8,32}$/.test(oa))
        return fail('ZALO_OUTBOUND_NOT_CONFIGURED');
    return { p_app: app, p_oa: oa };
}
export async function credentialCommand(admin: ZaloAdmin, env: NodeJS.ProcessEnv, action: string, args: Record<string, unknown> = {}) {
    const result = await admin.rpc('zalo_credential_command', { ...identity(env), p_action: action, ...args });
    if (result.error)
        return fail('ZALO_CREDENTIAL_STORE_UNAVAILABLE');
    return result.data;
}
export async function readCredential(admin: ZaloAdmin, env: NodeJS.ProcessEnv = process.env) {
    return await credentialCommand(admin, env, 'READ') as Credential | null;
}
export async function blockCredential(admin: ZaloAdmin, credential: Credential, code: string, env: NodeJS.ProcessEnv = process.env, operation?: string) {
    await credentialCommand(admin, env, 'BLOCK', { p_version: credential.version, p_error: code, p_operation: operation ?? null });
}
async function verifyStored(admin: ZaloAdmin, c: Credential, env: NodeJS.ProcessEnv, request: typeof fetch) {
    const result = await verifyZaloToken(c.access_token ?? '', env, request);
    if (result !== 'READY') {
        if (['ZALO_PROOF_INVALID', 'ZALO_TOKEN_INVALID', 'ZALO_OA_MISMATCH'].includes(result)) {
            const code = result === 'ZALO_PROOF_INVALID' ? result : 'ZALO_RECONNECT_REQUIRED';
            await blockCredential(admin, c, code, env).catch(() => { });
        }
        return fail(result);
    }
    const saved = await credentialCommand(admin, env, 'VERIFY', { p_version: c.version }) as {
        state: string;
    };
    if (saved.state !== 'VERIFIED') {
        const current = await readCredential(admin, env);
        if (current?.version === c.version && current.state === 'READY') return current;
        return fail('ZALO_CREDENTIAL_CHANGED');
    }
    return { ...c, state: 'READY' };
}
export async function getZaloCredential(admin: ZaloAdmin, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch, runtime: { now?: () => number; sleep?: (ms: number) => Promise<void>; waitAttempts?: number } = {}): Promise<Credential> {
    const now = runtime.now ?? Date.now;
    const settings = renewalSettings(env);
    const sleep = runtime.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    async function winningCredential(previous: Credential): Promise<Credential> {
        for (let i = 0; i < (runtime.waitAttempts ?? 40); i++) {
            await sleep(500);
            const next = await readCredential(admin, env);
            if (next && next.version > previous.version && next.state === 'VERIFYING') return verifyStored(admin, next, env, request);
            if (next && next.version > previous.version && next.state === 'READY' && next.expires_at && Date.parse(next.expires_at) > now() + settings.windowMs) return next;
            if (next && !['REFRESHING', 'VERIFYING'].includes(next.state)) return fail(next.error_code || 'ZALO_CREDENTIAL_CHANGED');
        }
        return fail('ZALO_REFRESH_BUSY');
    }
    if (env.ZALO_CREDENTIAL_OWNER !== 'main') return fail('ZALO_OWNERSHIP_UNCONFIRMED');
    if (!env.ZALO_APP_SECRET?.trim())
        return fail('ZALO_OUTBOUND_NOT_CONFIGURED');
    let c = await readCredential(admin, env);
    if (!c) {
        // Bootstrap is insert-only. A restart can never overwrite a rotated pair.
        c = await credentialCommand(admin, env, 'BOOTSTRAP', { p_access: env.ZALO_OA_ACCESS_TOKEN?.trim() ?? null, p_refresh: env.ZALO_OA_REFRESH_TOKEN?.trim() ?? null }) as Credential;
    }
    if (c.state === 'VERIFYING')
        return verifyStored(admin, c, env, request);
    if (c.state === 'REFRESHING') {
        if (!c.operation_started_at || now() - Date.parse(c.operation_started_at) >= 60000) {
            await blockCredential(admin, c, 'ZALO_REFRESH_UNCERTAIN', env, c.operation_id ?? undefined).catch(() => {});
            return fail('ZALO_REFRESH_UNCERTAIN');
        }
        return winningCredential(c);
    }
    if (!['READY', 'NEEDS_REFRESH'].includes(c.state))
        return fail(c.error_code || 'ZALO_RECONNECT_REQUIRED');
    if (c.state === 'READY' && c.access_token && c.refresh_token && c.expires_at && Date.parse(c.expires_at) > now() + settings.windowMs)
        return c;
    if (c.refresh_expires_at && Date.parse(c.refresh_expires_at) <= now()) return fail('ZALO_RECONNECT_REQUIRED');
    if (!c.refresh_token)
        return fail('ZALO_REFRESH_TOKEN_MISSING');
    const operation = randomUUID();
    const claim = await credentialCommand(admin, env, 'CLAIM', { p_version: c.version, p_operation: operation }) as {
        state: string;
    };
    if (claim.state !== 'CLAIMED') {
        const current = await readCredential(admin, env);
        if (current && current.version > c.version && current.state === 'READY' && current.refresh_token && current.expires_at && Date.parse(current.expires_at) > now() + settings.windowMs)
            return current;
        return winningCredential(c);
    }
    let body: Record<string, unknown>;
    const started = now();
    try {
        const response = await request('https://oauth.zaloapp.com/v4/oa/access_token', {
            method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
            headers: { 'content-type': 'application/x-www-form-urlencoded', secret_key: env.ZALO_APP_SECRET.trim() },
            body: new URLSearchParams({ app_id: c.app_id, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
        });
        if (!response.ok)
            throw new Error('HTTP');
        body = await response.json();
    }
    catch {
        await blockCredential(admin, c, 'ZALO_REFRESH_UNCERTAIN', env, operation).catch(() => { });
        return fail('ZALO_REFRESH_UNCERTAIN');
    }
    const seconds = Number(body?.expires_in ?? body?.expire_in);
    if (typeof body?.access_token !== 'string' || !body.access_token.trim() || typeof body.refresh_token !== 'string' || !body.refresh_token.trim() || !Number.isSafeInteger(seconds) || seconds <= 300 || seconds > 93600) {
        const code = Number.isSafeInteger(body?.error) && body.error !== 0 ? 'ZALO_RECONNECT_REQUIRED' : 'ZALO_REFRESH_UNCERTAIN';
        await blockCredential(admin, c, code, env, operation).catch(() => { });
        return fail(code);
    }
    const args = { p_version: c.version, p_operation: operation, p_access: body.access_token, p_refresh: body.refresh_token, p_expires_at: new Date(started + seconds * 1000 - settings.skewMs).toISOString() };
    // Retry only persistence of this exact response; NEVER retry the consumed refresh.
    for (let i = 0; i < 2; i++) {
        try {
            await credentialCommand(admin, env, 'COMMIT', args);
            const stored = await readCredential(admin, env);
            if (stored?.committed_operation === operation && ['VERIFYING', 'READY'].includes(stored.state) && stored.access_token === body.access_token && stored.refresh_token === body.refresh_token)
                return stored.state === 'VERIFYING' ? verifyStored(admin, stored, env, request) : stored;
            if (stored && stored.version > c.version)
                return fail('ZALO_CREDENTIAL_CHANGED');
        }
        catch (error) {
            if (error instanceof ZaloConnectionError && error.code === 'ZALO_CREDENTIAL_CHANGED')
                throw error;
            if (i === 0) await sleep(200);
        }
    }
    await blockCredential(admin, c, 'ZALO_REFRESH_UNCERTAIN', env, operation).catch(() => { });
    return fail('ZALO_REFRESH_UNCERTAIN');
}
