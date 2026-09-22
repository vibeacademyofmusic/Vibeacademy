import { createClient } from '@/lib/supabase/server'
import QrAttendanceClient from './QrAttendanceClient'

type Branch = {
  id: string
  name: string
  code?: string
}

export default async function QrAttendanceShell() {
  const db = await createClient()

  const {
    data,
    error,
  } = await db.rpc(
    'get_attendance_qr_manageable_branches',
  )

  if (error) {
    return (
      <section className="vibe-card">
        <h2>QR chấm công</h2>

        <p>
          Không tải được phạm vi chi nhánh.
        </p>
      </section>
    )
  }

  const branches: Branch[] =
    Array.isArray(data)
      ? data.map((row: any) => ({
          id: String(row.id),
          name: String(
            row.name
            ?? row.code
            ?? row.id,
          ),
          code: row.code
            ? String(row.code)
            : undefined,
        }))
      : []

  return (
    <QrAttendanceClient
      branches={branches}
    />
  )
}
