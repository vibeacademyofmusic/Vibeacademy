import { statusLabels, typeLabels } from '../../_ux/model'
import Link from 'next/link'

import {
  adminClient,
  uuidPattern,
  type Params,
} from '../../../finance/operations'
import { rows } from '../../../finance/query'
import {
  period,
  payrollFields,
  money,
  type Payroll,
} from '../../data'
import { payrollAction } from '../../actions'
import {
  Panel,
  Table,
  Select,
  Field,
  LoadError,
  Notice,
} from '../../../finance/_components/ui'
import SubmitButton from '../../../finance/_components/SubmitButton'

type ComponentLine = {
  component_config_id: string
  id: string
  component_code: string
  category: 'EARNING' | 'REIMBURSEMENT' | 'DEDUCTION'
  calculation_method: string
  source_type: string
  source_session_id: string | null
  earned_on: string
  quantity: number | string
  unit_rate: number | string
  amount: number | string
  currency: string
  source_snapshot: Record<string, unknown>
}

type PeriodAction = {
  id: string
  component_code: 'BONUS' | 'TRAVEL_EXPENSE'
  category: 'EARNING' | 'REIMBURSEMENT'
  source_type: 'MANUAL_BONUS' | 'EXPENSE_CLAIM'
  source_expense_claim_id: string | null
  amount: number | string
  currency: string
  reason: string
  status: 'ACTIVE' | 'CANCELLED'
  created_by: string
  created_at: string
  cancelled_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  approved_by: string | null
  approved_at: string | null
}

type CompensationConfig = {
  id: string
  component_code: string
  calculation_method: string
  amount: number | string | null
  rate: number | string | null
  percentage: number | string | null
  basis_component_code: string | null
  currency: string | null
  class_type: string | null
  effective_from: string
  effective_to: string | null
  status: string
}

type ExpenseClaim = {
  id: string
  title: string
  requested_month: string
  currency: string
  approved_amount: number | string
  reviewed_at: string | null
  review_reason: string | null
}

type LegacyAdjustment = {
  id: string
  kind: string
  amount: number | string
  reason: string
  created_by: string
  approved_by: string | null
}

type LegacyLine = {
  id: string
  session_id: string | null
  earned_on: string
  earning_type: string
  duration_hours: number | string
  rate: number | string
  amount: number | string
  duration_source: string
  calculation_snapshot: Record<string, unknown> | null
}

const componentLabel: Record<string, string> = {
  BASE_SALARY: 'Lương tháng',
  FIXED_PAY: 'Lương cố định',
  POSITION_PAY: 'Lương vị trí',
  TEACHING_PER_SESSION: 'Lương theo buổi',
  BUSINESS_TRIP_ALLOWANCE: 'Trợ cấp công tác',
  SOCIAL_LABOR_INSURANCE: 'BHXH+BHLĐ',
  SOCIAL_INSURANCE: 'Bảo hiểm xã hội (cũ)',
  LABOR_INSURANCE: 'Bảo hiểm lao động (cũ)',
  BONUS: 'Thưởng',
  TRAVEL_EXPENSE: 'Công tác phí hoàn trả', RETROACTIVE_PAY: 'Truy lĩnh kỳ trước',
}

const categoryLabel: Record<string, string> = {
  EARNING: 'Thu nhập',
  REIMBURSEMENT: 'Hoàn trả',
  DEDUCTION: 'Khấu trừ',
}

const recurringOrder = [
  'BASE_SALARY',
  'POSITION_PAY',
  'TEACHING_PER_SESSION',
  'BUSINESS_TRIP_ALLOWANCE',
  'SOCIAL_INSURANCE',
  'LABOR_INSURANCE',
]

