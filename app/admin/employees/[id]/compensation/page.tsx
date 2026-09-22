import { EmployeeSections } from '../../../_components/vibe'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminClient, uuidPattern, vietnamDateTime, type Params } from '@/app/admin/finance/operations'
import { all, rows, branches } from '@/app/admin/finance/query'
import { Panel, Table, Notice, LoadError, dateText, timeText } from '@/app/admin/finance/_components/ui'
import SubmitButton from '@/app/admin/finance/_components/SubmitButton'
import { money } from '@/app/admin/payroll/data'
import type { Employee } from '../../data'
import { configureStaffCompensation } from './actions'

type CatalogComponent = {
  code: string
  name: string
  category: string
  default_calculation_method: string
  recurring_configurable: boolean
  status: string
}
type StaffConfig = {
  id: string
  employee_id: string
  component_code: string
  branch_id: string | null
  calculation_method: string
  amount: string | number | null
  rate: string | number | null
  percentage: string | number | null
  basis_component_code: string | null
  currency: string | null
  class_type: string | null
  effective_from: string
  effective_to: string | null
  status: string
  reason: string
  created_by: string
  created_at: string
}
type LegacyRule = {
  id: string
  branch_id: string | null
  pay_type: string
  class_type: string | null
  rate: string | number
  currency: string
  effective_from: string
  effective_to: string | null
  status: string
  reason: string | null
  created_by: string | null
  created_at: string
}
type PeriodSummary = { starts_on: string; status: string }
type PayrollSummary = {
  id: string
  period_id: string
  teacher_name: string
  pay_type: string
  currency: string
  gross_amount: number | string
  v2_net_amount: number | string | null
  calculation_version: string | null
  payroll_periods: PeriodSummary | PeriodSummary[] | null
}
type BranchOption = { id: string; name: string }

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm'
const categoryName: Record<string, string> = {
  EARNING: 'Thu nhập',
  DEDUCTION: 'Khấu trừ',
  REIMBURSEMENT: 'Hoàn trả',
}

function configValue(config: StaffConfig): string {
  if (config.calculation_method === 'FIXED_AMOUNT') {
    return config.amount !== null && config.currency
      ? money(config.amount, config.currency)
      : 'Thiếu số tiền hoặc tiền tệ — cần kiểm tra'
  }
  if (['PER_SESSION', 'PER_HOUR'].includes(config.calculation_method)) {
    return config.rate !== null && config.currency
      ? `${money(config.rate, config.currency)} / ${config.calculation_method === 'PER_SESSION' ? 'buổi' : 'giờ'}`
      : 'Thiếu đơn giá hoặc tiền tệ — cần kiểm tra'
  }
  if (config.calculation_method === 'PERCENTAGE') {
    return `${config.percentage ?? '—'}% của ${config.basis_component_code ?? '—'} (Payroll V2.1 chưa hỗ trợ)`
  }
  return config.calculation_method
}

function effectiveLabel(config: StaffConfig, today: string): string {
  if (config.status !== 'ACTIVE') return 'Ngừng áp dụng'
  if (config.effective_from > today) return 'Chưa đến hiệu lực'
  if (config.effective_to && config.effective_to < today) return 'Đã hết hiệu lực'
  return 'Đang hiệu lực'
}

