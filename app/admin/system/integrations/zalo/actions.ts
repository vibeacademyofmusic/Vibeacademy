'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireIntegrationAdmin } from '../access';
import { verifyZaloToken } from '@/lib/integrations/zalo/connection';
import { zaloServiceClient } from '@/lib/integrations/zalo/service';
import { credentialCommand, getZaloCredential, readCredential, connectionError } from '@/lib/integrations/zalo/oauth';
import { recoverRegistrationNotification } from '@/lib/integrations/zalo/registration-recovery';
function finish(result: string) {
    revalidatePath('/admin/system/integrations/zalo');
    revalidatePath('/admin/business/registrations', 'layout');
    redirect(`/admin/system/integrations/zalo?result=${encodeURIComponent(result)}`);
}
export async function checkConnection() {
    await requireIntegrationAdmin();
    let result: string;
    try {
        const { checkStoredConnection } = await import('@/lib/integrations/zalo/connection-check');
        result = await checkStoredConnection(zaloServiceClient());
    } catch (error) { result = connectionError(error); }
    finish(result);
}
// Secrets are read on the server only. Explicit import is CAS-protected and is
// never performed at restart when a credential record already exists.
export async function importServerCredentials(form: FormData) {
    await requireIntegrationAdmin();
    if (process.env.ZALO_CREDENTIAL_OWNER !== 'main') finish('ZALO_OWNERSHIP_UNCONFIRMED');
    let result: string;
    try {
        const env = process.env, access = env.ZALO_OA_ACCESS_TOKEN?.trim(), refresh = env.ZALO_OA_REFRESH_TOKEN?.trim();
        if (!access || !refresh) {
            result = 'ZALO_REFRESH_TOKEN_MISSING';
        }
        else {
            const admin = zaloServiceClient(), c = await readCredential(admin);
            const version = Number(form.get('version'));
            if (!Number.isSafeInteger(version) || version !== (c?.version ?? 0))
                result = 'ZALO_CREDENTIAL_CHANGED';
            else if (c?.state === 'READY' && c.access_token === access)
                result = 'READY';
            else {
                result = await verifyZaloToken(access);
                if (result === 'READY') {
                    const saved = await credentialCommand(admin, env, 'REPLACE', { p_version: version, p_access: access, p_refresh: refresh }) as {
                        state: string;
                    };
                    if (saved.state !== 'COMMITTED')
                        result = saved.state === 'REAUTH_REQUIRED' ? 'ZALO_RECONNECT_REQUIRED' : 'ZALO_REFRESH_BUSY';
                    else {
                        await getZaloCredential(admin);
                        result = 'READY';
                    }
                }
            }
        }
    }
    catch (error) {
        result = connectionError(error);
    }
    finish(result);
}
export async function retryNotification(form: FormData) {
    const db = await requireIntegrationAdmin();
    const jobId = String(form.get('job_id') ?? '');
    const value = form.get('expected_attempts');
    const expectedAttempts = Number(value);
    if (!value || !Number.isSafeInteger(expectedAttempts)) finish('STALE_ACTION');
    const result = await recoverRegistrationNotification(db, zaloServiceClient(), { jobId, action: 'SEND', expectedAttempts });
    finish(result.outcome ?? result.reason);
}
export async function confirmOwnerReceipt(form: FormData) {
    const db = await requireIntegrationAdmin();
    const result = await db.rpc('confirm_zalo_owner_receipt', { p_job: String(form.get('job_id') ?? '') });
    finish(!result.error && result.data === true ? 'OWNER_RECEIPT_RECORDED' : 'ZALO_RETRY_DENIED');
}

export async function connectZalo() {
    const db = await requireIntegrationAdmin();
    const { data } = await db.auth.getUser();
    if (!data.user) finish('ZALO_RETRY_DENIED');
    const { startAuthorization, callbackUrl } = await import('@/lib/integrations/zalo/authorization');
    const { cookies } = await import('next/headers');
    let destination: string;
    try {
        const auth = await startAuthorization(zaloServiceClient(), data.user!.id);
        const jar = await cookies();
        jar.set('vibe_zalo_oauth', auth.state, { httpOnly: true, secure: callbackUrl().startsWith('https:'), sameSite: 'lax', path: '/api/integrations/zalo/oauth/callback', maxAge: 600 });
        destination = auth.url;
    } catch (error) { finish(connectionError(error)); }
    redirect(destination!);
}
