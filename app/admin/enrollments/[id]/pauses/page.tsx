import { displayLabel } from '@/lib/display'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PauseForm from './PauseForm'

export default async function PausesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params
  const messages = await searchParams
  const supabase = await createClient()
  const { data: enrollment, error: enrollmentError } = await supabase.from('enrollments').select('id, class_id, student_id, status, started_at, enrolled_at, ended_at').eq('id', id).maybeSingle()
  if (enrollmentError) throw new Error('Không thể tải thông tin ghi danh')
  if (!enrollment) notFound()
  const [{ data: student }, { data: classItem }, { data: pauses, error }] = await Promise.all([
    supabase.from('students').select('full_name, student_code').eq('id', enrollment.student_id).single(),
    supabase.from('classes').select('name, code').eq('id', enrollment.class_id).single(),
    supabase.from('enrollment_pauses').select('id, starts_on, ends_on, reason, status, cancel_reason, cancelled_at').eq('enrollment_id', id).order('starts_on', { ascending: false }),
  ])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return <div className="max-w-3xl space-y-6">
    <div className="flex gap-4 text-sm underline"><Link href={`/admin/classes/${enrollment.class_id}`}>Quay lại lớp học</Link><Link href={`/admin/students/${enrollment.student_id}`}>Hồ sơ học viên</Link></div>
    <div><h1 className="text-3xl font-bold">Bảo lưu học tập</h1><p className="mt-2 text-gray-600">{student?.full_name ?? student?.student_code} · {classItem?.name ?? classItem?.code}</p></div>
    {messages.error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{messages.error}</p>}
    {messages.success && <p role="status" className="rounded-lg bg-green-50 p-4 text-green-700">{messages.success}</p>}
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">Không thể tải lịch sử bảo lưu. Vui lòng liên hệ quản trị viên kiểm tra hệ thống trước khi tiếp tục.</p> : <>
      <section className="rounded-2xl border bg-white p-6"><h2 className="text-lg font-semibold">Tạo bảo lưu</h2><p className="mt-2 text-sm text-gray-600">Thời gian bảo lưu bao gồm cả ngày bắt đầu và ngày kết thúc. Trong thời gian này, học viên không được tính vào danh sách điểm danh buổi học thường hoặc cấp lượt học bù khi buổi học thường bị hủy. Chỗ học vẫn được giữ và lịch học bù đã đặt không thay đổi. Học viên trở lại danh sách điểm danh từ ngày kế tiếp sau khi hết bảo lưu. Không thể thay đổi bảo lưu nếu khoảng ngày đã có điểm danh hoặc buổi học thường đã chốt.</p>
      {enrollment.status !== 'ACTIVE' ? (
  <p className="mt-3 text-amber-700">
    Chỉ có thể tạo bảo lưu cho ghi danh đang hoạt động. Trạng thái hiện tại: {displayLabel(enrollment.status)}.
  </p>
) : !enrollment.started_at ? (
  <p className="mt-3 text-amber-700">
    Học viên chưa có ngày bắt đầu học nên chưa thể tạo bảo lưu.
  </p>
) : (
  <PauseForm
    enrollmentId={id}
    minDate={enrollment.started_at}
    maxDate={enrollment.ended_at ?? undefined}
  />
)}
      </section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">Lịch sử bảo lưu</h2>{!pauses?.length && <p>Chưa có đợt bảo lưu nào.</p>}{pauses?.map(pause => <article key={pause.id} className="rounded-xl border bg-white p-5">
        <p className="font-semibold">{pause.starts_on} → {pause.ends_on} <span className="ml-2 text-sm text-amber-700">{pause.status === 'CANCELLED' ? 'Đã hủy' : today < pause.starts_on ? 'Sắp tới' : today > pause.ends_on ? 'Đã kết thúc' : 'Đang diễn ra'}</span></p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{pause.reason}</p>
        {pause.status === 'CANCELLED' ? (
  <p className="mt-2 text-sm text-gray-500">
    Thông tin hủy: {pause.cancel_reason ?? 'Chưa ghi nhận lý do'} · {pause.cancelled_at}
  </p>
) : today <= pause.ends_on ? (
  <details className="mt-3">
    <summary className="cursor-pointer text-sm text-red-700">
      Hủy đợt bảo lưu này
    </summary>
    <PauseForm enrollmentId={id} pauseId={pause.id} />
  </details>
) : (
  <p className="mt-2 text-sm text-gray-500">
    Đợt bảo lưu đã kết thúc và được giữ lại trong lịch sử.
  </p>
)}
      </article>)}</section>
    </>}
  </div>
}
