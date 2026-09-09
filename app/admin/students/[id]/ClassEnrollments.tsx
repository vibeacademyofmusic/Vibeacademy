import { displayLabel } from '@/lib/display'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function formatDate(value?: string | null) {
  if (!value) return 'Chưa xác định'

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(`${value}T00:00:00+07:00`))
}

export default async function ClassEnrollments({
  studentId,
}: {
  studentId: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id,
      class_id,
      status,
      enrolled_at,
      started_at,
      ended_at,
      classes(name, code)
    `)
    .eq('student_id', studentId)
    .order('enrolled_at', { ascending: false })

  return (
    <section className="mt-6 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Ghi danh lớp học & Bảo lưu</h2>

      <p className="mt-1 text-sm text-gray-500">
        Ngày ghi danh là ngày đăng ký vào lớp. Ngày bắt đầu học là mốc bắt đầu
        tính thời gian học phí.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Không thể tải danh sách ghi danh lớp học.
        </p>
      ) : !data?.length ? (
        <p className="mt-3 text-sm text-gray-500">
          Chưa ghi danh lớp học nào.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {data.map((row) => {
            const item = Array.isArray(row.classes)
              ? row.classes[0]
              : row.classes

            return (
              <article
                key={row.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/classes/${row.class_id}`}
                      className="font-medium text-blue-700 underline"
                    >
                      {item?.name ?? item?.code ?? 'Lớp học'}
                    </Link>

                    <p className="mt-1 text-sm text-gray-500">
                      Trạng thái: {displayLabel(row.status)}
                    </p>
                  </div>


                    <div className="flex flex-col items-end gap-2">
                    <Link
                      href={`/admin/enrollments/${row.id}/tuition`}
                      className="text-sm font-medium text-blue-700 underline"
                    >
                      Quản lý học phí / Gia hạn
                    </Link>

                    <Link
                      href={`/admin/enrollments/${row.id}/pauses`}
                      className="text-sm font-medium text-blue-700 underline"
                    >
                      Quản lý bảo lưu / lịch sử
                    </Link>
                  </div>
                  </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Ngày ghi danh</dt>
                    <dd className="mt-1 font-medium">
                      {formatDate(row.enrolled_at)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">
                      Ngày bắt đầu học
                    </dt>
                    <dd className="mt-1 font-semibold text-gray-950">
                      {formatDate(row.started_at)}
                    </dd>
                    <p className="mt-1 text-xs text-gray-500">
                      Mốc tính học phí
                    </p>
                  </div>

                  <div>
                    <dt className="text-gray-500">Ngày kết thúc</dt>
                    <dd className="mt-1 font-medium">
                      {formatDate(row.ended_at)}
                    </dd>
                  </div>
                </dl>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}