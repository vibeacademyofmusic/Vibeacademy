import Link from 'next/link'
import {
  createClient,
} from '@/lib/supabase/server'

type SearchParams = {
  t?: string
}

function errorText(
  message: string,
) {
  const rules: Array<
    [string, string]
  > = [
    [
      'QR_ATTENDANCE_TOKEN_EXPIRED',
      'Mã QR đã hết hạn. Hãy quét mã mới đang hiển thị.',
    ],
    [
      'QR_ATTENDANCE_SESSION_NOT_ACTIVE',
      'Phiên chấm công đã kết thúc.',
    ],
    [
      'QR_ATTENDANCE_WRONG_BRANCH',
      'Bạn đang quét mã của chi nhánh không phù hợp.',
    ],
    [
      'QR_ATTENDANCE_NO_ELIGIBLE_SHIFT_AT_BRANCH',
      'Hôm nay bạn không có ca phù hợp tại chi nhánh này.',
    ],
    [
      'QR_ATTENDANCE_EMPLOYEE_LINK_REQUIRED',
      'Tài khoản chưa được liên kết với hồ sơ nhân viên.',
    ],
    [
      'QR_ATTENDANCE_EMPLOYEE_LINK_AMBIGUOUS',
      'Tài khoản đang liên kết với nhiều hồ sơ nhân viên. Hãy nhờ quản trị kiểm tra trước khi chấm công.',
    ],
    [
      'QR_ATTENDANCE_ACTIVE_EMPLOYEE_REQUIRED',
      'Hồ sơ nhân viên hiện không ở trạng thái làm việc.',
    ],
    [
      'QR_ATTENDANCE_INVALID_TOKEN',
      'Mã QR không hợp lệ.',
    ],
  ]

  return (
    rules.find(
      ([code]) =>
        message.includes(code),
    )?.[1]
    ?? 'Không thể ghi nhận lượt quét. Hãy thử lại với mã QR mới.'
  )
}

function timeText(
  value: unknown,
) {
  if (!value) return ''

  const date =
    new Date(String(value))

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return ''
  }

  return new Intl.DateTimeFormat(
    'vi-VN',
    {
      timeZone:
        'Asia/Ho_Chi_Minh',
      dateStyle: 'medium',
      timeStyle: 'medium',
    },
  ).format(date)
}

export default async function AttendanceScanPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>
}) {
  const params =
    await searchParams

  const token =
    String(
      params.t ?? '',
    ).trim()

  const db =
    await createClient()

  const {
    data: authData,
  } = await db.auth.getUser()

  if (!authData.user) {
    return (
      <main className="vibe-page">
        <section className="vibe-card">
          <h1>
            Chấm công VIBE
          </h1>

          <p>
            Bạn cần đăng nhập bằng
            tài khoản nhân viên trước
            khi quét QR.
          </p>

          <Link
            href="/login"
            className="vibe-button"
          >
            Đăng nhập
          </Link>

          <p>
            Sau khi đăng nhập,
            quét lại mã QR đang
            hiển thị tại chi nhánh.
          </p>
        </section>
      </main>
    )
  }

  const {
    data,
    error,
  } = await db.rpc(
    'scan_employee_attendance_qr',
    {
      p_token: token,
    },
  )

  if (error) {
    return (
      <main className="vibe-page">
        <section className="vibe-card">
          <h1>
            Chấm công VIBE
          </h1>

          <p>
            {errorText(
              error.message,
            )}
          </p>
        </section>
      </main>
    )
  }

  const result = data as any

  const checkIn =
    result?.event_type
    === 'CHECK_IN'

  return (
    <main className="vibe-page">
      <section className="vibe-card">
        <span className="vibe-badge">
          VIBE Academy
        </span>

        <h1>
          {checkIn
            ? 'Đã vào ca'
            : 'Đã ra ca'}
        </h1>

        <div className="vibe-grid">
          <section className="vibe-card">
            <small>
              Nhân viên
            </small>

            <strong className="block">
              {result?.employee_name
                || result?.employee_code
                || 'Đã xác nhận'}
            </strong>
          </section>

          <section className="vibe-card">
            <small>Ca</small>

            <strong className="block">
              {result?.shift_code === 'AM'
                ? 'Sáng'
                : result?.shift_code === 'PM'
                  ? 'Chiều'
                  : '—'}
            </strong>
          </section>

          <section className="vibe-card">
            <small>
              Thời gian
            </small>

            <strong className="block">
              {timeText(
                result?.scanned_at,
              )}
            </strong>
          </section>
        </div>

        <p>
          Bằng chứng được ghi bằng
          thời gian máy chủ và gắn với
          tài khoản đăng nhập của bạn.
        </p>
      </section>
    </main>
  )
}
