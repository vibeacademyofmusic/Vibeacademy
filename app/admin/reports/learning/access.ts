import { redirect } from 'next/navigation'
import { requestClaims, requestClient, requestOperationalAdmin } from '@/lib/auth/request'

export async function reportAdminClient() {
  const { data, error } = await requestClaims()
  if (error || !data?.claims) redirect('/login')
  const role = await requestOperationalAdmin()
  if (role.error || role.data !== true) redirect('/admin?error=' + encodeURIComponent('Bạn không có quyền xem báo cáo học tập.'))
  return requestClient()
}
