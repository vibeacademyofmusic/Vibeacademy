'use server'
import { revalidatePath } from 'next/cache'
import { requireIntegrationAdmin } from '../access'
import { zaloServiceClient } from '@/lib/integrations/zalo/service'
import { recoverRegistrationNotification, type RecoveryView } from '@/lib/integrations/zalo/registration-recovery'
export async function recoverNotificationAction(_previous: RecoveryView, form: FormData): Promise<RecoveryView> {
  const db = await requireIntegrationAdmin()
  const jobId = String(form.get('job_id') ?? '')
  const action = form.get('operation') === 'SEND' ? 'SEND' : 'CHECK'
  const expectedAttempts = Number(form.get('expected_attempts'))
  if (!/^[0-9a-f-]{36}$/.test(jobId) || !Number.isSafeInteger(expectedAttempts) || expectedAttempts < 0) return { state:'BLOCKED',reason:'RECOVERY_FORBIDDEN',jobId,attempts:0 }
  const result = await recoverRegistrationNotification(db, zaloServiceClient(), { jobId, action, expectedAttempts })
  revalidatePath('/admin/system/integrations/zalo')
  if (result.applicationId) revalidatePath(`/admin/business/registrations/${result.applicationId}`)
  return result
}
