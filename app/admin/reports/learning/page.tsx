import Link from 'next/link'
import { adminClient, type Params } from '../../finance/operations'
import { branches } from '../../finance/query'
import { Panel, Select, Field, Table, Pager, Notice, LoadError, dateText, timeText } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { reportList, enrollmentChoices, types, statuses } from './data'
import { generateReport } from './actions'
export default async function LearningReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  let loaded
  try { loaded = await Promise.all([reportList(db, params), branches(db), enrollmentChoices(db, params)]) } catch { return <LoadError /> }
  const [list, branchRows, choices] = loaded
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Báo cáo học tập</h1><Notice params={params} />
    <form className="grid gap-3 sm:grid-cols-3"><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} /><Select name="type" label="Loại báo cáo" options={types} value={params.type} /><Select name="status" label="Trạng thái" options={statuses} value={params.status} /><Field name="month" type="month" label="Tháng bắt đầu kỳ" value={params.month} required={false} /><Field name="search" label="Tên / mã học viên" value={params.search} required={false} /><button className="rounded border p-2">Lọc báo cáo</button></form>
    <Table headers={['Học viên', 'Chi nhánh', 'Loại', 'Kỳ báo cáo', 'Trạng thái', 'Tạo / duyệt']} rows={list.data.map(r => [<Link key={r.id} prefetch={false} href={'/admin/reports/learning/' + r.id}>{r.student_name} ({r.student_code})</Link>, r.branch_name, types.find(t => t.id === r.report_type)?.name, dateText(r.period_start) + ' → ' + dateText(r.period_end), statuses.find(s => s.id === r.status)?.name, timeText(r.generated_at) + (r.approved_at ? ' / ' + timeText(r.approved_at) : '')])} />
    <Pager path="/admin/reports/learning" params={params} {...list} />
    <Panel title="Tạo báo cáo"><p>Chọn ghi danh để xác định lớp, chi nhánh và chương trình. Báo cáo tháng dùng đủ tháng đã kết thúc; tổng kết cuối khóa được tạo thủ công cho kỳ đã kết thúc. Không tự nâng Grade hoặc gửi thông báo.</p>
      <form className="flex flex-wrap items-end gap-3"><Field name="student" label="Tìm ghi danh theo học viên" value={params.student} required={false} /><button className="rounded border p-2">Tìm ghi danh</button></form>
      <form action={generateReport} className="grid gap-3 sm:grid-cols-2"><Select name="enrollment_id" label="Ghi danh" required options={choices.data.map(e => ({ id: e.id, name: `${e.students.full_name} (${e.students.student_code}) — ${e.classes.name} / ${e.classes.branches.name}` }))} /><Select name="type" label="Loại báo cáo" options={types} required /><Field name="start" label="Từ ngày" type="date" /><Field name="end" label="Đến ngày" type="date" /><SubmitButton>Tạo báo cáo</SubmitButton></form>
      <Pager path="/admin/reports/learning" params={params} keyName="enrollments_page" {...choices} />
    </Panel>
  </div>
}
