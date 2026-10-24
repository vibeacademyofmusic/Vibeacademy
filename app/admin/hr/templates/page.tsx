import Link from 'next/link'

import {
  adminClient,
  uuidPattern,
  type Params,
} from '../../finance/operations'

import {
  all,
  branches,
} from '../../finance/query'

import {
  AppPage,
  PageHeader,
  SectionCard,
  InlineNotice,
  DataTable,
  MoneyDisplay,
  StatusBadge,
} from '../../_components/vibe'

import { Notice } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'

import { configureStaffCompensation } from
  '../../employees/[id]/compensation/actions'

type EmployeeOption = {
  id: string
  employee_code: string
  full_name: string | null
  hire_date: string
  teacher_id: string | null
  employment_status: string
}

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
  currency: string | null
  class_type: string | null
  effective_from: string
  effective_to: string | null
  status: string
  reason: string
}

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm'

const categoryName: Record<string, string> = {
  EARNING: 'Thu nhập',
  DEDUCTION: 'Khấu trừ',
  REIMBURSEMENT: 'Hoàn trả',
}
const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const effectiveState = (config: StaffConfig) => {
    if (config.status !== 'ACTIVE') {
      return {
        label: 'Ngừng áp dụng',
        tone: 'neutral' as const,
      }
    }

    if (config.effective_from > today) {
      return {
        label: 'Chưa đến hiệu lực',
        tone: 'info' as const,
      }
    }

    if (
      config.effective_to &&
      config.effective_to < today
    ) {
      return {
        label: 'Đã hết hiệu lực',
        tone: 'neutral' as const,
      }
    }

    return {
      label: 'Đang áp dụng',
      tone: 'success' as const,
    }
  }
function configValue(config: StaffConfig) {
  if (config.calculation_method === 'FIXED_AMOUNT') {
    return (
      <MoneyDisplay
        value={config.amount}
        currency={config.currency || 'VND'}
      />
    )
  }

  if (config.calculation_method === 'PER_SESSION') {
    return (
      <>
        <MoneyDisplay
          value={config.rate}
          currency={config.currency || 'VND'}
        />
        {' / buổi'}
      </>
    )
  }

  return config.calculation_method
}

