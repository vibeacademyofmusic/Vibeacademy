import { createClient } from '@/lib/supabase/server'
import { readAll } from '../finance/data'
import { loadFinancialManagementReport } from '../finance/management-report/data'
import type { MetricValue } from '../finance/management-report/model'
import { businessDate } from './business-date'
import { cents, formatMoney, type Amount } from './money'

type DB = Awaited<ReturnType<typeof createClient>>
type CountQuery = {
  eq: (column: string, value: string | number | boolean) => CountQuery
  gte: (column: string, value: string) => CountQuery
  lte: (column: string, value: string) => CountQuery
  gt: (column: string, value: string) => CountQuery
  in: (column: string, values: readonly string[]) => CountQuery
  is: (column: string, value: null) => CountQuery
  then: PromiseLike<{ count: number | null; error: { message: string } | null }>['then']
}

export type ActionGroup = 'NEEDS_ACTION' | 'OVERDUE' | 'REVIEW'

export type ActionItem = {
  group: ActionGroup
  title: string
  context: string
  branch: string
  when: string | null
  href: string
  count: number | null
}

export type CountValue = { value: number | null }

export type MoneyValue = { amount: Amount; text: string | null }

export type BranchOperations = {
  id: string
  name: string
  lessons: number | null
  retention: number | null
  overdueInvoices: number | null
}

export type ExecutiveDashboard = {
  businessDate: string
  businessDateLabel: string
  monthLabel: string
  scope: 'Toàn học viện'
  lessons: {
    total: number | null
    scheduled: number | null
    completed: number | null
    cancelled: number | null
    makeup: number | null
    unassigned: number | null
  }
  attendance: {
    present: number | null
    late: number | null
    absent: number | null
    excused: number | null
  }
  students: {
    active: number | null
    inactive: number | null
    paused: number | null
    graduated: number | null
    archived: number | null
    admittedThisMonth: number | null
    pausedEnrollmentsToday: number | null
  }
  finance: {
    currency: string
    collected: MoneyValue
    collectedChange: string | null
    invoiceReceivables: MoneyValue
    openingReceivables: MoneyValue
    overdueReceivables: MoneyValue
    overdueInvoiceCount: number | null
    recordedOperatingExpenses: MoneyValue
  }
  academic: {
    reportsReadyForReview: number | null
    attemptsPendingReview: number | null
  }
  staff: {
    attendance: Record<string, number | null>
    pendingRequests: number | null
    payrollInReview: number | null
  }
  crm: {
    followUpOverdue: number | null
    followUpToday: number | null
    uncontacted: number | null
    trialToday: number | null
  }
  feedbackOpen: number | null
  activeGrants: number | null
  remindersPending: number | null
  retentionOpen: number | null
  actions: ActionItem[]
  needsAction: number | null
  needsActionNote: string | null
  branches: BranchOperations[]
  links: {
    attendance: string
    finance: string
    studentsActive: string
    receivablesOverdue: string
  }
}

const staffStatuses = ['WORKED', 'LATE', 'UNAUTHORIZED_ABSENCE', 'PAID_LEAVE', 'UNPAID_LEAVE', 'EARLY_LEAVE', 'BUSINESS_TRIP', 'SCHEDULED_OFF'] as const
const studentStatuses = ['ACTIVE', 'INACTIVE', 'PAUSED', 'GRADUATED', 'ARCHIVED'] as const

function dateLabel(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function monthLabel(iso: string) {
  const [year, month] = iso.split('-')
  return `${month}/${year}`
}

function moneyValue(amount: Amount, currency: string): MoneyValue {
  if (cents(amount) === null) return { amount: null, text: null }
  return { amount, text: formatMoney(amount, currency) }
}

function availableMoney(metric: MetricValue | null | undefined, currency: string): MoneyValue {
  if (!metric || metric.status !== 'AVAILABLE') return { amount: null, text: null }
  return moneyValue(metric.value, currency)
}

async function exactCount(db: DB, table: string, apply: (query: CountQuery) => CountQuery): Promise<number | null> {
  const selected = db.from(table).select('id', { count: 'exact', head: true }) as unknown as CountQuery
  const result = await apply(selected)
  if (result.error || typeof result.count !== 'number') return null
  return result.count
}

function moneyFromCents(value: bigint, currency: string): MoneyValue {
  const negative = value < BigInt(0)
  const absolute = negative ? -value : value
  const text = `${negative ? '-' : ''}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, '0')}`
  return moneyValue(text, currency)
}

function branchText(ids: string[], names: Map<string, string>) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 1) return names.get(unique[0]) ?? 'Một chi nhánh'
  if (unique.length > 1) return 'Nhiều chi nhánh'
  return 'Toàn học viện'
}