const configValue = (
  config: CompensationConfig,
  currency: string
) => {
  if (config.calculation_method === 'FIXED_AMOUNT') {
    return money(config.amount || 0, config.currency || currency)
  }

  if (
    config.calculation_method === 'PER_SESSION' ||
    config.calculation_method === 'PER_HOUR'
  ) {
    const unit =
      config.calculation_method === 'PER_SESSION'
        ? 'buổi'
        : 'giờ'

    return `${money(
      config.rate || 0,
      config.currency || currency
    )} / ${unit}`
  }

  if (config.calculation_method === 'PERCENTAGE') {
    return `${config.percentage || 0}% ${
      config.basis_component_code
        ? `của ${componentLabel[config.basis_component_code] || config.basis_component_code}`
        : ''
    }`
  }

  return config.calculation_method
}

export default async function StaffPayroll({
  params,
  searchParams,
}: {
  params: Promise<{
    period: string
    teacher: string
  }>
  searchParams: Promise<Params>
}) {
  const { period: id, teacher } = await params
  const p = await searchParams
  const db = await adminClient()

  if (!uuidPattern.test(teacher)) {
    return <p>Không tìm thấy nhân sự.</p>
  }

  let head
  let payroll: Payroll | undefined

  try {
    head = await period(db, id)

    ;[payroll] = await rows(
      db
        .from('teacher_payrolls')
        .select(payrollFields)
        .eq('period_id', id)
        .or(
          `teacher_id.eq.${teacher},employee_id.eq.${teacher}`
        )
        .returns<Payroll[]>()
    )
  } catch {
    return <LoadError />
  }

  if (!head || !payroll) {
    return <p>Chưa có bảng lương.</p>
  }

  const isV2 =
    payroll.calculation_version?.startsWith(
      'PAYROLL_V2'
    ) && Boolean(payroll.employee_id)

  let componentLines: ComponentLine[] = []
  let periodActions: PeriodAction[] = []
  let configs: CompensationConfig[] = []
  let approvedClaims: ExpenseClaim[] = []
  let legacyAdjustments: LegacyAdjustment[] = []
  let legacyLines: LegacyLine[] = []

  try {
    const loaded = await Promise.all([
      isV2
        ? rows(
            db
              .from('payroll_component_lines_v2')
              .select(
                'id,component_config_id,component_code,category,calculation_method,source_type,source_session_id,earned_on,quantity,unit_rate,amount,currency,source_snapshot'
              )
              .eq('payroll_id', payroll.id)
              .order('earned_on')
              .order('id')
              .limit(500)
          )
        : Promise.resolve([]),

      isV2 && payroll.employee_id
        ? rows(
            db
              .from('payroll_period_actions_v2')
              .select(
                'id,component_code,category,source_type,source_expense_claim_id,amount,currency,reason,status,created_by,created_at,cancelled_by,cancelled_at,cancel_reason,approved_by,approved_at'
              )
              .eq('period_id', id)
              .eq(
                'employee_id',
                payroll.employee_id
              )
              .order('created_at', {
                ascending: false,
              })
              .limit(100)
          )
        : Promise.resolve([]),

      isV2 && payroll.employee_id
        ? rows(
            db
              .from('staff_compensation_components')
              .select(
                'id,component_code,calculation_method,amount,rate,percentage,basis_component_code,currency,class_type,effective_from,effective_to,status'
              )
              .eq(
                'employee_id',
                payroll.employee_id
              )
              .eq('branch_id', head.branch_id)
              .eq('status', 'ACTIVE')
              .lte(
                'effective_from',
                head.ends_on
              )
              .or(
                `effective_to.is.null,effective_to.gte.${head.starts_on}`
              )
              .order('component_code')
              .order('effective_from', {
                ascending: false,
              })
          )
        : Promise.resolve([]),

      isV2 && payroll.employee_id
        ? rows(
            db
              .from('employee_expense_claims')
              .select(
                'id,title,requested_month,currency,approved_amount,reviewed_at,review_reason'
              )
              .eq(
                'employee_id',
                payroll.employee_id
              )
              .eq('branch_id', head.branch_id)
              .eq(
                'requested_month',
                head.starts_on
              )
              .eq('status', 'APPROVED')
              .eq('currency', payroll.currency)
              .order('reviewed_at', {
                ascending: false,
              })
              .limit(50)
          )
        : Promise.resolve([]),

      rows(
        db
          .from('payroll_adjustments')
          .select(
            'id,kind,amount,reason,created_by,approved_by'
          )
          .eq('payroll_id', payroll.id)
          .order('created_at')
          .limit(100)
      ),

      !isV2
        ? rows(
            db
              .from('payroll_earning_lines')
              .select(
                'id,session_id,earned_on,earning_type,duration_hours,rate,amount,duration_source,calculation_snapshot'
              )
              .eq('payroll_id', payroll.id)
              .order('earned_on')
              .order('id')
              .limit(500)
          )
        : Promise.resolve([]),
    ])

    componentLines = loaded[0] as ComponentLine[]
    periodActions = loaded[1] as PeriodAction[]
    configs = loaded[2] as CompensationConfig[]
    approvedClaims = loaded[3] as ExpenseClaim[]
    legacyAdjustments =
      loaded[4] as LegacyAdjustment[]
    legacyLines = loaded[5] as LegacyLine[]
  } catch {
    return <LoadError />
  }

  const editable = ['GENERATED', 'REVIEW'].includes(
    head.status
  )

  const activeActions = periodActions.filter(
    (action) => action.status === 'ACTIVE'
  )

  const activeClaimIds = new Set(
    activeActions
      .map(
        (action) =>
          action.source_expense_claim_id
      )
      .filter(Boolean)
  )

  const eligibleClaims = approvedClaims.filter(
    (claim) => !activeClaimIds.has(claim.id)
  )

  const calculatedByComponent = new Map<
    string,
    number
  >()

  for (const line of componentLines) {
    calculatedByComponent.set(
      line.component_code,
      (calculatedByComponent.get(
        line.component_code
      ) || 0) + Number(line.amount)
    )
  }

  const activeActionByComponent = new Map<
    string,
    number
  >()

  for (const action of activeActions) {
    activeActionByComponent.set(
      action.component_code,
      (activeActionByComponent.get(
        action.component_code
      ) || 0) + Number(action.amount)
    )
  }

  const currentConfigByCode = new Map<
    string,
    CompensationConfig
  >()

  for (const config of configs) {
    if (
      !currentConfigByCode.has(
        config.component_code
      )
    ) {
      currentConfigByCode.set(
        config.component_code,
        config
      )
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <Link
        prefetch={false}
        href={'/admin/payroll/' + id}
      >
        ← Kỳ lương
      </Link>

      <h1 className="text-3xl font-bold">
        {payroll.teacher_name}
      </h1>

      <Notice params={p} />

      <p>
        {head.starts_on.slice(0, 7)} •{' '}
        {statusLabels[head.status] || head.status} •{' '}
        {typeLabels[payroll.pay_type] || 'Theo cấu hình nhân viên'}
      </p>

      {isV2 ? (
        <>
          <Panel title="Kết quả đã tính">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-sm text-gray-500">
                  Thu nhập
                </p>
                <p className="text-lg font-semibold">
                  {money(
                    payroll.v2_earnings_amount,
                    payroll.currency
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Hoàn trả
                </p>
                <p className="text-lg font-semibold">
                  {money(
                    payroll.v2_reimbursement_amount,
                    payroll.currency
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Khấu trừ
                </p>
                <p className="text-lg font-semibold">
                  {money(
                    payroll.v2_deduction_amount,
                    payroll.currency
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Điều chỉnh theo cơ chế cũ
                </p>
                <p className="text-lg font-semibold">
                  {money(
                    payroll.adjustment_amount,
                    payroll.currency
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Phải trả — bản đang xem
                </p>
                <p className="text-xl font-bold">
                  {money(
                    payroll.v2_net_amount,
                    payroll.currency
                  )}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Cấu hình lương áp dụng cho kỳ">
            <p className="mb-3 text-sm text-gray-700">
              Đây là cấu hình được lưu dài hạn ở hồ sơ
              Staff. BHXH+BHLĐ chỉ xuất hiện
              trong Payroll khi đã được cấu hình hiệu lực cho
              kỳ.
            </p>

            <Table
              headers={[
                'Thành phần',
                'Cấu hình',
                'Kết quả kỳ này',
                'Trạng thái',
              ]}
              rows={configs.map(config => {
                const matching = componentLines.filter(line => line.component_config_id === config.id)
                const partial = config.calculation_method === 'FIXED_AMOUNT' && (config.effective_from > head.starts_on || Boolean(config.effective_to && config.effective_to < head.ends_on))
                return [<div key={config.id}>{componentLabel[config.component_code] || config.component_code}<small className="block text-gray-500">{config.effective_from} → {config.effective_to || 'Không giới hạn'}</small></div>, configValue(config, payroll.currency), matching.length ? money(matching.reduce((sum, line) => sum + Number(line.amount), 0), payroll.currency) : 'Chưa có dòng tính', partial ? 'Bị chặn: không phủ trọn kỳ' : matching.length ? 'Đã có nguồn tính — đối chiếu trong kỳ' : 'Có cấu hình mới chưa đưa vào kết quả']
              })}
            />

            {payroll.employee_id && (
              <p className="mt-3">
                <Link
                  className="underline"
                  prefetch={false}
                  href={
                    '/admin/employees/' +
                    payroll.employee_id +
                    '/compensation'
                  }
                >
                  Mở cấu hình thu nhập & khấu trừ của Staff
                </Link>
              </p>
            )}
          </Panel>

          <Panel title="Chi tiết thành phần đã tính">
            <Table
              headers={[
                'Ngày',
                'Thành phần',
                'Nhóm',
                'Số lượng',
                'Đơn giá',
                'Thành tiền',
                'Nguồn',
              ]}
              rows={componentLines.map((line) => [
                line.source_session_id ? (
                  <Link
                    key={line.id}
                    prefetch={false}
                    href={
                      '/admin/attendance/' +
                      line.source_session_id
                    }
                  >
                    {line.earned_on}
                  </Link>
                ) : (
                  line.earned_on
                ),

                componentLabel[
                  line.component_code
                ] || line.component_code,

                categoryLabel[line.category] ||
                  line.category,

                Number(line.quantity).toLocaleString(
                  'vi-VN',
                  {
                    maximumFractionDigits: 6,
                  }
                ),

                money(
                  line.unit_rate,
                  line.currency
                ),

                money(
                  line.amount,
                  line.currency
                ),

                line.source_type === 'SESSION'
                  ? 'Buổi học COMPLETED'
                  : 'Cấu hình Staff',
              ])}
            />
          </Panel>

          <Panel title="Thưởng & khoản phát sinh theo kỳ">
            <Table
              headers={[
                'Khoản',
                'Số tiền',
                'Nguồn',
                'Lý do',
                'Trạng thái',
                'Duyệt',
                'Tác vụ',
              ]}
              rows={periodActions.map(
                (action) => [
                  componentLabel[
                    action.component_code
                  ] || action.component_code,

                  money(
                    action.amount,
                    action.currency
                  ),

                  action.source_type ===
                  'EXPENSE_CLAIM'
                    ? `Expense Claim ${action.source_expense_claim_id}`
                    : 'Nhập theo kỳ',

                  action.reason,

                  action.status === 'ACTIVE'
                    ? 'Đang áp dụng'
                    : `Đã hủy${
                        action.cancel_reason
                          ? ` — ${action.cancel_reason}`
                          : ''
                      }`,

                  action.approved_at
                    ? 'Đã duyệt cùng kỳ'
                    : 'Chưa duyệt',

                  editable &&
                  action.status === 'ACTIVE' ? (
                    <form
                      key={action.id}
                      action={payrollAction}
                      className="min-w-52 space-y-2"
                    >
                      <input
                        type="hidden"
                        name="action"
                        value="v2_cancel"
                      />
                      <input
                        type="hidden"
                        name="period"
                        value={id}
                      />
                      <input
                        type="hidden"
                        name="version"
                        value={head.version}
                      />
                      <input
                        type="hidden"
                        name="period_action"
                        value={action.id}
                      />
                      <input
                        type="hidden"
                        name="employee"
                        value={
                          payroll.employee_id || ''
                        }
                      />
                      <Field
                        name="note"
                        label="Lý do hủy"
                      />
                      <SubmitButton>
                        Hủy khoản
                      </SubmitButton>
                    </form>
                  ) : (
                    '—'
                  ),
                ]
              )}
            />

            {editable && payroll.employee_id ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <form
                  action={payrollAction}
                  className="space-y-3 rounded border p-4"
                >
                  <h3 className="font-semibold">
                    Thêm thưởng
                  </h3>

                  <input
                    type="hidden"
                    name="action"
                    value="v2_bonus"
                  />
                  <input
                    type="hidden"
                    name="period"
                    value={id}
                  />
                  <input
                    type="hidden"
                    name="version"
                    value={head.version}
                  />
                  <input
                    type="hidden"
                    name="employee"
                    value={payroll.employee_id}
                  />
                  <input
                    type="hidden"
                    name="key"
                    value={crypto.randomUUID()}
                  />

                  <Field
                    name="amount"
                    label="Tiền thưởng"
                    type="number"
                  />

                  <Field
                    name="currency"
                    label="Tiền tệ"
                    value={payroll.currency}
                  />

                  <Field
                    name="note"
                    label="Lý do thưởng"
                  />

                  <SubmitButton>
                    Thêm thưởng vào kỳ
                  </SubmitButton>
                </form>

                <form
                  action={payrollAction}
                  className="space-y-3 rounded border p-4"
                >
                  <h3 className="font-semibold">
                    Công tác phí đã duyệt
                  </h3>

                  <input
                    type="hidden"
                    name="action"
                    value="v2_expense"
                  />
                  <input
                    type="hidden"
                    name="period"
                    value={id}
                  />
                  <input
                    type="hidden"
                    name="version"
                    value={head.version}
                  />
                  <input
                    type="hidden"
                    name="employee"
                    value={payroll.employee_id}
                  />
                  <input
                    type="hidden"
                    name="key"
                    value={crypto.randomUUID()}
                  />

                  <Select
                    name="claim"
                    label="Hồ sơ công tác phí đã duyệt"
                    required
                    options={eligibleClaims.map(
                      (claim) => ({
                        id: claim.id,
                        name: `${claim.title} — ${money(
                          claim.approved_amount,
                          claim.currency
                        )}`,
                      })
                    )}
                    emptyLabel={
                      eligibleClaims.length
                        ? 'Chọn claim đã duyệt'
                        : 'Không có claim phù hợp'
                    }
                  />

                  <Field
                    name="note"
                    label="Ghi chú đưa vào kỳ lương"
                  />

                  <SubmitButton>
                    Đưa công tác phí vào kỳ
                  </SubmitButton>

                  <p className="text-sm text-gray-600">
                    APPROVED chỉ có nghĩa khoản chi đã được
                    duyệt. Thao tác này đưa khoản hoàn trả
                    vào Payroll, không chứng minh đã chuyển
                    tiền.
                  </p>
                </form>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-600">
                Thưởng và công tác phí chỉ được thay đổi khi
                kỳ ở trạng thái Đã tính hoặc Đang kiểm tra.
              </p>
            )}
          </Panel>

          {legacyAdjustments.length > 0 && (
            <Panel title="Điều chỉnh theo cơ chế cũ còn tồn tại">
              <p className="mb-3 text-sm text-amber-700">
                Các dòng này thuộc workflow Payroll cũ và
                vẫn được giữ để bảo toàn lịch sử. Không dùng
                form legacy để tạo Bonus/Công tác phí mới.
              </p>

              <Table
                headers={[
                  'Loại',
                  'Số tiền',
                  'Lý do',
                  'Người tạo',
                  'Người duyệt',
                ]}
                rows={legacyAdjustments.map(
                  (adjustment) => [
                    adjustment.kind,
                    money(
                      adjustment.amount,
                      payroll.currency
                    ),
                    adjustment.reason,
                    adjustment.created_by,
                    adjustment.approved_by ||
                      'Chưa duyệt',
                  ]
                )}
              />
            </Panel>
          )}
        </>
      ) : (
        <>
          <p>
            Lương tháng:{' '}
            {money(
              payroll.base_salary,
              payroll.currency
            )}{' '}
            • Giờ dạy: {payroll.teaching_hours} • Theo buổi
            / giờ:{' '}
            {money(
              payroll.hourly_earnings,
              payroll.currency
            )}{' '}
            • Điều chỉnh:{' '}
            {money(
              payroll.adjustment_amount,
              payroll.currency
            )}
          </p>

          <p className="text-xl font-bold">
            Tổng:{' '}
            {money(
              payroll.gross_amount,
              payroll.currency
            )}
          </p>

          <Panel title="Chi tiết Payroll V1 — lịch sử">
            <Table
              headers={[
                'Ngày / buổi',
                'Loại',
                'Giờ',
                'Mức áp dụng',
                'Thành tiền',
              ]}
              rows={legacyLines.map((line) => [
                line.session_id ? <Link key={line.id} href={'/admin/attendance/' + line.session_id} prefetch={false}>{line.earned_on}</Link> : line.earned_on,
                <span key="source">{line.earning_type}{line.calculation_snapshot?.required_minutes != null && <small className="block">{String(line.calculation_snapshot.payable_minutes)}/{String(line.calculation_snapshot.required_minutes)} phút</small>}</span>,
                line.duration_hours,
                money(
                  line.rate,
                  payroll.currency
                ),
                money(
                  line.amount,
                  payroll.currency
                ),
              ])}
            />
          </Panel>
          <Panel title="Các khoản điều chỉnh — cơ chế cũ">
            <Table headers={['Loại','Số tiền','Lý do','Người tạo','Người duyệt']} rows={legacyAdjustments.map(a => [a.kind,money(a.amount,payroll.currency),a.reason,a.created_by,a.approved_by || 'Chưa duyệt'])}/>
            {editable ? <form action={payrollAction} className="space-y-3"><input type="hidden" name="action" value={payroll.employee_id ? 'evidence_adjust' : 'adjust'}/><input type="hidden" name="period" value={id}/><input type="hidden" name="payroll" value={payroll.id}/><input type="hidden" name="key" value={crypto.randomUUID()}/><Select name="kind" label="Loại điều chỉnh" options={[{id:'BONUS',name:'Thưởng'},{id:'DEDUCTION',name:'Khấu trừ'},{id:'CORRECTION',name:'Sửa sai'}]} required/><Field name="amount" label="Số tiền (âm nếu khấu trừ)"/><Field name="note" label="Lý do điều chỉnh"/>{payroll.employee_id && <Select name="attendance" label="Sự kiện đi muộn / về sớm" emptyLabel="Không áp dụng" options={legacyLines.flatMap(l => ((l.calculation_snapshot?.sources || []) as {attendance?:{id:string;work_date:string;shift_code:string;status:string}}[]).flatMap(s => s.attendance && ['LATE','EARLY_LEAVE'].includes(s.attendance.status) ? [{id:s.attendance.id,name:s.attendance.work_date+' '+s.attendance.shift_code+' '+s.attendance.status}] : []))}/>}<SubmitButton>Thêm điều chỉnh</SubmitButton></form> : <p>Điều chỉnh đang khóa. Khoản thu nhập gốc không được sửa.</p>}
          </Panel>
        </>
      )}

      {['APPROVED', 'FINALIZED'].includes(
        head.status
      ) && (
        <Link
          prefetch={false}
          href={
            '/documents/payslips/' + payroll.id
          }
        >
          Xem / In phiếu lương
        </Link>
      )}

      {head.status === 'FINALIZED' && (
        <Link
          prefetch={false}
          href={'/finance?payroll=' + payroll.id}
        >
          Yêu cầu sửa sai lương đã chốt
        </Link>
      )}
    </div>
  )
}
