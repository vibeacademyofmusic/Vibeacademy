import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AppPage, DataTable, InlineNotice, PageHeader } from '../_components/vibe'

export default async function TeachersTransition() {
  const db = await createClient()
  const [teachers, employees] = await Promise.all([
    db.from('teachers').select('id,teacher_code,full_name,status').order('full_name'),
    db.from('employees').select('id,employee_code,teacher_id').not('teacher_id', 'is', null),
  ])
  const linked = new Map((employees.data || []).map(row => [row.teacher_id as string, row]))
  const rows = (teachers.data || []).map(teacher => {
    const staff = linked.get(teacher.id)
    return [
      teacher.teacher_code,
      teacher.full_name,
      teacher.status,
      staff
        ? <Link key={teacher.id} href={`/admin/employees?selected=${staff.id}`}>{staff.employee_code}</Link>
        : 'Chưa liên kết',
    ]
  })
  return (
    <AppPage>
      <PageHeader title="Giáo viên đã có" description="Hồ sơ giảng dạy nằm trong hồ sơ nhân sự. Trang này chỉ dẫn tới đúng người đã được liên kết, không tạo thêm nhân sự theo tên." />
      {(teachers.error || employees.error) ? <InlineNotice tone="error">Không tải được danh sách giáo viên.</InlineNotice> : null}
      <InlineNotice>Muốn gắn một giáo viên vào nhân sự, hãy mở hồ sơ nhân sự, tìm đúng người và xác nhận. Trùng tên không được tự gộp.</InlineNotice>
      <DataTable headers={['Mã giáo viên', 'Họ tên', 'Trạng thái', 'Hồ sơ nhân sự']} rows={rows} />
    </AppPage>
  )
}
