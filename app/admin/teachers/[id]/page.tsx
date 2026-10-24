import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '../../finance/operations'
import { AppPage, InlineNotice, PageHeader } from '../../_components/vibe'

export default async function TeacherProfileTransition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) notFound()
  const db = await createClient()
  const [teacher, employee] = await Promise.all([
    db.from('teachers').select('id,teacher_code,full_name').eq('id', id).maybeSingle(),
    db.from('employees').select('id,employee_code').eq('teacher_id', id).maybeSingle(),
  ])
  if (!teacher.data) notFound()
  if (employee.data) redirect(`/admin/employees?selected=${employee.data.id}`)
  return (
    <AppPage>
      <PageHeader title={teacher.data.full_name} description={`${teacher.data.teacher_code} chưa được liên kết với hồ sơ nhân sự.`} />
      <InlineNotice>Không tự tạo hoặc gộp hồ sơ theo tên. Hãy mở nhân sự, tìm đúng giáo viên này và xác nhận liên kết.</InlineNotice>
      <Link className="vibe-button" href="/admin/employees">Mở hồ sơ nhân sự</Link>
    </AppPage>
  )
}
