import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import PrintFinancialReportButton from '../../finance/management-report/PrintFinancialReportButton'
import { loadStudentMovement, type StudentMovement } from '@/app/admin/students/movement-data'
import StudentMovementDocument from './StudentMovementDocument'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>
}): Promise<Metadata> {
  const params = await searchParams
  return { title: `VIBE-Bao-cao-hoc-vien-${params.month ?? 'thang'}` }
}

export default async function StudentMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>
}) {
  const params = await searchParams
  const db = await createClient()
  const report = await loadReport(db, params)
  if (!report) return <p>Không tải được báo cáo học viên.</p>
  return (
    <>
      <div className="document-actions fm-report-actions">
        <PrintFinancialReportButton title={`VIBE Báo cáo học viên ${report.monthText}`} />
      </div>
      <StudentMovementDocument report={report} />
    </>
  )
}

async function loadReport(
  db: Awaited<ReturnType<typeof createClient>>,
  params: { month?: string; branch?: string },
): Promise<StudentMovement | null> {
  try {
    return await loadStudentMovement(db, params)
  } catch (error) {
    console.error('student movement report failed', error)
    return null
  }
}
