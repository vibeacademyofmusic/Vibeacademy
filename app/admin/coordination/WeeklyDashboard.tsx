import { requestClient } from '@/lib/auth/request'
import { businessDate } from '@/app/admin/_lib/business-date'
import { loadCalendar } from './calendar-data'
import WeeklyBoard from './WeeklyBoard'

export default async function WeeklyDashboard({ params }: { params: Record<string, string | undefined> }) {
  const date = params.date || businessDate()
  const branch = params.branch || ''
  const result = await loadCalendar(await requestClient(), date, branch)
  return <WeeklyBoard key={`${date}:${branch}`} snapshot={result.data} error={result.error} reference={result.reference}
    date={date} branch={branch} view={params.view || 'week'} />
}
