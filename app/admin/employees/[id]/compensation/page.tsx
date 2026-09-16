import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminClient, uuidPattern, vietnamDateTime, type Params } from '@/app/admin/finance/operations'
import { all, rows, branches } from '@/app/admin/finance/query'
import { Panel, Table, Select, Field, Notice, LoadError, dateText, timeText } from '@/app/admin/finance/_components/ui'
import SubmitButton from '@/app/admin/finance/_components/SubmitButton'
import { payTypes, money } from '@/app/admin/payroll/data'
import type { Employee } from '../../data'
import { configureCompensation } from './actions'
export default async function CompensationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params, p = await searchParams, db = await adminClient()
  if (!uuidPattern.test(id)) notFound()
  const employeeResult = await db.from('employee_directory').select('*').eq('id', id).maybeSingle<Employee>()
  if (employeeResult.error) return <LoadError/>
  const employee = employeeResult.data
  if (!employee) notFound()
  let loaded
  try {
    loaded = await Promise.all([
      all((from, to) => db.from('teacher_compensation_rules').select('id,branch_id,pay_type,class_type,rate,currency,effective_from,effective_to,status,reason,created_by,created_at').or(`employee_id.eq.${id}${employee.teacher_id ? ',teacher_id.eq.' + employee.teacher_id : ''}`).order('effective_from', { ascending: false }).order('id').range(from, to)),
      branches(db),
      rows(db.from('teacher_payrolls').select('id,period_id,teacher_name,pay_type,currency,gross_amount,payroll_periods(starts_on,status)').or(`employee_id.eq.${id}${employee.teacher_id ? ',teacher_id.eq.' + employee.teacher_id : ''}`).order('period_id', { ascending: false }).limit(50)),
    ])
  } catch { return <LoadError/> }
  const [rules, branchRows, payrolls] = loaded, today = vietnamDateTime().slice(0, 10)
  return <div className="min-w-0 space-y-6"><Link prefetch={false} href={'/admin/employees?selected=' + id}>← Hồ sơ nhân viên</Link><h1 className="text-2xl font-bold">Cấu hình lương — {employee.employee_code}</h1><Notice params={p}/><p>{employee.full_name} • Đơn vị gốc {employee.home_unit} • Phân công {employee.unit_code} • {employee.employment_status} • {employee.pay_type}</p><Link prefetch={false} href={'/admin/employees/attendance?employee=' + id}>Chấm công nhân viên</Link>
    <Panel title="Mức lương và lịch sử"><p>Hiệu lực được xác định theo ngày Việt Nam. Mỗi dòng là một mức riêng; không ghi đè mức cũ. Lương tháng phải phủ toàn kỳ. Mức không có ngày kết thúc sẽ chặn mức tiếp theo bị trùng; hiện chưa có thao tác kết thúc mức mở.</p><Table headers={['Hiệu lực', 'Loại / lớp', 'Chi nhánh', 'Mức lương', 'Áp dụng hôm nay', 'Lý do', 'Người tạo / thời gian']} rows={rules.map(r => [dateText(r.effective_from) + ' → ' + (r.effective_to ? dateText(r.effective_to) : 'Không giới hạn'), r.pay_type + (r.class_type ? ' / ' + r.class_type : ''), branchRows.find(b => b.id === r.branch_id)?.name || r.branch_id, money(r.rate, r.currency), r.status === 'ACTIVE' && r.effective_from <= today && (!r.effective_to || r.effective_to >= today) ? 'Có' : 'Không', r.reason || 'Mức cũ chưa ghi lý do', r.created_by + ' • ' + timeText(r.created_at)])}/></Panel>
    <Panel title="Thêm mức lương"><form action={configureCompensation} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="employee" value={id}/><Select name="type" label="Hình thức lương" required options={employee.teacher_id ? payTypes : payTypes.filter(t => t.id === 'MONTHLY')}/><Select name="branch" label="Chi nhánh trả lương" required options={branchRows}/><Field name="rate" label="Lương tháng đầy đủ / đơn giá buổi / đơn giá giờ" type="number"/><Field name="currency" label="Tiền tệ" value="VND"/><Field name="from" label="Hiệu lực từ" type="date"/><Field name="to" label="Hiệu lực đến" type="date" required={false}/><Select name="class_type" label="Loại lớp (chỉ lương theo buổi)" options={[{ id: 'ONE_ON_ONE', name: 'Cá nhân' }, { id: 'GROUP', name: 'Nhóm' }]}/><Field name="reason" label="Lý do / tham chiếu"/><SubmitButton>Lưu mức lương</SubmitButton></form>{!employee.teacher_id && <p>Lương buổi và giờ cần liên kết giáo viên hiện có trong hồ sơ nhân viên.</p>}</Panel>
    <Panel title="Bảng lương và phiếu lương (tối đa 50 kỳ)"><Table headers={['Kỳ', 'Loại', 'Tổng', 'Trạng thái', 'Phiếu lương']} rows={payrolls.map(pay => { const head = Array.isArray(pay.payroll_periods) ? pay.payroll_periods[0] : pay.payroll_periods; return [<Link key={pay.id} prefetch={false} href={'/admin/payroll/' + pay.period_id + '/' + id}>{head?.starts_on}</Link>, pay.pay_type, money(pay.gross_amount, pay.currency), head?.status, ['APPROVED', 'FINALIZED'].includes(head?.status || '') ? <Link key={pay.id} prefetch={false} href={'/documents/payslips/' + pay.id}>Xem phiếu lương</Link> : 'Chưa phát hành'] })}/></Panel>
  </div>
}
