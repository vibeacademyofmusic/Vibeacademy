import Link from 'next/link'
import { adminClient, vietnamDateTime, type Params } from '../../finance/operations'
import { branches } from '../../finance/query'
import { Panel, Select, Field, Table, Pager, Notice, LoadError, inputClass, dateText, timeText } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { reportList, enrollmentChoices, types, statuses, latestMonthlyReport } from './data'
import { generateReport } from './actions'
import { monthlyPeriod } from './periods'
export default async function LearningReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  let loaded
  try { loaded = await Promise.all([reportList(db, params), branches(db), enrollmentChoices(db, params)]) } catch { return <LoadError /> }
  const [list, branchRows, choices] = loaded
  const selected = choices.data.find(e => e.id === params.enrollment)
  let latest = null
  try { if (selected) latest = await latestMonthlyReport(db, selected.id) } catch { return <LoadError /> }
  const period = selected ? monthlyPeriod(selected.started_at, latest?.period_end) : null
  const today = vietnamDateTime().slice(0, 10)
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Báo cáo học tập</h1><Notice params={params} />
    <form className="grid gap-3 sm:grid-cols-3"><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} /><Select name="type" label="Loại báo cáo" options={types} value={params.type} /><Select name="status" label="Trạng thái" options={statuses} value={params.status} /><Field name="month" type="month" label="Tháng bắt đầu kỳ" value={params.month} required={false} /><Field name="search" label="Tên / mã học viên" value={params.search} required={false} /><button className="rounded border p-2">Lọc báo cáo</button></form>
    <Table headers={['Học viên', 'Chi nhánh', 'Loại', 'Kỳ báo cáo', 'Trạng thái', 'Tạo / duyệt']} rows={list.data.map(r => [<Link key={r.id} prefetch={false} href={'/admin/reports/learning/' + r.id}>{r.student_name} ({r.student_code})</Link>, r.branch_name, types.find(t => t.id === r.report_type)?.name, dateText(r.period_start) + ' → ' + dateText(r.period_end), statuses.find(s => s.id === r.status)?.name, timeText(r.generated_at) + (r.approved_at ? ' / ' + timeText(r.approved_at) : '')])} />
    <Pager path="/admin/reports/learning" params={params} {...list} />
    <Panel title="Tạo báo cáo"><p>Chọn ghi danh để xác định lớp, chi nhánh và chương trình. Báo cáo tháng đầu bắt đầu từ ngày vào học: nếu là ngày 1 thì đến cuối tháng đó, nếu sau ngày 1 thì đến cuối tháng kế tiếp. Những kỳ sau bao phủ trọn tháng; tổng kết cuối khóa được tạo thủ công cho kỳ đã kết thúc. Không tự nâng Grade hoặc gửi thông báo.</p>
      <form className="flex flex-wrap items-end gap-3"><Field name="student" label="Tìm ghi danh theo học viên" value={params.student} required={false} /><button className="rounded border p-2">Tìm ghi danh</button></form>
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="student" value={params.student ?? ''} />
        <input type="hidden" name="enrollments_page" value={params.enrollments_page ?? '1'} />
        <Select name="enrollment" label="Ghi danh" required value={selected?.id} options={choices.data.map(e => ({ id: e.id, name: `${e.students.full_name} (${e.students.student_code}) — ${e.classes.name} / ${e.classes.branches.name} — bắt đầu ${dateText(e.started_at)}` }))} />
        <button className="rounded border p-2">Xem kỳ gợi ý</button>
      </form>
      {selected && period && <div className="space-y-3" key={selected.id}>
        <p>Đang tạo cho {selected.students.full_name} — {selected.classes.name}. Ngày bắt đầu: {dateText(selected.started_at)}{selected.ended_at ? `; kết thúc: ${dateText(selected.ended_at)}` : ''}.</p>
        <p>{period.first ? 'Kỳ tháng đầu tiên' : 'Kỳ tháng tiếp theo'}: {dateText(period.start)} → {dateText(period.end)}. Chỉ tạo được sau ngày kết thúc kỳ.</p>
        {period.end >= today && <p role="status" className="text-amber-900">Kỳ gợi ý chưa kết thúc; chưa thể tạo báo cáo tháng này.</p>}
        {selected.ended_at && period.end > selected.ended_at && <p role="status" className="text-amber-900">Kỳ tháng vượt ngày kết thúc ghi danh. Hãy chọn Tổng kết cuối khóa và nhập kỳ phù hợp; không tự rút ngắn báo cáo tháng.</p>}
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
    </Panel>
  </div>
}
