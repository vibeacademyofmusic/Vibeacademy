import Link from 'next/link'
import type { ReactNode } from 'react'
import { adminClient, vietnamDateTime, type Params } from '../../finance/operations'
import { branches } from '../../finance/query'
import { Select, Field, Pager, Notice, LoadError, dateText, inputClass } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import {
  AppPage,
  PageHeader,
  DataTable,
  EmptyState,
  SectionCard,
  OperationsFilterBar,
  OpsTabs,
  OpsMetricLink,
  OpsStatusBadge,
  buildQuery,
} from '../../_components/vibe'
import { reportList, reportMetrics, reportFilterOptions, enrollmentChoices, reportsAwaitingCreation, types, statuses, statusLabels, latestMonthlyReport, reportView } from './data'
import { generateReport } from './actions'
import { monthlyPeriod, reportTiming, reportTimingLabels } from './periods'

function href(params: Params, patch: Record<string, string | undefined> = {}) {
  const base = {
    tab: params.tab,
    branch: params.branch,
    class: params.class,
    type: params.type,
    status: params.status,
    month: params.month,
    search: params.search,
    grade: params.grade,
    curriculum: params.curriculum,
    teacher_q: params.teacher_q,
    view: params.view,
  }
  const query = buildQuery(base, patch)
  const basePath = params.tab === 'reports' ? '/admin/students' : '/admin/reports/learning'
  return query ? `${basePath}?${query}` : basePath
}

