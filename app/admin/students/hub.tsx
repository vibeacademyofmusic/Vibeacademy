import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { businessDate } from '@/app/admin/_lib/business-date'
import { LoadError } from '../finance/_components/ui'
import ClassOpsWorkspace from '../classes/_ops/Workspace'
import { loadClassOps } from '../classes/_ops/data'
import LearningReportsPage from '../reports/learning/page'
import FeedbackPage from '../feedback/page'
import { StudentOpsShell, studentOpsHref, type StudentOpsTab } from './ops-shell'

async function countOf(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query
  return result.error ? null : result.count ?? 0
}

async function Overview() {
  const db = await createClient()
  const today = businessDate()
  const [active, sessions, reports, feedback] = await Promise.all([
    countOf(db.from('students').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE')),
    countOf(db.from('session_occurrences').select('id', { count: 'exact', head: true }).eq('occurrence_date', today)),
    countOf(db.from('learning_reports').select('id', { count: 'exact', head: true }).eq('status', 'READY_FOR_REVIEW')),
    countOf(db.from('lesson_feedback').select('id', { count: 'exact', head: true }).in('resolution_status', ['NEEDS_REVIEW', 'IN_REVIEW'])),
  ])
  const cards = [
    active !== null && { label: 'Học viên đang hoạt động', value: active, href: studentOpsHref('students', { status: 'ACTIVE' }) },
    sessions !== null && { label: 'Buổi học hôm nay', value: sessions, href: studentOpsHref('attendance', { date: today }) },
    reports !== null && { label: 'Báo cáo chờ xử lý', value: reports, href: studentOpsHref('reports', { status: 'READY_FOR_REVIEW' }) },
    feedback !== null && { label: 'Phản hồi cần xử lý', value: feedback, href: studentOpsHref('feedback', { review: 'yes' }) },
  ].filter(item => item !== false)

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => (
        <Link key={card.label} prefetch={false} href={card.href} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600">{card.label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{card.value}</p>
        </Link>
      ))}
    </section>
  )
}

async function ClassTab({
  searchParams,
  view,
}: {
  searchParams: Promise<Record<string, string | undefined>>
  view: 'classes' | 'schedule' | 'attendance'
}) {
  const params = await searchParams
  const db = await createClient()
  let data
  try {
    data = await loadClassOps(db, params, view)
  } catch (error) {
    console.error('loadClassOps failed', error)
    return <LoadError />
  }
  return <ClassOpsWorkspace params={params} data={data} view={view} embedded />
}

export async function StudentOpsHub({
  tab,
  searchParams,
}: {
  tab: StudentOpsTab
  searchParams: Promise<Record<string, string | undefined>>
}) {
  return (
    <StudentOpsShell tab={tab}>
      {tab === 'overview' && <Overview />}
      {tab === 'teaching-shifts' && <ClassTab searchParams={searchParams} view="classes" />}
      {tab === 'schedule' && <ClassTab searchParams={searchParams} view="schedule" />}
      {tab === 'attendance' && <ClassTab searchParams={searchParams} view="attendance" />}
      {tab === 'reports' && <LearningReportsPage searchParams={searchParams} />}
      {tab === 'feedback' && <FeedbackPage searchParams={searchParams} />}
    </StudentOpsShell>
  )
}