export default async function Templates({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const p = await searchParams
  const db = await adminClient()

  const [employees, branchRows, catalog] =
    await Promise.all([
      all((from, to) =>
        db
          .from('employee_directory')
          .select(
            'id,employee_code,full_name,hire_date,teacher_id,employment_status'
          )
          .eq('employment_status', 'ACTIVE')
          .order('employee_code')
          .range(from, to)
          .returns<EmployeeOption[]>()
      ),

      branches(db),

      all((from, to) =>
        db
          .from('payroll_component_catalog')
          .select(
            'code,name,category,default_calculation_method,recurring_configurable,status'
          )
          .order('category')
          .order('code')
          .range(from, to)
          .returns<CatalogComponent[]>()
      ),
    ])

  const selectedId =
    uuidPattern.test(p.employee || '')
      ? p.employee!
      : ''

  const employee =
    employees.find((item) => item.id === selectedId)

  let configs: StaffConfig[] = []

  if (employee) {
    configs = await all((from, to) =>
      db
        .from('staff_compensation_components')
        .select(
          'id,employee_id,component_code,branch_id,calculation_method,amount,rate,currency,class_type,effective_from,effective_to,status,reason'
        )
        .eq('employee_id', employee.id)
        .order('effective_from', {
          ascending: false,
        })
        .order('id')
        .range(from, to)
        .returns<StaffConfig[]>()
    )
  }

  const availableCatalog = catalog.filter(
    (item) =>
      item.status === 'ACTIVE' &&
      item.recurring_configurable &&
      ![
        'FIXED_PAY',
        'SOCIAL_INSURANCE',
        'LABOR_INSURANCE',
        'BONUS',
        'TRAVEL_EXPENSE',
      ].includes(item.code)
  )

  const fixedOptions = availableCatalog.filter(
    (item) =>
      item.default_calculation_method ===
        'FIXED_AMOUNT' &&
      ['EARNING', 'DEDUCTION'].includes(
        item.category
      )
  )

  const sessionAvailable =
    availableCatalog.some(
      (item) =>
        item.code === 'TEACHING_PER_SESSION' &&
        item.default_calculation_method ===
          'PER_SESSION'
    )

  const catalogByCode = new Map(
    catalog.map((item) => [item.code, item])
  )

  const branchName = (id: string | null) =>
    branchRows.find((branch) => branch.id === id)
      ?.name ||
    id ||
    'Chưa xác định'

  return (
    <AppPage>
      <PageHeader
        title="Mẫu lương & cấu hình áp dụng"
        description="Chọn nhân viên, xem cấu hình đang có và lưu mức thu nhập hoặc khấu trừ theo ngày hiệu lực."
      />

      <Notice params={p} />

      <SectionCard title="Chọn nhân viên">
        <form
          method="get"
          action="/admin/hr/templates"
          className="vibe-filter"
        >
          <label className="vibe-field">
            <span>Nhân viên</span>

            <select
              name="employee"
              defaultValue={selectedId}
              required
            >
              <option value="">
                Chọn nhân viên
              </option>

              {employees.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.employee_code} —{' '}
                  {item.full_name ||
                    'Chưa có tên'}
                </option>
              ))}
            </select>
          </label>

          <button className="vibe-button vibe-button-primary">
            Mở cấu hình
          </button>

          {employee && (
            <Link
              href="/admin/hr/templates"
              className="vibe-button"
            >
              Bỏ chọn
            </Link>
          )}
        </form>
      </SectionCard>

      {!employee ? (
        <>
          <InlineNotice>
            Chọn một nhân viên để xem và nhập
            cấu hình lương thực tế.
          </InlineNotice>

          <div className="vibe-grid">
            <SectionCard title="Nhân viên lương tháng">
              <p>
                Lương tháng + khoản cộng định
                kỳ + BHXH+BHLĐ.
              </p>
            </SectionCard>

            <SectionCard title="Giáo viên theo buổi">
              <p>
                Đơn giá theo buổi, loại lớp và
                ngày hiệu lực.
              </p>
            </SectionCard>

            <SectionCard title="Nhân viên kiêm giảng dạy">
              <p>
                Lương tháng + đơn giá dạy theo
                buổi + các khoản áp dụng.
              </p>
            </SectionCard>
          </div>
        </>
      ) : (
        <>
          <SectionCard title="Nhân viên đang cấu hình">
            <div className="vibe-actions">
              <strong>
                {employee.full_name ||
                  employee.employee_code}
              </strong>

              <StatusBadge>
                {employee.employee_code}
              </StatusBadge>

              <span>
                Ngày vào làm: {employee.hire_date}
              </span>

              {employee.teacher_id && (
                <StatusBadge tone="info">
                  Có hồ sơ giáo viên
                </StatusBadge>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Cấu hình hiện tại & lịch sử hiệu lực">
            <DataTable
              headers={[
                'Thành phần',
                'Giá trị',
                'Chi nhánh',
                'Hiệu lực',
                'Trạng thái',
                'Lý do',
              ]}
              rows={configs.map((config) => {
                const item =
                  catalogByCode.get(
                    config.component_code
                  )
                  const state = effectiveState(config)
                return [
                  <div key={config.id}>
                    <strong>
                    {['SOCIAL_INSURANCE', 'LABOR_INSURANCE'].includes(
  config.component_code
)
  ? `${item?.name || config.component_code} (cũ)`
  : item?.name || config.component_code}
                    </strong>

                    <small className="block text-gray-500">
                      {categoryName[
                        item?.category || ''
                      ] ||
                        item?.category ||
                        config.component_code}
                    </small>
                  </div>,

                  configValue(config),

                  branchName(config.branch_id),

                  `${config.effective_from} → ${
                    config.effective_to ||
                    'Đến khi điều chỉnh'
                  }`,

                  <StatusBadge
  key="status"
  tone={state.tone}
>
  {state.label}
</StatusBadge>,

config.reason,

                  config.reason,
                ]
              })}
            />
          </SectionCard>

          <SectionCard title="Thêm thu nhập / khấu trừ cố định">
            <form
              action={configureStaffCompensation}
              className="vibe-grid"
            >
              <input
                type="hidden"
                name="employee"
                value={employee.id}
              />

              <input
                type="hidden"
                name="workspace"
                value="hr_templates"
              />

              <label className="vibe-field">
                <span>
                  Thành phần thu nhập / khấu trừ
                </span>

                <select
                  name="component_code"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Chọn thành phần
                  </option>

                  {fixedOptions.map((item) => (
                    <option
                      key={item.code}
                      value={item.code}
                    >
                      {item.name} —{' '}
                      {categoryName[
                        item.category
                      ] || item.category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="vibe-field">
                <span>Chi nhánh trả lương</span>

                <select
                  name="branch"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Chọn chi nhánh
                  </option>

                  {branchRows.map((branch) => (
                    <option
                      key={branch.id}
                      value={branch.id}
                    >
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="vibe-field">
                <span>Số tiền mỗi tháng</span>

                <input
                  name="value"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]{1,12}([.][0-9]{1,2})?"
                  required
                />
              </label>

              <label className="vibe-field">
                <span>Tiền tệ</span>

                <input
                  name="currency"
                  defaultValue="VND"
                  pattern="[A-Z]{3}"
                  required
                />
              </label>

              <label className="vibe-field">
                <span>Hiệu lực từ</span>

                <input
                  name="from"
                  type="date"
                  min={employee.hire_date}
                  required
                />
              </label>

              <label className="vibe-field">
                <span>
                  Hiệu lực đến
                  {' '}(có thể để trống)
                </span>

                <input
                  name="to"
                  type="date"
                  min={employee.hire_date}
                />
              </label>

              <label className="vibe-field sm:col-span-2">
                <span>
                  Lý do / tham chiếu quyết định
                </span>

                <textarea
                  name="reason"
                  rows={3}
                  maxLength={2000}
                  required
                  className={inputClass}
                />
              </label>

              <div>
                <SubmitButton>
                  Lưu cấu hình
                </SubmitButton>
              </div>
            </form>

            <InlineNotice>
              Lưu cấu hình không tự sửa kỳ lương
              đã tính. Kỳ lương phải được đối
              chiếu và tính lại bằng workflow
              riêng.
            </InlineNotice>
          </SectionCard>

          {employee.teacher_id &&
            sessionAvailable && (
              <SectionCard title="Đơn giá dạy theo buổi">
                <form
                  action={
                    configureStaffCompensation
                  }
                  className="vibe-grid"
                >
                  <input
                    type="hidden"
                    name="employee"
                    value={employee.id}
                  />

                  <input
                    type="hidden"
                    name="workspace"
                    value="hr_templates"
                  />

                  <input
                    type="hidden"
                    name="component_code"
                    value="TEACHING_PER_SESSION"
                  />

                  <label className="vibe-field">
                    <span>Phạm vi loại lớp</span>

                    <select
                      name="class_type"
                      defaultValue=""
                    >
                      <option value="">
                        Tất cả loại lớp
                      </option>

                      <option value="ONE_ON_ONE">
                        Lớp cá nhân
                      </option>

                      <option value="GROUP">
                        Lớp nhóm
                      </option>
                    </select>
                  </label>

                  <label className="vibe-field">
                    <span>
                      Chi nhánh giảng dạy
                    </span>

                    <select
                      name="branch"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Chọn chi nhánh
                      </option>

                      {branchRows.map(
                        (branch) => (
                          <option
                            key={branch.id}
                            value={branch.id}
                          >
                            {branch.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="vibe-field">
                    <span>
                      Đơn giá mỗi buổi
                    </span>

                    <input
                      name="value"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]{1,12}([.][0-9]{1,2})?"
                      required
                    />
                  </label>

                  <label className="vibe-field">
                    <span>Tiền tệ</span>

                    <input
                      name="currency"
                      defaultValue="VND"
                      pattern="[A-Z]{3}"
                      required
                    />
                  </label>

                  <label className="vibe-field">
                    <span>Hiệu lực từ</span>

                    <input
                      name="from"
                      type="date"
                      min={employee.hire_date}
                      required
                    />
                  </label>

                  <label className="vibe-field">
                    <span>
                      Hiệu lực đến
                      {' '}(có thể để trống)
                    </span>

                    <input
                      name="to"
                      type="date"
                      min={employee.hire_date}
                    />
                  </label>

                  <label className="vibe-field sm:col-span-2">
                    <span>
                      Lý do / tham chiếu quyết định
                    </span>

                    <textarea
                      name="reason"
                      rows={3}
                      maxLength={2000}
                      required
                      className={inputClass}
                    />
                  </label>

                  <div>
                    <SubmitButton>
                      Lưu đơn giá theo buổi
                    </SubmitButton>
                  </div>
                </form>
              </SectionCard>
            )}
        </>
      )}
    </AppPage>
  )
}