export default async function LearningReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  const view = reportView(params)
  const today = vietnamDateTime().slice(0, 10)
  let loaded
  try {
    loaded = await Promise.all([
      reportList(db, params),
      reportMetrics(db, params),
      branches(db),
      reportFilterOptions(db, params),
      enrollmentChoices(db, params),
      reportsAwaitingCreation(db, today),
    ])
  } catch { return <LoadError /> }
  const [list, metrics, branchRows, options, choices, due] = loaded
  const selected = choices.data.find(e => e.id === params.enrollment)
  let latest = null
  try { if (selected) latest = await latestMonthlyReport(db, selected.id) } catch { return <LoadError /> }
  const period = selected ? monthlyPeriod(selected.started_at, latest?.period_end) : null
  const emptyMessage = view === 'needs'
    ? 'Không có báo cáo cần xử lý.'
    : 'Chưa có báo cáo trong phạm vi này.'

  return (
    <AppPage>
      <PageHeader
        title="Báo cáo học tập"
        description="Theo dõi học viên cần tạo báo cáo. Sau khi kỳ khép, 14 ngày là trong hạn, đến hết 30 ngày là cảnh báo, sau đó là quá hạn."
      />
      <Notice params={params} />

      <div className="vibe-metrics">
        <OpsMetricLink href={href(params, { view: 'needs', status: undefined, page: undefined })} title="Cần xử lý" value={metrics.needs} note="Bản nháp + chờ duyệt" />
        <OpsMetricLink href={href(params) + '#can-tao'} title="Cần tạo báo cáo" value={due.length} note="Kỳ đã khép, chưa có báo cáo" />
        <OpsMetricLink href={href(params, { view: 'needs', status: 'DRAFT', page: undefined })} title="Bản nháp" value={metrics.draft} />
        <OpsMetricLink href={href(params, { view: 'needs', status: 'READY_FOR_REVIEW', page: undefined })} title="Chờ duyệt" value={metrics.review} />
        <OpsMetricLink href={href(params, { view: 'approved', status: undefined, page: undefined })} title="Đã duyệt" value={metrics.approved} />
        <OpsMetricLink href={href(params, { view: 'overdue', status: undefined, page: undefined })} title="Quá hạn" value={metrics.overdue} note="Kỳ đã kết thúc, chưa duyệt" />
      </div>

      {params.tab !== 'reports' && <OpsTabs
        ariaLabel="Chế độ xem báo cáo"
        tabs={[
          { href: href(params, { view: undefined, status: undefined, page: undefined }), label: 'Cần xử lý', active: view === 'needs' },
          { href: href(params, { view: 'all', status: undefined, page: undefined }), label: 'Tất cả báo cáo', active: view === 'all' },
          { href: href(params, { view: 'approved', status: undefined, page: undefined }), label: 'Đã duyệt', active: view === 'approved' },
          { href: href(params, { view: 'overdue', status: undefined, page: undefined }), label: 'Quá hạn', active: view === 'overdue' },
        ]}
      />}

      <OperationsFilterBar
        action={params.tab === 'reports' ? '/admin/students' : '/admin/reports/learning'}
        hidden={{ tab: params.tab, view: view === 'needs' ? undefined : view }}
        resetHref={href({ tab: params.tab, view: view === 'needs' ? undefined : view })}
        fields={[
          { name: 'branch', label: 'Chi nhánh', type: 'select', value: params.branch, options: branchRows },
          { name: 'class', label: 'Ca dạy', type: 'select', value: params.class, options: options.classes },
          { name: 'teacher_q', label: 'Giáo viên', type: 'text', value: params.teacher_q, placeholder: 'Tên giáo viên' },
          { name: 'grade', label: 'Grade', type: 'text', value: params.grade, placeholder: 'Grade' },
          { name: 'curriculum', label: 'Nhạc cụ / Curriculum', type: 'text', value: params.curriculum },
          { name: 'type', label: 'Loại báo cáo', type: 'select', value: params.type, options: types },
          { name: 'status', label: 'Trạng thái', type: 'select', value: params.status, options: statuses },
          { name: 'month', label: 'Tháng kỳ báo cáo', type: 'month', value: params.month },
          { name: 'search', label: 'Tìm học viên', type: 'search', value: params.search, placeholder: 'Tên / mã học viên' },
        ]}
      />

      <SectionCard title="Học viên cần tạo báo cáo">
        <div id="can-tao" />
        {!due.length ? <p>Không có học viên đến hạn tạo báo cáo.</p> : (
          <DataTable
            headers={['Học viên', 'Ca dạy', 'Kỳ cần tạo', 'Trạng thái hệ thống', 'Hành động']}
            rows={due.map(row => [
              `${row.studentName} (${row.studentCode})`,
              row.className,
              dateText(row.periodStart) + ' → ' + dateText(row.periodEnd),
              <OpsStatusBadge key={row.enrollmentId} status={row.timing} labels={reportTimingLabels} />,
              <Link key="create" prefetch={false} className="vibe-button vibe-button-primary" href={href(params, { student: row.studentCode, enrollment: row.enrollmentId })}>Tạo báo cáo</Link>,
            ])}
          />
        )}
      </SectionCard>

      {!list.data.length ? <EmptyState>{emptyMessage}</EmptyState> : (
        <DataTable
          headers={['Học viên', 'Ca dạy', 'Grade', 'Giáo viên', 'Chi nhánh', 'Loại', 'Kỳ báo cáo', 'Trạng thái', 'Academic Status', 'Hành động']}
          rows={list.data.map(r => {
            const overdue = ['DRAFT', 'READY_FOR_REVIEW'].includes(r.status) && r.period_end < today
            const timing = overdue ? reportTiming(r.period_end, today) : null
            const actions: ReactNode[] = [
              <Link key="view" prefetch={false} href={'/admin/reports/learning/' + r.id} className="vibe-button">Xem</Link>,
            ]
            if (r.status === 'DRAFT') actions.push(<Link key="edit" prefetch={false} href={'/admin/reports/learning/' + r.id} className="vibe-button vibe-button-primary">Tiếp tục soạn</Link>)
            if (r.status === 'READY_FOR_REVIEW') actions.push(<Link key="approve" prefetch={false} href={'/admin/reports/learning/' + r.id} className="vibe-button vibe-button-primary">Duyệt</Link>)
            if (['APPROVED', 'PUBLISHED'].includes(r.status)) actions.push(<Link key="print" prefetch={false} href={'/admin/reports/learning/' + r.id + '?print=1'} className="vibe-button">In</Link>)
            return [
              <Link key={r.id} prefetch={false} href={'/admin/reports/learning/' + r.id}>{r.student_name} ({r.student_code})</Link>,
              r.class_name || '—',
              r.current_grade || '—',
              r.teacher_names || '—',
              r.branch_name,
              <span key="type">{types.find(t => t.id === r.report_type)?.name}</span>,
              dateText(r.period_start) + ' → ' + dateText(r.period_end),
              <span key="status" className="inline-flex flex-wrap gap-1">
                <OpsStatusBadge status={r.status} labels={statusLabels} />
                {timing && <OpsStatusBadge status={timing} labels={reportTimingLabels} />}
                {overdue && !timing && <OpsStatusBadge status="OVERDUE" labels={{ OVERDUE: 'Quá hạn' }} />}
              </span>,
              r.academic_status || '—',
              <div key="actions" className="vibe-actions">{actions}</div>,
            ]
          })}
        />
      )}
      <Pager path="/admin/reports/learning" params={{ ...params, view: view === 'needs' ? undefined : view }} {...list} />

      <SectionCard title="Tạo báo cáo">
        <p>Chọn ghi danh để xác định lớp, chi nhánh và chương trình. Báo cáo tháng đầu bắt đầu từ ngày vào học: nếu là ngày 1 thì đến cuối tháng đó, nếu sau ngày 1 thì đến cuối tháng kế tiếp. Những kỳ sau bao phủ trọn tháng; tổng kết cuối khóa được tạo thủ công cho kỳ đã kết thúc. Không tự nâng Grade hoặc gửi thông báo.</p>
        <form className="vibe-filter"><Field name="student" label="Tìm ghi danh theo học viên" value={params.student} required={false} /><button className="vibe-button">Tìm ghi danh</button></form>
        <form className="vibe-filter">
          <input type="hidden" name="student" value={params.student ?? ''} />
          <input type="hidden" name="enrollments_page" value={params.enrollments_page ?? '1'} />
          <Select name="enrollment" label="Ghi danh" required value={selected?.id} options={choices.data.map(e => ({ id: e.id, name: `${e.students.full_name} (${e.students.student_code}) — ${e.classes.name} / ${e.classes.branches.name} — bắt đầu ${dateText(e.started_at)}` }))} />
          <button className="vibe-button">Xem kỳ gợi ý</button>
        </form>
        {selected && period && <div className="space-y-3" key={selected.id}>
          <p>Đang tạo cho {selected.students.full_name} — {selected.classes.name}. Ngày bắt đầu: {dateText(selected.started_at)}{selected.ended_at ? `; kết thúc: ${dateText(selected.ended_at)}` : ''}.</p>
          <p>{period.first ? 'Kỳ tháng đầu tiên' : 'Kỳ tháng tiếp theo'}: {dateText(period.start)} → {dateText(period.end)}. Chỉ tạo được sau ngày kết thúc kỳ.</p>
          {period.end >= today && <p role="status">Kỳ gợi ý chưa kết thúc; chưa thể tạo báo cáo tháng này.</p>}
          {selected.ended_at && period.end > selected.ended_at && <p role="status">Kỳ tháng vượt ngày kết thúc ghi danh. Hãy chọn Tổng kết cuối khóa và nhập kỳ phù hợp; không tự rút ngắn báo cáo tháng.</p>}
          {latest && <p><Link href={'/admin/reports/learning/' + latest.id}>Mở báo cáo tháng gần nhất</Link>. Báo cáo đã hủy vẫn giữ kỳ cũ; tạo lại cùng kỳ sẽ mở bản cũ.</p>}
          <form action={generateReport} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="enrollment_id" value={selected.id} />
            <Select name="type" label="Loại báo cáo" options={types} required value="MONTHLY" />
            <label className="block space-y-1 text-sm"><span>Từ ngày</span><input className={inputClass} name="start" type="date" required min={selected.started_at} max={selected.ended_at ?? undefined} defaultValue={period.start} /></label>
            <label className="block space-y-1 text-sm"><span>Đến ngày</span><input className={inputClass} name="end" type="date" required min={selected.started_at} max={selected.ended_at ?? undefined} defaultValue={period.end} /></label>
            <SubmitButton>Tạo báo cáo</SubmitButton>
          </form>
        </div>}
        <Pager path="/admin/reports/learning" params={params} keyName="enrollments_page" {...choices} />
      </SectionCard>
    </AppPage>
  )
}
