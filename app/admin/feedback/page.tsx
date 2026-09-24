import Link from 'next/link'
import { adminClient, type Params } from '../finance/operations'
import { branches } from '../finance/query'
import { Table, Pager, Notice, LoadError, timeText } from '../finance/_components/ui'
import {
  AppPage,
  PageHeader,
  EmptyState,
  OperationsFilterBar,
  OpsTabs,
  OpsMetricLink,
  OpsStatusBadge,
  buildQuery,
} from '../_components/vibe'
import { businessDate, shiftBusinessDate } from '../_lib/business-date'
import { feedbackList, feedbackMetrics, feedbackClasses, teachers, states, stateLabels, respondents } from './data'

function href(params: Params, patch: Record<string, string | undefined> = {}) {
  const query = buildQuery({
    branch: params.branch,
    class: params.class,
    teacher: params.teacher,
    from: params.from,
    to: params.to,
    status: params.status,
    rating: params.rating,
    respondent: params.respondent,
    attention: params.attention,
    q: params.q,
    view: params.view,
  }, patch)
  return query ? `/admin/feedback?${query}` : '/admin/feedback'
}

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  const view = params.view === 'all' || params.view === 'quality' ? params.view : 'attention'
  const scoped: Params = {
    ...params,
    from: params.from || shiftBusinessDate(businessDate(), -29),
    to: params.to || businessDate(),
    review: view === 'attention' && !params.status ? 'yes' : params.review,
  }
  let loaded
  try {
    loaded = await Promise.all([
      feedbackList(db, scoped),
      feedbackMetrics(db, scoped),
      branches(db),
      teachers(db),
      feedbackClasses(db, scoped),
    ])
  } catch { return <LoadError /> }
  const [list, metrics, branchRows, teacherRows, classRows] = loaded

  return (
    <AppPage>
      <PageHeader
        title="Phản hồi buổi học"
        description="Phản hồi từ học viên và phụ huynh giúp theo dõi chất lượng buổi học và xử lý các vấn đề cần quan tâm."
      />
      <Notice params={params} />
      <p>Điểm thấp được đánh dấu bởi database. Xử lý phản hồi không thay đổi đánh giá gốc.</p>

      <div className="vibe-metrics">
        <OpsMetricLink href={href(scoped, { view: 'all', page: undefined })} title="Tổng phản hồi" value={metrics.total} note="Trong khoảng ngày đang lọc" />
        <OpsMetricLink href={href(scoped, { view: 'quality', page: undefined })} title="Điểm trung bình" value={metrics.average ?? '—'} note="Trong khoảng ngày đang lọc" />
        <OpsMetricLink href={href(scoped, { view: undefined, page: undefined })} title="Cần xử lý" value={metrics.needs} note="Trong khoảng ngày đang lọc" />
        <OpsMetricLink href={href(scoped, { view: 'all', status: 'RESOLVED', page: undefined })} title="Đã xử lý" value={metrics.resolved} note="Trong khoảng ngày đang lọc" />
      </div>

      <OpsTabs
        ariaLabel="Chế độ xem phản hồi"
        tabs={[
          { href: href(scoped, { view: undefined, status: undefined }), label: 'Cần xử lý', active: view === 'attention' },
          { href: href(scoped, { view: 'all', status: undefined }), label: 'Tất cả phản hồi', active: view === 'all' },
          { href: href(scoped, { view: 'quality', status: undefined }), label: 'Tổng quan chất lượng', active: view === 'quality' },
        ]}
      />

      <OperationsFilterBar
        action="/admin/feedback"
        hidden={{ view: view === 'attention' ? undefined : view }}
        resetHref={href({ view: view === 'attention' ? undefined : view, from: scoped.from, to: scoped.to })}
        fields={[
          { name: 'branch', label: 'Chi nhánh', type: 'select', value: scoped.branch, options: branchRows },
          { name: 'class', label: 'Ca dạy', type: 'select', value: scoped.class, options: classRows.map(c => ({ id: c.id, name: c.name })) },
          { name: 'teacher', label: 'Giáo viên', type: 'select', value: scoped.teacher, options: teacherRows.map(t => ({ id: t.id, name: t.full_name || t.teacher_code })) },
          { name: 'rating', label: 'Đánh giá', type: 'select', value: params.rating, options: [1, 2, 3, 4, 5].map(n => ({ id: String(n), name: String(n) })) },
          ...(view === 'all' ? [{ name: 'status', label: 'Trạng thái', type: 'select' as const, value: params.status, options: states }] : []),
          { name: 'respondent', label: 'Người phản hồi', type: 'select', value: params.respondent, options: respondents },
          { name: 'attention', label: 'Attention', type: 'select', value: params.attention, options: [{ id: 'low', name: 'Điểm thấp' }], allLabel: 'Tất cả' },
          { name: 'q', label: 'Tìm học viên', type: 'search', value: params.q },
          { name: 'from', label: 'Từ ngày', type: 'date', value: scoped.from },
          { name: 'to', label: 'Đến ngày', type: 'date', value: scoped.to },
        ]}
      />

      {view === 'quality' ? (
        <section className="space-y-3">
          <p>Tỷ lệ điểm thấp: {metrics.lowRate ?? '—'}%. Tỷ lệ đã xử lý: {metrics.resolutionRate ?? '—'}%.</p>
          <Table headers={['Giáo viên', 'Số phản hồi', 'Điểm trung bình']} rows={metrics.teachers.map(row => [row.name, row.total, row.total ? Math.round(row.sum / row.total * 10) / 10 : '—'])} />
          <Table headers={['Chi nhánh', 'Số phản hồi', 'Điểm trung bình']} rows={metrics.branches.map(row => [row.name, row.total, row.total ? Math.round(row.sum / row.total * 10) / 10 : '—'])} />
        </section>
      ) : (
        <>
          {!list.data.length && view === 'attention' && <EmptyState>Không có phản hồi cần xử lý.</EmptyState>}
          {!list.data.length && view === 'all' && <EmptyState>Chưa có phản hồi trong khoảng thời gian này.</EmptyState>}
          {!!list.data.length && (
            <Table
              headers={['Buổi học', 'Học viên', 'Lớp', 'Giáo viên', 'Chi nhánh', 'Người phản hồi', 'Đánh giá', 'Trạng thái', 'Hành động']}
              rows={list.data.map(f => [
                <Link key={f.id} prefetch={false} href={'/admin/feedback/' + f.id}>{timeText(f.session_starts_at)} • {f.context_snapshot.class_name}</Link>,
                f.context_snapshot.student_name + ' (' + f.context_snapshot.student_code + ')',
                f.context_snapshot.class_name,
                f.context_snapshot.teacher_name,
                f.context_snapshot.branch_name,
                respondents.find(r => r.id === f.respondent_type)?.name,
                <span key="rating" className={f.is_low_rating ? 'font-semibold text-red-800' : undefined}>★ {f.overall_rating}/5{f.is_low_rating ? ' • Điểm thấp' : ''}</span>,
                <OpsStatusBadge key="status" status={f.resolution_status} labels={stateLabels} />,
                <Link key="act" prefetch={false} href={'/admin/feedback/' + f.id} className="vibe-button">Xử lý</Link>,
              ])}
            />
          )}
          <Pager path="/admin/feedback" params={{ ...scoped, view: view === 'attention' ? undefined : view }} {...list} />
        </>
      )}
    </AppPage>
  )
}
