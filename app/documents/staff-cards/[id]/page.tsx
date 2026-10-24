import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '@/app/admin/finance/operations'
import { loadStaffFace } from '@/app/admin/employees/staff-data'
import { CardActions } from '../CardActions'
import { NameCard } from '../NameCard'

export const metadata = { title: 'Thẻ nhân sự | VIBE Academy' }

export default async function StaffCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  if (!uuidPattern.test(id)) notFound()
  const db = await createClient()
  const role = await db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (role.error || role.data !== true) redirect('/login')
  let face: Awaited<ReturnType<typeof loadStaffFace>>
  try {
    face = await loadStaffFace(db, id)
  } catch {
    notFound()
  }
  if (!face.facts.employeeCode) notFound()
  return (
    <div className="space-y-6">
      <CardActions backHref={`/admin/employees?selected=${id}`} />
      {query.created ? <p className="document-actions text-sm text-[var(--vibe-navy)]">Hồ sơ đã được lưu. Thẻ dưới đây lấy từ dữ liệu vừa ghi.</p> : null}
      {query.error ? <p className="document-actions text-sm text-[var(--vibe-red)]" role="alert">{query.error}</p> : null}
      <NameCard employeeId={id} card={face.facts} portraitUrl={face.portraitUrl} />
    </div>
  )
}
