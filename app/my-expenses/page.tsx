import { redirect } from 'next/navigation'

import { logout } from '@/app/login/actions'
import { requestClaims } from '@/lib/auth/request'
import SelfServiceView from '@/app/admin/hr/expenses/SelfServiceView'
import { loadExpenses } from '@/app/admin/hr/expenses/data'
import type { Params } from '@/app/admin/finance/operations'

export default async function MyExpenses({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const authResult = await requestClaims()
  if (authResult.error || !authResult.data?.claims) redirect('/login')
  const data = await loadExpenses(params, true)
  if (!data.context) {
    return (
      <main className="vibe-admin min-h-screen bg-[var(--vibe-surface-soft)] px-4 py-8 text-[var(--vibe-navy)]">
        <div className="mx-auto max-w-4xl rounded-xl border border-[var(--vibe-line)] bg-white p-6">
          <h1 className="text-2xl font-bold">Công tác phí của tôi</h1>
          <p className="mt-3">Tài khoản chưa được liên kết với nhân viên đang làm việc hoặc chưa có quyền lập bảng kê cá nhân.</p>
          <form action={logout} className="mt-5"><button className="vibe-button">Đăng xuất</button></form>
        </div>
      </main>
    )
  }

  return (
    <div className="vibe-admin bg-[var(--vibe-surface-soft)] px-4 py-6 text-[var(--vibe-navy)] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SelfServiceView searchParams={Promise.resolve(params)} basePath="/my-expenses" initial={data} />
      </div>
    </div>
  )
}