// Native inputs are used here so no assumptions are made about the shared
// Field component's supported props. Names match the new Server Action exactly.
function CommonFields({ prefix, branchRows, hireDate, perSession = false }: {
  prefix: string
  branchRows: BranchOption[]
  hireDate: string
  perSession?: boolean
}) {
  return <>
    <label htmlFor={`${prefix}-branch`} className="text-sm font-medium">
      Chi nhánh trả lương *
      <select id={`${prefix}-branch`} name="branch" required defaultValue="" className={inputClass}>
        <option value="" disabled>Chọn chi nhánh</option>
        {branchRows.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
    </label>
    <label htmlFor={`${prefix}-value`} className="text-sm font-medium">
      {perSession ? 'Đơn giá mỗi buổi *' : 'Số tiền mỗi kỳ tháng đầy đủ *'}
      <input id={`${prefix}-value`} name="value" type="text" inputMode="decimal"
        pattern="[0-9]{1,12}([.][0-9]{1,2})?" maxLength={15} required className={inputClass}
        aria-describedby={`${prefix}-value-help`} />
      <span id={`${prefix}-value-help`} className="mt-1 block text-xs font-normal text-gray-600">
        Nhập số dương, không dấu phân cách hàng nghìn; tối đa 2 số thập phân.
        {!perSession && ' Khoản khấu trừ cũng nhập số dương; hệ thống trừ theo nhóm của khoản.'}
      </span>
    </label>
    <label htmlFor={`${prefix}-currency`} className="text-sm font-medium">
      Tiền tệ *
      <input id={`${prefix}-currency`} name="currency" defaultValue="VND" pattern="[A-Z]{3}"
        maxLength={3} required className={inputClass} />
    </label>
    <label htmlFor={`${prefix}-from`} className="text-sm font-medium">
      Hiệu lực từ *
      <input id={`${prefix}-from`} name="from" type="date" min={hireDate || undefined}
        required className={inputClass} />
    </label>
    <label htmlFor={`${prefix}-to`} className="text-sm font-medium">
      Hiệu lực đến (có thể để trống)
      <input id={`${prefix}-to`} name="to" type="date" min={hireDate || undefined} className={inputClass} />
    </label>
    <label htmlFor={`${prefix}-reason`} className="text-sm font-medium sm:col-span-2">
      Lý do / tham chiếu quyết định *
      <textarea id={`${prefix}-reason`} name="reason" required maxLength={2000} rows={3} className={inputClass} />
    </label>
  </>
}

export default async function CompensationPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Params>
}) {
  const { id } = await params
  const p = await searchParams
  const db = await adminClient()
  if (!uuidPattern.test(id)) notFound()

  const employeeResult = await db.from('employee_directory').select('*').eq('id', id).maybeSingle<Employee>()
  if (employeeResult.error) return <LoadError />
  const employee = employeeResult.data
  if (!employee) notFound()

  let configs: StaffConfig[] = []
  let catalog: CatalogComponent[] = []
  let branchRows: BranchOption[] = []
  let legacyRules: LegacyRule[] = []
  let payrolls: PayrollSummary[] = []
  let canConfigure = false
  let roleCheckFailed = false
  try {
    const loaded = await Promise.all([
      all((from, to) => db.from('staff_compensation_components')
        .select('id,employee_id,component_code,branch_id,calculation_method,amount,rate,percentage,basis_component_code,currency,class_type,effective_from,effective_to,status,reason,created_by,created_at')
        .eq('employee_id', id).order('effective_from', { ascending: false }).order('id')
        .range(from, to).returns<StaffConfig[]>()),
      all((from, to) => db.from('payroll_component_catalog')
        .select('code,name,category,default_calculation_method,recurring_configurable,status')
        .order('category').order('code').range(from, to).returns<CatalogComponent[]>()),
      branches(db),
      // Retain V1 history as read-only. Never merge it into V2 config totals.
      all((from, to) => db.from('teacher_compensation_rules')
        .select('id,branch_id,pay_type,class_type,rate,currency,effective_from,effective_to,status,reason,created_by,created_at')
        .or(`employee_id.eq.${id}${employee.teacher_id ? ',teacher_id.eq.' + employee.teacher_id : ''}`)
        .order('effective_from', { ascending: false }).order('id').range(from, to).returns<LegacyRule[]>()),
      rows(db.from('teacher_payrolls')
        .select('id,period_id,teacher_name,pay_type,currency,gross_amount,v2_net_amount,calculation_version,payroll_periods(starts_on,status)')
        .or(`employee_id.eq.${id}${employee.teacher_id ? ',teacher_id.eq.' + employee.teacher_id : ''}`)
        .order('period_id', { ascending: false }).limit(50).returns<PayrollSummary[]>()),
      db.rpc('has_role', { role_code: 'SUPER_ADMIN' }),
    ])
    configs = loaded[0]
    catalog = loaded[1]
    branchRows = loaded[2]
    legacyRules = loaded[3]
    payrolls = loaded[4]
    roleCheckFailed = Boolean(loaded[5].error)
    canConfigure = !roleCheckFailed && loaded[5].data === true
  } catch {
    return <LoadError />
  }

  const today = vietnamDateTime().slice(0, 10)
  const catalogByCode = new Map(catalog.map(row => [row.code, row]))
  const availableCatalog = catalog.filter(row => row.status === 'ACTIVE' && row.recurring_configurable && !['FIXED_PAY', 'SOCIAL_INSURANCE', 'LABOR_INSURANCE', 'BONUS', 'TRAVEL_EXPENSE'].includes(row.code))
  const fixedOptions = availableCatalog.filter(row =>
    row.default_calculation_method === 'FIXED_AMOUNT' && ['EARNING', 'DEDUCTION'].includes(row.category))
  const sessionAvailable = availableCatalog.some(row =>
    row.code === 'TEACHING_PER_SESSION' && row.category === 'EARNING' && row.default_calculation_method === 'PER_SESSION')
  const branchName = (branch: string | null) =>
    branchRows.find(row => row.id === branch)?.name || branch || 'Chưa xác định chi nhánh'

  return <div className="min-w-0 space-y-6">
    <Link prefetch={false} href={'/admin/employees?selected=' + id}>← Hồ sơ nhân viên</Link>
    <h1 className="text-2xl font-bold">Cấu hình thu nhập &amp; khấu trừ — {employee.employee_code}</h1>
    <Notice params={p} /><EmployeeSections id={id}/>
    <p>{employee.full_name} • Đơn vị gốc {employee.home_unit} • Phân công {employee.unit_code} • {employee.employment_status}</p>
    <Link prefetch={false} href={'/admin/employees/attendance?employee=' + id}>Chấm công nhân viên</Link>

    <Panel title="Cấu hình Staff V2 và lịch sử hiệu lực">
      <p className="mb-3 text-sm text-gray-600">
        Nguồn: staff_compensation_components. Mỗi dòng là một thành phần riêng có ngày hiệu lực.
        Lương tháng dùng BASE_SALARY; không tạo thêm Lương cố định. Không nhập lại khoản đã có bên dưới.
      </p>
      <Table headers={['Thành phần / nhóm', 'Hiệu lực', 'Chi nhánh', 'Số tiền / đơn giá', 'Áp dụng hôm nay', 'Lý do', 'Người tạo / thời gian']}
        rows={configs.map(config => {
          const item = catalogByCode.get(config.component_code)
          return [
            <div key={config.id}>
              <p className="font-medium">{item?.name || config.component_code}</p>
              <p className="text-xs text-gray-500">{item ? categoryName[item.category] || item.category : 'Chưa xác định nhóm'} • {config.component_code}</p>
              {item?.status === 'INACTIVE' && <p className="text-xs text-amber-700">Mã đã ngừng dùng — giữ để đối chiếu lịch sử</p>}
              {config.calculation_method === 'PER_SESSION' && <p className="text-xs text-gray-500">{config.class_type === 'ONE_ON_ONE' ? 'Lớp cá nhân' : config.class_type === 'GROUP' ? 'Lớp nhóm' : 'Tất cả loại lớp'}</p>}
            </div>,
            dateText(config.effective_from) + ' → ' + (config.effective_to ? dateText(config.effective_to) : 'Không giới hạn'),
            branchName(config.branch_id), configValue(config), effectiveLabel(config, today),
            config.reason, config.created_by + ' • ' + timeText(config.created_at),
          ]
        })} />
      <p className="mt-3 text-sm text-gray-600">
        Lưu cấu hình không tự thay đổi số tiền của kỳ đã tính, đang REVIEW hoặc đã duyệt/chốt.
        Cần xử lý việc tính lại theo workflow của kỳ lương, không sửa trực tiếp các dòng lịch sử.
      </p>
    </Panel>

    {canConfigure ? <>
      <Panel title="Thêm thu nhập / khấu trừ cố định">
        <p className="mb-4 text-sm text-gray-600">
          Dùng cho lương tháng, lương vị trí, trợ cấp công tác và các khoản bảo hiểm có trong danh mục.
          Các mã bảo hiểm hiện thuộc nhóm Khấu trừ. Nhập số tiền đã được xác định theo hồ sơ/chính sách áp dụng;
          form này không tự tính tỷ lệ bảo hiểm, thuế hoặc phần doanh nghiệp đóng.
        </p>
        {fixedOptions.length > 0 && branchRows.length > 0 ?
          <form action={configureStaffCompensation} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="employee" value={id} />
            <label htmlFor="fixed-component" className="text-sm font-medium">
              Thành phần thu nhập / khấu trừ *
              <select id="fixed-component" name="component_code" required defaultValue="" className={inputClass}>
                <option value="" disabled>Chọn thành phần</option>
                {fixedOptions.map(item => <option key={item.code} value={item.code}>
                  {item.name} — {categoryName[item.category] || item.category}
                </option>)}
              </select>
            </label>
            <CommonFields prefix="fixed" branchRows={branchRows} hireDate={employee.hire_date} />
            <p className="text-sm text-amber-800 sm:col-span-2">
              Payroll V2.1 yêu cầu khoản cố định phủ trọn kỳ tháng. Chọn đúng ngày hiệu lực thực tế;
              chưa hỗ trợ tự chia theo số ngày khi bắt đầu/kết thúc giữa tháng. Không tự lùi ngày chỉ để đủ điều kiện tính.
            </p>
            <div className="sm:col-span-2"><SubmitButton>Lưu cấu hình Staff V2</SubmitButton></div>
          </form> : <p>Chưa có danh mục hoặc chi nhánh phù hợp. Không thể tạo cấu hình.</p>}
      </Panel>

      <details className="rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-semibold">Thêm đơn giá dạy theo buổi</summary>
        <p className="my-3 text-sm text-gray-600">Chỉ thêm mức mới khi chưa có cấu hình cùng phạm vi và hiệu lực. Đơn giá đã xuất hiện trong danh sách V2 không cần nhập lại.</p>
        {employee.teacher_id && sessionAvailable && branchRows.length > 0 ?
          <form action={configureStaffCompensation} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="employee" value={id} />
            <input type="hidden" name="component_code" value="TEACHING_PER_SESSION" />
            <label htmlFor="session-class" className="text-sm font-medium">
              Phạm vi loại lớp
              <select id="session-class" name="class_type" defaultValue="" className={inputClass}>
                <option value="">Tất cả loại lớp</option>
                <option value="ONE_ON_ONE">Lớp cá nhân</option>
                <option value="GROUP">Lớp nhóm</option>
              </select>
            </label>
            <CommonFields prefix="session" branchRows={branchRows} hireDate={employee.hire_date} perSession />
            <p className="text-sm text-gray-600 sm:col-span-2">RPC kiểm tra liên kết giáo viên, chi nhánh và vai trò TEACHER theo thời gian hiệu lực.</p>
            <div className="sm:col-span-2"><SubmitButton>Lưu đơn giá theo buổi V2</SubmitButton></div>
          </form> : <p className="text-sm">Chưa đủ điều kiện hiển thị form theo buổi: cần liên kết giáo viên, danh mục và chi nhánh phù hợp.</p>}
      </details>
    </> : <Panel title="Quyền cấu hình">
      <p>{roleCheckFailed ? 'Chưa xác nhận được quyền cấu hình. Tải lại trang hoặc kiểm tra đăng nhập.' : 'RPC cấu hình Staff hiện chỉ cho SUPER_ADMIN thực hiện. Các dữ liệu được phép đọc vẫn hiển thị ở trên.'}</p>
    </Panel>}

    <Panel title="Lưu ý về cấu hình và khoản phát sinh">
      <p className="text-sm text-gray-600">
        Cấu hình trùng hiệu lực sẽ bị từ chối, không ghi đè mức cũ. Bước này chỉ bổ sung cấu hình và lịch sử đọc;
        chưa mở thao tác kết thúc/sửa cấu hình cũ. Không tạo lại khoản lương để thay thế dữ liệu đã có.
        Thưởng và công tác phí theo chuyến vẫn thực hiện tại kỳ lương theo luồng đã duyệt, không nhập ở đây.
        Payroll V2.1 chưa hỗ trợ tính theo giờ hoặc phần trăm.
      </p>
    </Panel>

    <details className="rounded-xl border bg-white p-5">
      <summary className="cursor-pointer font-semibold">Mức lương theo cơ chế cũ (V1) — chỉ đọc ({legacyRules.length})</summary>
      <p className="my-3 text-sm text-gray-600">Nguồn teacher_compensation_rules được giữ riêng để đối chiếu. Danh sách này có thể trống dù đã có cấu hình V2; không tự chuyển đổi hoặc cộng vào cấu hình V2.</p>
      <Table headers={['Hiệu lực', 'Loại / lớp', 'Chi nhánh', 'Mức lương', 'Trạng thái', 'Lý do', 'Người tạo / thời gian']}
        rows={legacyRules.map(rule => [
          dateText(rule.effective_from) + ' → ' + (rule.effective_to ? dateText(rule.effective_to) : 'Không giới hạn'),
          rule.pay_type + (rule.class_type ? ' / ' + rule.class_type : ''), branchName(rule.branch_id),
          money(rule.rate, rule.currency), rule.status, rule.reason || 'Mức cũ chưa ghi lý do',
          (rule.created_by || 'Không có thông tin') + ' • ' + timeText(rule.created_at),
        ])} />
    </details>

    <div id="payslips"/><Panel title="Bảng lương và phiếu lương (tối đa 50 kỳ)">
      <Table headers={['Kỳ', 'Phiên bản / loại', 'Tổng phải trả đã tính', 'Trạng thái', 'Phiếu lương']}
        rows={payrolls.map(pay => {
          const head = Array.isArray(pay.payroll_periods) ? pay.payroll_periods[0] : pay.payroll_periods
          const v2 = pay.calculation_version?.startsWith('PAYROLL_V2')
          const total = v2 ? pay.v2_net_amount : pay.gross_amount
          return [
            <Link key={pay.id} prefetch={false} href={'/admin/payroll/' + pay.period_id + '/' + id}>{head?.starts_on || pay.period_id}</Link>,
            pay.calculation_version || pay.pay_type,
            total === null ? 'Chưa có tổng V2 — cần kiểm tra' : money(total, pay.currency),
            head?.status || 'Chưa xác định',
            ['APPROVED', 'FINALIZED'].includes(head?.status || '')
              ? <Link key={pay.id} prefetch={false} href={'/documents/payslips/' + pay.id}>Xem phiếu lương</Link>
              : 'Chưa phát hành',
          ]
        })} />
    </Panel>
  </div>
}