export async function loadExecutiveDashboard(now = new Date()): Promise<ExecutiveDashboard> {
  const today = businessDate(now)
  const monthStart = `${today.slice(0, 7)}-01`
  const db = await createClient()
  const names = new Map<string, string>()

  const [
    branchRows,
    sessions,
    studentCounts,
    admittedThisMonth,
    pauses,
    remindersPending,
    alerts,
    reportsReadyForReview,
    attemptsPendingReview,
    feedbackOpen,
    payrollInReview,
    activeGrants,
    staffCounts,
    requestRows,
    reviewRows,
    overdueRows,
    financeLoaded,
    crmResult,
  ] = await Promise.all([
    readAll<{ id: string; name: string; status: string }>((from, to) =>
      db.from('branches').select('id, name, status').order('name').order('id').range(from, to),
    ),
    readAll<{ session_id: string; branch_id: string; status: string; occurrence_type: string; teacher_id: string | null }>((from, to) =>
      db.from('session_actual_teachers').select('session_id, branch_id, status, occurrence_type, teacher_id').eq('occurrence_date', today).order('session_id').range(from, to),
    ),
    Promise.all(studentStatuses.map(status => exactCount(db, 'students', query => query.eq('status', status)))),
    exactCount(db, 'students', query => query.gte('admission_date', monthStart).lte('admission_date', today)),
    readAll<{ enrollment_id: string }>((from, to) =>
      db.from('enrollment_pauses').select('enrollment_id').eq('status', 'ACTIVE').lte('starts_on', today).gte('ends_on', today).order('id').range(from, to),
    ),
    exactCount(db, 'tuition_reminders', query => query.eq('status', 'PENDING')),
    readAll<{ branch_id: string }>((from, to) =>
      db.from('student_retention_alerts').select('branch_id').in('status', ['NEW', 'CONTACTED', 'FOLLOW_UP']).order('id').range(from, to),
    ),
    exactCount(db, 'learning_reports', query => query.eq('status', 'READY_FOR_REVIEW')),
    exactCount(db, 'learning_assessment_attempts', query => query.eq('state', 'PENDING_REVIEW')),
    exactCount(db, 'lesson_feedback', query => query.eq('is_low_rating', true).in('resolution_status', ['NEEDS_REVIEW', 'IN_REVIEW'])),
    exactCount(db, 'payroll_periods', query => query.eq('status', 'REVIEW')),
    exactCount(db, 'learning_access_grants', query => query.is('revoked_at', null).lte('valid_from', now.toISOString()).gt('valid_until', now.toISOString())),
    Promise.all(staffStatuses.map(status => exactCount(db, 'employee_attendance_current', query => query.eq('work_date', today).eq('status', status)))),
    readAll<{ id: string }>((from, to) => db.from('employee_attendance_requests').select('id').order('id').range(from, to)),
    readAll<{ request_id: string }>((from, to) => db.from('employee_attendance_reviews').select('request_id').order('id').range(from, to)),
    readAll<{ branch_id_snapshot: string | null; currency: string; outstanding_balance: Amount }>((from, to) =>
      db.from('invoice_receivables').select('branch_id_snapshot, currency, outstanding_balance').eq('is_overdue', true).order('invoice_id').range(from, to),
    ),
    loadFinancialManagementReport({ month: monthStart, branchId: null, currency: 'VND' }),
    db.rpc('crm_business_snapshot', { p_branch: null }),
  ])

  for (const branch of branchRows ?? []) names.set(branch.id, branch.name)

  const sessionList = sessions ?? []
  const lessons = sessions
    ? {
        total: sessionList.length,
        scheduled: sessionList.filter(row => row.status === 'SCHEDULED').length,
        completed: sessionList.filter(row => row.status === 'COMPLETED').length,
        cancelled: sessionList.filter(row => row.status === 'CANCELLED').length,
        makeup: sessionList.filter(row => row.occurrence_type === 'MAKEUP').length,
        unassigned: sessionList.filter(row => row.teacher_id == null).length,
      }
    : { total: null, scheduled: null, completed: null, cancelled: null, makeup: null, unassigned: null }

  const attendance = { present: null as number | null, late: null as number | null, absent: null as number | null, excused: null as number | null }
  if (sessions && sessionList.length === 0) {
    attendance.present = 0
    attendance.late = 0
    attendance.absent = 0
    attendance.excused = 0
  } else if (sessions) {
    const ids = sessionList.map(row => row.session_id)
    const marks: { status: string }[] = []
    let marksFailed = false
    for (let index = 0; index < ids.length && !marksFailed; index += 80) {
      const slice = ids.slice(index, index + 80)
      const page = await readAll<{ status: string }>((from, to) =>
        db.from('attendance_records').select('status').in('session_occurrence_id', slice).order('id').range(from, to),
      )
      if (!page) marksFailed = true
      else marks.push(...page)
    }
    if (!marksFailed) {
      attendance.present = marks.filter(row => row.status === 'PRESENT').length
      attendance.late = marks.filter(row => row.status === 'LATE').length
      attendance.absent = marks.filter(row => row.status === 'ABSENT').length
      attendance.excused = marks.filter(row => row.status === 'EXCUSED').length
    }
  }

  const report = financeLoaded.report
  const currency = report?.currency || 'VND'
  const collected = availableMoney(report?.cash_flow.tuition_cash_in, currency)
  const change = report?.previous_period.changes.tuition_cash_in?.amount
  const collectedChange = collected.text && cents(change) !== null ? `Chênh so với tháng trước: ${formatMoney(change, currency)}` : null
  const overdueVnd = overdueRows?.filter(row => row.currency === 'VND') ?? null
  let overdueCents: bigint | null = overdueVnd ? BigInt(0) : null
  if (overdueVnd && overdueCents !== null) {
    for (const row of overdueVnd) {
      const value = cents(row.outstanding_balance)
      if (value === null) overdueCents = null
      else if (overdueCents !== null) overdueCents += value
    }
  }
  const mixedOverdueCurrency = Boolean(overdueRows?.some(row => row.currency !== 'VND'))
  const overdueMoney = overdueRows == null || overdueCents === null
    ? { amount: null, text: null }
    : mixedOverdueCurrency
      ? { amount: null, text: 'Có nhiều loại tiền, không quy đổi' }
      : moneyFromCents(overdueCents, 'VND')

  const crm = new Map<string, number>()
  if (!crmResult.error && Array.isArray(crmResult.data)) {
    for (const row of crmResult.data as { metric: string; value: number | string }[]) {
      const value = Number(row.value)
      if (Number.isFinite(value)) crm.set(row.metric, value)
    }
  }
  const crmValue = (metric: string) => (crmResult.error ? null : crm.get(metric) ?? null)

  const pendingRequests = requestRows && reviewRows
    ? requestRows.filter(row => !reviewRows.some(review => review.request_id === row.id)).length
    : null

  const staffAttendance = Object.fromEntries(staffStatuses.map((status, index) => [status, staffCounts[index]])) as Record<string, number | null>
  const student = Object.fromEntries(studentStatuses.map((status, index) => [status, studentCounts[index]])) as Record<(typeof studentStatuses)[number], number | null>
  const pausedEnrollmentsToday = pauses ? new Set(pauses.map(row => row.enrollment_id)).size : null
  const retentionOpen = alerts ? alerts.length : null

  const actions: ActionItem[] = []
  const add = (item: ActionItem) => {
    if (item.count === 0) return
    actions.push(item)
  }
  add({
    group: 'NEEDS_ACTION',
    title: 'Buổi học chưa có giáo viên',
    context: lessons.unassigned == null ? 'Không tải được buổi học hôm nay.' : `${lessons.unassigned} buổi trong ngày không có giáo viên thực tế.`,
    branch: branchText(sessionList.filter(row => row.teacher_id == null).map(row => row.branch_id), names),
    when: dateLabel(today),
    href: `/admin/session-teachers`,
    count: lessons.unassigned,
  })
  add({
    group: 'NEEDS_ACTION',
    title: 'Cảnh báo chuyên cần đang mở',
    context: retentionOpen == null ? 'Không tải được cảnh báo chuyên cần.' : `${retentionOpen} hồ sơ vắng liên tiếp chưa đóng.`,
    branch: branchText((alerts ?? []).map(row => row.branch_id), names),
    when: null,
    href: '/admin/attendance/retention',
    count: retentionOpen,
  })
  add({
    group: 'NEEDS_ACTION',
    title: 'Nhắc gia hạn học phí đang chờ',
    context: remindersPending == null ? 'Không tải được nhắc học phí.' : `${remindersPending} nhắc RENEWAL_V1 còn trạng thái chờ.`,
    branch: 'Toàn học viện',
    when: null,
    href: '/admin/tuition/reminders',
    count: remindersPending,
  })
  add({
    group: 'NEEDS_ACTION',
    title: 'Yêu cầu chấm công hoặc nghỉ chưa duyệt',
    context: pendingRequests == null ? 'Không tải được hàng đợi chấm công.' : `${pendingRequests} yêu cầu chưa có người duyệt.`,
    branch: 'Toàn học viện',
    when: null,
    href: '/admin/employees/leave-requests',
    count: pendingRequests,
  })
  add({
    group: 'OVERDUE',
    title: 'Hóa đơn học phí quá hạn',
    context: overdueRows == null ? 'Không tải được hóa đơn quá hạn.' : `${overdueRows.length} hóa đơn đến hạn trước hôm nay và còn số dư.`,
    branch: branchText((overdueRows ?? []).map(row => row.branch_id_snapshot ?? ''), names),
    when: dateLabel(today),
    href: '/admin/finance/receivables?receivable=OVERDUE',
    count: overdueRows ? overdueRows.length : null,
  })
  add({
    group: 'OVERDUE',
    title: 'Follow-up CRM quá hạn',
    context: crmValue('follow_up_overdue') == null ? 'Không tải được hàng đợi CRM.' : `${crmValue('follow_up_overdue')} lead đến hạn trước hôm nay, chưa chốt.`,
    branch: 'Toàn học viện',
    when: dateLabel(today),
    href: '/admin/business/crm?queue=overdue',
    count: crmValue('follow_up_overdue'),
  })
  add({
    group: 'REVIEW',
    title: 'Báo cáo học tập chờ duyệt',
    context: reportsReadyForReview == null ? 'Không tải được báo cáo học tập.' : `${reportsReadyForReview} báo cáo ở trạng thái chờ duyệt.`,
    branch: 'Toàn học viện',
    when: null,
    href: '/admin/reports/learning?status=READY_FOR_REVIEW',
    count: reportsReadyForReview,
  })
  add({
    group: 'REVIEW',
    title: 'Phản hồi điểm thấp chưa đóng',
    context: feedbackOpen == null ? 'Không tải được phản hồi buổi học.' : `${feedbackOpen} phản hồi dưới ngưỡng hiện hành, đang cần xử lý hoặc đang xử lý.`,
    branch: 'Toàn học viện',
    when: null,
    href: '/admin/feedback?review=yes',
    count: feedbackOpen,
  })
  add({
    group: 'REVIEW',
    title: 'Kỳ lương đang kiểm tra',
    context: payrollInReview == null ? 'Không tải được kỳ lương.' : `${payrollInReview} kỳ ở trạng thái đang kiểm tra.`,
    branch: 'Toàn học viện',
    when: null,
    href: '/admin/payroll?status=REVIEW',
    count: payrollInReview,
  })
  add({
    group: 'REVIEW',
    title: 'Bài đánh giá chờ chấm',
    context: attemptsPendingReview == null ? 'Không tải được bài đánh giá.' : `${attemptsPendingReview} lượt ở trạng thái chờ chấm.`,
    branch: 'Toàn học viện',
    when: null,
    href: '/admin/elearning/assessments',
    count: attemptsPendingReview,
  })

  const known = actions.filter(item => item.count != null)
  const failed = actions.filter(item => item.count == null)
  const needsAction = known.reduce((sum, item) => sum + (item.count ?? 0), 0)
  const visibleActions = actions.filter(item => item.count == null || item.count > 0)

  const branchIds = new Set<string>([
    ...(branchRows ?? []).filter(row => row.status === 'ACTIVE').map(row => row.id),
    ...sessionList.map(row => row.branch_id),
    ...(alerts ?? []).map(row => row.branch_id),
    ...(overdueRows ?? []).map(row => row.branch_id_snapshot).filter((id): id is string => Boolean(id)),
  ])
  const branches = [...branchIds].map(id => ({
    id,
    name: names.get(id) ?? 'Chi nhánh chưa đọc được tên',
    lessons: sessions ? sessionList.filter(row => row.branch_id === id).length : null,
    retention: alerts ? alerts.filter(row => row.branch_id === id).length : null,
    overdueInvoices: overdueRows ? overdueRows.filter(row => row.branch_id_snapshot === id).length : null,
  })).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  return {
    businessDate: today,
    businessDateLabel: dateLabel(today),
    monthLabel: monthLabel(today),
    scope: 'Toàn học viện',
    lessons,
    attendance,
    students: {
      active: student.ACTIVE,
      inactive: student.INACTIVE,
      paused: student.PAUSED,
      graduated: student.GRADUATED,
      archived: student.ARCHIVED,
      admittedThisMonth,
      pausedEnrollmentsToday,
    },
    finance: {
      currency,
      collected,
      collectedChange,
      invoiceReceivables: availableMoney(report?.receivables.current_tuition_receivable, currency),
      openingReceivables: availableMoney(report?.receivables.opening_receivable_current, currency),
      overdueReceivables: overdueMoney,
      overdueInvoiceCount: overdueRows ? overdueRows.length : null,
      recordedOperatingExpenses: availableMoney(report?.pnl.operating_expense, currency),
    },
    academic: { reportsReadyForReview, attemptsPendingReview },
    staff: { attendance: staffAttendance, pendingRequests, payrollInReview },
    crm: {
      followUpOverdue: crmValue('follow_up_overdue'),
      followUpToday: crmValue('follow_up_today'),
      uncontacted: crmValue('uncontacted'),
      trialToday: crmValue('trial_today'),
    },
    feedbackOpen,
    activeGrants,
    remindersPending,
    retentionOpen,
    actions: visibleActions,
    needsAction: failed.length && known.length === 0 ? null : needsAction,
    needsActionNote: failed.length ? 'Một hàng đợi không tải được, nên số việc chưa đủ.' : null,
    branches,
    links: {
      attendance: `/admin/attendance?date=${today}`,
      finance: `/admin/finance?month=${today.slice(0, 7)}`,
      studentsActive: '/admin/students?status=ACTIVE',
      receivablesOverdue: '/admin/finance/receivables?receivable=OVERDUE',
    },
  }
}

export const markedAttendanceLabels = [
  ['present', 'Có mặt'],
  ['late', 'Đi trễ'],
  ['absent', 'Vắng'],
  ['excused', 'Có phép'],
] as const

export const staffStatusLabels: Record<string, string> = {
  WORKED: 'Đã làm',
  LATE: 'Đi trễ',
  UNAUTHORIZED_ABSENCE: 'Vắng không phép',
  PAID_LEAVE: 'Nghỉ có lương',
  UNPAID_LEAVE: 'Nghỉ không lương',
  EARLY_LEAVE: 'Về sớm',
  BUSINESS_TRIP: 'Công tác',
  SCHEDULED_OFF: 'Nghỉ theo lịch',
}
