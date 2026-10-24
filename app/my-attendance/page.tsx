import { redirect } from 'next/navigation'
import {
  createClient,
} from '@/lib/supabase/server'

function timeText(
  value: string,
) {
  return new Intl.DateTimeFormat(
    'vi-VN',
    {
      timeZone:
        'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    },
  ).format(
    new Date(value),
  )
}

export default async function MyAttendancePage() {
  const db =
    await createClient()

  const {
    data: authData,
  } = await db.auth.getUser()

  if (!authData.user) {
    redirect('/login')
  }

  const {
    data,
    error,
  } = await db.rpc(
    'get_my_attendance_today',
  )

  const result = data as {
    work_date?: string
    events?: Array<{
      id: string
      shift_code: string
      event_type: string
      scanned_at: string
    }>
  } | null

  const events = Array.isArray(result?.events)
    ? result.events
    : []

  const shifts = new Map<string, {
    shift: string
    arrived: string | null
    departed: string | null
  }>()

  for (const event of events) {
    const current = shifts.get(event.shift_code) || {
      shift: event.shift_code,
      arrived: null,
      departed: null,
    }
    if (event.event_type === 'CHECK_IN') {
      current.arrived = event.scanned_at
    }
    if (event.event_type === 'CHECK_OUT') {
      current.departed = event.scanned_at
    }
    shifts.set(event.shift_code, current)
  }

  const rows = [...shifts.values()]

  return (
    <main className="vibe-page">
      <header>
        <h1>
          Chấm công của tôi
        </h1>

        <p>
          Ngày hôm nay:{' '}
          {result?.work_date || '—'}
        </p>
      </header>

      {error ? (
        <section className="vibe-card">
          <p>
            Không tải được dữ liệu
            chấm công.
          </p>
        </section>
      ) : !rows.length ? (
        <p className="vibe-empty">
          Hôm nay chưa có lượt quét.
        </p>
      ) : (
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead>
              <tr>
                <th>Ca</th>
                <th>Vào ca</th>
                <th>Ra ca</th>
                <th>Trạng thái</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.shift}>
                  <td>
                    {row.shift === 'AM'
                      ? 'Sáng'
                      : row.shift === 'PM'
                        ? 'Chiều'
                        : '—'}
                  </td>
                  <td>
                    {row.arrived
                      ? timeText(row.arrived)
                      : '—'}
                  </td>
                  <td>
                    {row.departed
                      ? timeText(row.departed)
                      : '—'}
                  </td>
                  <td>
                    {row.arrived && row.departed
                      ? 'Đã ra ca'
                      : row.arrived
                        ? 'Đã vào ca'
                        : 'Thiếu bằng chứng'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
