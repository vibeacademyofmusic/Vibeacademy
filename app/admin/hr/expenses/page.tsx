import Link from 'next/link'
import { randomUUID } from 'node:crypto'

import {
  adminClient,
  uuidPattern,
  type Params,
} from '../../finance/operations'

import { AppPage } from '../../_components/vibe'
import SubmitButton from '../../finance/_components/SubmitButton'
import { payrollAction } from '../../payroll/actions'

import { expenseAction } from './actions'
import SelfServiceView from './SelfServiceView'
import styles from './operations.module.css'

const states: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  RETURNED: 'Trả về bổ sung',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
}

const periodStates: Record<string, string> = {
  DRAFT: 'Bản nháp',
  GENERATED: 'Đã tính',
  REVIEW: 'Đang kiểm tra',
  APPROVED: 'Đã duyệt',
  FINALIZED: 'Đã chốt',
}

type Search = {
  month?: string
  branch?: string
  status?: string
  q?: string
  work?: string
  claim?: string
  view?: string
  error?: string
  success?: string
}

type Claim = {
  id: string
  employee_id: string
  branch_id: string
  title: string
  requested_month: string
  currency: string
  status: string
  version: number
  created_by: string
  approved_amount: string | number | null
  created_at: string
  reviewed_at: string | null
  review_reason: string | null
}

type Person = {
  id: string
  full_name: string | null
  employee_code: string | null
}

type Branch = {
  id: string
  name: string
}

type ClaimLine = {
  claim_id: string
  total_amount: string | number
  evidence_reference: string | null
}

type Posting = {
  source_expense_claim_id: string | null
  period_id: string
  amount: string | number
  currency: string
  status: string
  created_at: string
}

type Period = {
  id: string
  branch_id: string
  starts_on: string
  status: string
  version: number
}

type ViewRow = {
  claim: Claim
  person?: Person
  branch?: Branch
  requested: number | null
  approved: number | null
  evidenceCount: number | null
  lineCount: number | null
  posting?: Posting
  postingPeriod?: Period
  openPeriod?: Period
  age: number
  issues: string[]
}

function amount(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const result = Number(value)

  return Number.isFinite(result)
    ? result
    : null
}

function money(
  value: number | null,
  currency = 'VND'
): string {
  if (value === null) return '—'

  return `${value.toLocaleString('vi-VN', {
    maximumFractionDigits: 2,
  })} ${currency}`
}

function ageDays(createdAt: string): number {
  const then = Date.parse(createdAt)

  if (!Number.isFinite(then)) return 0

  return Math.max(
    0,
    Math.floor(
      (Date.now() - then) / 86_400_000
    )
  )
}

function monthText(value: string): string {
  return /^\d{4}-\d{2}/.test(value)
    ? value.slice(0, 7)
    : value
}

function aggregate(
  rows: ViewRow[],
  getter: (row: ViewRow) => number | null
): string {
  const totals = new Map<string, number>()

  for (const row of rows) {
    const value = getter(row)

    if (value === null) continue

    totals.set(
      row.claim.currency,
      (totals.get(row.claim.currency) || 0) +
        value
    )
  }

  if (!totals.size) return '0'

  return [...totals.entries()]
    .map(([currency, value]) =>
      money(value, currency)
    )
    .join(' · ')
}

const linkKeys = [
  'month',
  'branch',
  'status',
  'q',
  'work',
  'claim',
] as const

function href(
  params: Search,
  patch: Partial<
    Record<(typeof linkKeys)[number], string | null>
  >
): string {
  const query = new URLSearchParams()

  for (const key of linkKeys) {
    const value = params[key]

    if (value) query.set(key, value)
  }

  for (const [key, value] of Object.entries(
    patch
  )) {
    if (!value) query.delete(key)
    else query.set(key, value)
  }

  const text = query.toString()

  return text
    ? `/admin/hr/expenses?${text}`
    : '/admin/hr/expenses'
}

function workflowLabel(row: ViewRow): string {
  const { claim, posting, postingPeriod, openPeriod } =
    row

  if (posting) {
    if (postingPeriod) {
      return `Đã vào Payroll · ${
        periodStates[postingPeriod.status] ||
        postingPeriod.status
      }`
    }

    return 'Đã vào Payroll'
  }

  if (claim.status === 'APPROVED') {
    return openPeriod
      ? 'Sẵn sàng đưa vào Payroll'
      : 'Đã duyệt · chờ kỳ phù hợp'
  }

  return states[claim.status] || claim.status
}

function badgeClass(row: ViewRow): string {
  if (row.posting) {
    return `${styles.badge} ${styles.badgePosted}`
  }

  if (row.claim.status === 'SUBMITTED') {
    return `${styles.badge} ${styles.badgePending}`
  }

  if (row.claim.status === 'APPROVED') {
    return `${styles.badge} ${styles.badgeApproved}`
  }

  if (row.claim.status === 'RETURNED') {
    return `${styles.badge} ${styles.badgeReturned}`
  }

  return `${styles.badge} ${styles.badgeNeutral}`
}

function Kpi({
  label,
  value,
  note,
  hrefValue,
}: {
  label: string
  value: string
  note: string
  hrefValue: string
}) {
  return (
    <Link
      prefetch={false}
      href={hrefValue}
      className={styles.metric}
    >
      <span className={styles.metricLabel}>
        {label}
      </span>

      <strong className={styles.metricValue}>
        {value}
      </strong>

      <span className={styles.metricNote}>
        {note}
      </span>
    </Link>
  )
}

export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const p = await searchParams
  const db = await adminClient()

  // ----------------------------------------------------
  // Persona
  // ----------------------------------------------------

  const [
    superRole,
    financeRole,
    branchRole,
  ] = await Promise.all([
    db.rpc('has_role', {
      role_code: 'SUPER_ADMIN',
    }),
    db.rpc('has_role', {
      role_code: 'FINANCE',
    }),
    db.rpc('has_role', {
      role_code: 'BRANCH_ADMIN',
    }),
  ])

  const operator =
    Boolean(superRole.data) ||
    Boolean(financeRole.data) ||
    Boolean(branchRole.data)

  // Non-operator users continue to use the exact
  // self-service UI that existed before this redesign.
  if (!operator || p.view === 'self') {
    return (
      <SelfServiceView
        searchParams={Promise.resolve(
          p as Params
        )}
      />
    )
  }

  // ----------------------------------------------------
  // Auth identity: used only to decide whether to show
  // "Bảng kê của tôi". Lack of employee identity is NOT
  // an error for an operator.
  // ----------------------------------------------------

  const auth = await db.auth.getClaims()
  const userId =
    typeof auth.data?.claims?.sub === 'string'
      ? auth.data.claims.sub
      : ''

  let hasEmployeeIdentity = false

  if (userId) {
    const identity = await db
      .from('employee_directory')
      .select('id')
      .eq('profile_id', userId)
      .limit(1)

    hasEmployeeIdentity =
      !identity.error &&
      Boolean(identity.data?.length)
  }

  // ----------------------------------------------------
  // Main claim scope
  // ----------------------------------------------------

  let claimQuery = db
    .from('employee_expense_claims')
    .select(
      'id,employee_id,branch_id,title,requested_month,currency,status,version,created_by,approved_amount,created_at,reviewed_at,review_reason'
    )
    .order('created_at', {
      ascending: false,
    })
    .limit(200)

  if (
    p.status &&
    Object.prototype.hasOwnProperty.call(
      states,
      p.status
    )
  ) {
    claimQuery = claimQuery.eq(
      'status',
      p.status
    )
  }

  if (
    p.month &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(
      p.month
    )
  ) {
    claimQuery = claimQuery.eq(
      'requested_month',
      `${p.month}-01`
    )
  }

  if (
    p.branch &&
    uuidPattern.test(p.branch)
  ) {
    claimQuery = claimQuery.eq(
      'branch_id',
      p.branch
    )
  }

  const claimResult = await claimQuery

  if (claimResult.error) {
    return (
      <AppPage>
        <div className={styles.root}>
          <header className={styles.topbar}>
            <div>
              <p className={styles.eyebrow}>
                HR · Expense Operations
              </p>
              <h1 className={styles.title}>
                Công tác phí
              </h1>
            </div>
          </header>

          <div className={styles.errorNotice}>
            Không tải được phạm vi công tác phí được
            phép xem. Hệ thống không suy đoán số
            liệu.
          </div>
        </div>
      </AppPage>
    )
  }

  const claims =
    (claimResult.data || []) as Claim[]

  const claimIds = claims.map(
    row => row.id
  )

  const employeeIds = [
    ...new Set(
      claims.map(row => row.employee_id)
    ),
  ]

  const branchIds = [
    ...new Set(
      claims.map(row => row.branch_id)
    ),
  ]

  // ----------------------------------------------------
  // Related read models.
  // Every source has its own availability flag so a
  // read failure never becomes a false zero.
  // ----------------------------------------------------

  let people: Person[] = []
  let peopleAvailable = true

  if (employeeIds.length) {
    const result = await db
      .from('employee_directory')
      .select(
        'id,full_name,employee_code'
      )
      .in('id', employeeIds)

    peopleAvailable = !result.error

    if (!result.error) {
      people = (result.data || []) as Person[]
    }
  }

  const branchResult = await db
    .from('branches')
    .select('id,name')
    .eq('status', 'ACTIVE')
    .order('name')

  const branches =
    !branchResult.error
      ? ((branchResult.data || []) as Branch[])
      : []

  let lines: ClaimLine[] = []
  let linesAvailable = true

  if (claimIds.length) {
    const result = await db
      .from('employee_expense_claim_lines')
      .select(
        'claim_id,total_amount,evidence_reference'
      )
      .in('claim_id', claimIds)
      .eq('reservation_active', true)

    linesAvailable = !result.error

    if (!result.error) {
      lines =
        (result.data || []) as ClaimLine[]
    }
  }

  let postings: Posting[] = []
  let postingsAvailable = true

  if (claimIds.length) {
    const result = await db
      .from('payroll_period_actions_v2')
      .select(
        'source_expense_claim_id,period_id,amount,currency,status,created_at'
      )
      .in(
        'source_expense_claim_id',
        claimIds
      )
      .eq('status', 'ACTIVE')
      .order('created_at', {
        ascending: false,
      })

    postingsAvailable = !result.error

    if (!result.error) {
      postings =
        (result.data || []) as Posting[]
    }
  }

  let periods: Period[] = []
  let periodsAvailable = true

  if (branchIds.length) {
    const result = await db
      .from('payroll_periods')
      .select(
        'id,branch_id,starts_on,status,version'
      )
      .in('branch_id', branchIds)
      .order('starts_on', {
        ascending: false,
      })
      .limit(500)

    periodsAvailable = !result.error

    if (!result.error) {
      periods =
        (result.data || []) as Period[]
    }
  }

  // ----------------------------------------------------
  // Maps
  // ----------------------------------------------------

  const peopleById = new Map(
    people.map(row => [row.id, row])
  )

  const branchesById = new Map(
    branches.map(row => [row.id, row])
  )

  const linesByClaim = new Map<
    string,
    ClaimLine[]
  >()

  for (const line of lines) {
    const current =
      linesByClaim.get(line.claim_id) || []

    current.push(line)
    linesByClaim.set(
      line.claim_id,
      current
    )
  }

  const postingByClaim = new Map<
    string,
    Posting
  >()

  for (const posting of postings) {
    if (
      posting.source_expense_claim_id &&
      !postingByClaim.has(
        posting.source_expense_claim_id
      )
    ) {
      postingByClaim.set(
        posting.source_expense_claim_id,
        posting
      )
    }
  }

  const periodById = new Map(
    periods.map(row => [row.id, row])
  )

  const openPeriodByScope = new Map<
    string,
    Period
  >()

  for (const period of periods) {
    if (
      !['GENERATED', 'REVIEW'].includes(
        period.status
      )
    ) {
      continue
    }

    const key =
      `${period.branch_id}|${period.starts_on}`

    if (!openPeriodByScope.has(key)) {
      openPeriodByScope.set(key, period)
    }
  }

  // ----------------------------------------------------
  // View rows
  // ----------------------------------------------------

  let rows: ViewRow[] = claims.map(
    claim => {
      const claimLines =
        linesByClaim.get(claim.id) || []

      const requested = linesAvailable
        ? claimLines.reduce(
            (sum, line) =>
              sum +
              (amount(line.total_amount) || 0),
            0
          )
        : null

      const evidenceCount = linesAvailable
        ? claimLines.filter(line =>
            Boolean(
              line.evidence_reference?.trim()
            )
          ).length
        : null

      const lineCount = linesAvailable
        ? claimLines.length
        : null

      const posting = postingsAvailable
        ? postingByClaim.get(claim.id)
        : undefined

      const postingPeriod =
        posting && periodsAvailable
          ? periodById.get(posting.period_id)
          : undefined

      const openPeriod = periodsAvailable
        ? openPeriodByScope.get(
            `${claim.branch_id}|${claim.requested_month}`
          )
        : undefined

      const issues: string[] = []

      if (
        claim.status === 'RETURNED'
      ) {
        issues.push(
          'Đang chờ nhân viên bổ sung hồ sơ.'
        )
      }

      if (
        linesAvailable &&
        lineCount !== null &&
        lineCount > 0 &&
        evidenceCount !== null &&
        evidenceCount < lineCount
      ) {
        issues.push(
          `Thiếu tham chiếu chứng từ ở ${
            lineCount - evidenceCount
          } dòng.`
        )
      }

      if (
        claim.status === 'APPROVED' &&
        postingsAvailable &&
        !posting &&
        periodsAvailable &&
        !openPeriod
      ) {
        issues.push(
          'Đã duyệt nhưng chưa có kỳ Payroll ở trạng thái Đã tính / Đang kiểm tra phù hợp.'
        )
      }

      return {
        claim,
        person: peopleById.get(
          claim.employee_id
        ),
        branch: branchesById.get(
          claim.branch_id
        ),
        requested,
        approved: amount(
          claim.approved_amount
        ),
        evidenceCount,
        lineCount,
        posting,
        postingPeriod,
        openPeriod,
        age: ageDays(claim.created_at),
        issues,
      }
    }
  )

  // ----------------------------------------------------
  // Search
  // ----------------------------------------------------

  const search =
    (p.q || '').trim().toLocaleLowerCase(
      'vi'
    )

  if (search) {
    rows = rows.filter(row => {
      const haystack = [
        row.claim.title,
        row.person?.full_name,
        row.person?.employee_code,
        row.branch?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi')

      return haystack.includes(search)
    })
  }

  // Metrics use current month / branch / status / search
  // scope, but are calculated BEFORE the quick work filter.
  const metricRows = rows

  const pendingRows =
    metricRows.filter(
      row =>
        row.claim.status === 'SUBMITTED'
    )

  const waitingPayrollRows =
    postingsAvailable
      ? metricRows.filter(
          row =>
            row.claim.status === 'APPROVED' &&
            !row.posting
        )
      : []

  const postedRows =
    postingsAvailable
      ? metricRows.filter(row =>
          Boolean(row.posting)
        )
      : []

  const attentionRows =
    metricRows.filter(
      row => row.issues.length > 0
    )

  // ----------------------------------------------------
  // Quick workflow filter
  // ----------------------------------------------------

  if (p.work === 'pending') {
    rows = rows.filter(
      row =>
        row.claim.status === 'SUBMITTED'
    )
  } else if (p.work === 'payroll') {
    rows = postingsAvailable
      ? rows.filter(
          row =>
            row.claim.status === 'APPROVED' &&
            !row.posting
        )
      : []
  } else if (p.work === 'posted') {
    rows = postingsAvailable
      ? rows.filter(row =>
          Boolean(row.posting)
        )
      : []
  } else if (p.work === 'attention') {
    rows = rows.filter(
      row => row.issues.length > 0
    )
  }

  const selected =
    p.claim &&
    uuidPattern.test(p.claim)
      ? rows.find(
          row => row.claim.id === p.claim
        ) ||
        metricRows.find(
          row => row.claim.id === p.claim
        )
      : undefined

  // ----------------------------------------------------
  // Financial management summaries
  // ----------------------------------------------------

  const approvedWithRequest =
    metricRows.filter(
      row =>
        row.requested !== null &&
        row.approved !== null
    )

  const reductionRows =
    approvedWithRequest.map(row => ({
      ...row,
      reduction: Math.max(
        0,
        (row.requested || 0) -
          (row.approved || 0)
      ),
    }))

  const totalReduction =
    reductionRows.reduce(
      (sum, row) =>
        sum + row.reduction,
      0
    )

  const commonCurrency =
    new Set(
      reductionRows.map(
        row => row.claim.currency
      )
    ).size === 1
      ? reductionRows[0]?.claim.currency
      : undefined

  const dataWarnings = [
    !peopleAvailable
      ? 'Không đọc đủ tên nhân viên.'
      : '',
    !linesAvailable
      ? 'Không đọc đủ chi tiết tiền/chứng từ; không hiển thị 0 thay cho dữ liệu thiếu.'
      : '',
    !postingsAvailable
      ? 'Không đọc được trạng thái đưa vào Payroll.'
      : '',
    !periodsAvailable
      ? 'Không đọc được trạng thái kỳ lương.'
      : '',
  ].filter(Boolean)

  return (
    <AppPage>
      <div className={styles.root}>
        {/* ==================================================
            HEADER
        ================================================== */}

        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>
              HR · EXPENSE OPERATIONS
            </p>

            <h1 className={styles.title}>
              Công tác phí
            </h1>

            <p className={styles.sub}>
              Kiểm soát hồ sơ từ đề nghị, phê
              duyệt, đưa vào Payroll đến đối
              soát nghĩa vụ hoàn trả.
            </p>
          </div>

          <div className={styles.mode}>
            <Link
              href="/admin/hr/expenses"
              className={`${styles.button} ${styles.buttonPrimary}`}
              prefetch={false}
            >
              Điều hành
            </Link>

            {hasEmployeeIdentity && (
              <Link
                href="/admin/hr/expenses?view=self"
                className={styles.button}
                prefetch={false}
              >
                Bảng kê của tôi
              </Link>
            )}

            <Link
              href="/admin/payroll"
              className={styles.button}
              prefetch={false}
            >
              Kỳ lương
            </Link>

            <Link
              href="/admin/hr/payslips"
              className={styles.button}
              prefetch={false}
            >
              Phiếu lương & chi trả
            </Link>
          </div>
        </header>

        {p.success && (
          <div className={styles.notice}>
            {p.success}
          </div>
        )}

        {p.error && (
          <div className={styles.errorNotice}>
            {p.error}
          </div>
        )}

        {dataWarnings.length > 0 && (
          <div className={styles.errorNotice}>
            <strong>
              Một phần dữ liệu đối soát chưa
              khả dụng.
            </strong>

            <ul>
              {dataWarnings.map(text => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ==================================================
            KPI
        ================================================== */}

        <section
          className={styles.metrics}
          aria-label="Chỉ số điều hành công tác phí"
        >
          <Kpi
            label="Chờ duyệt"
            value={String(pendingRows.length)}
            note={
              linesAvailable
                ? aggregate(
                    pendingRows,
                    row => row.requested
                  )
                : 'Chưa đọc đủ số tiền'
            }
            hrefValue={href(p, {
              work: 'pending',
              claim: null,
            })}
          />

          <Kpi
            label="Đã duyệt · Chờ Payroll"
            value={
              postingsAvailable
                ? String(
                    waitingPayrollRows.length
                  )
                : '—'
            }
            note={
              postingsAvailable
                ? aggregate(
                    waitingPayrollRows,
                    row => row.approved
                  )
                : 'Chưa xác minh trạng thái Payroll'
            }
            hrefValue={href(p, {
              work: 'payroll',
              claim: null,
            })}
          />

          <Kpi
            label="Đã vào Payroll"
            value={
              postingsAvailable
                ? String(postedRows.length)
                : '—'
            }
            note={
              postingsAvailable
                ? aggregate(
                    postedRows,
                    row =>
                      amount(
                        row.posting?.amount
                      )
                  )
                : 'Chưa xác minh trạng thái Payroll'
            }
            hrefValue={href(p, {
              work: 'posted',
              claim: null,
            })}
          />

          <Kpi
            label="Cần xử lý"
            value={String(
              attentionRows.length
            )}
            note="Trả về · thiếu chứng từ · mắc luồng Payroll"
            hrefValue={href(p, {
              work: 'attention',
              claim: null,
            })}
          />
        </section>

        {/* ==================================================
            WORK QUEUE
        ================================================== */}

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>
                WORK QUEUE
              </p>

              <h2>
                Việc cần làm
              </h2>

              <p>
                Tập trung vào công việc cần quyết
                định thay vì tự rà toàn bộ bảng.
              </p>
            </div>
          </div>

          <div className={styles.actionGrid}>
            <Link
              href={href(p, {
                work: 'pending',
                claim: null,
              })}
              className={styles.actionCard}
            >
              <div className={styles.actionTop}>
                <strong>
                  Hồ sơ chờ duyệt
                </strong>

                <span
                  className={styles.actionCount}
                >
                  {pendingRows.length}
                </span>
              </div>

              <p className={styles.actionDesc}>
                Cần quyết định phê duyệt, trả về
                hoặc từ chối.
              </p>
            </Link>

            <Link
              href={href(p, {
                work: 'payroll',
                claim: null,
              })}
              className={styles.actionCard}
            >
              <div className={styles.actionTop}>
                <strong>
                  Đã duyệt chưa vào Payroll
                </strong>

                <span
                  className={styles.actionCount}
                >
                  {postingsAvailable
                    ? waitingPayrollRows.length
                    : '—'}
                </span>
              </div>

              <p className={styles.actionDesc}>
                Nghĩa vụ đã chấp thuận nhưng chưa
                được ghi vào kỳ lương.
              </p>
            </Link>

            <Link
              href={href(p, {
                work: 'attention',
                claim: null,
              })}
              className={styles.actionCard}
            >
              <div className={styles.actionTop}>
                <strong>
                  Hồ sơ có cảnh báo
                </strong>

                <span
                  className={styles.actionCount}
                >
                  {attentionRows.length}
                </span>
              </div>

              <p className={styles.actionDesc}>
                Thiếu chứng từ, trả về hoặc chưa
                có kỳ Payroll phù hợp.
              </p>
            </Link>

            <Link
              href="/admin/payroll"
              className={styles.actionCard}
            >
              <div className={styles.actionTop}>
                <strong>
                  Kiểm tra kỳ lương
                </strong>

                <span
                  className={styles.actionCount}
                >
                  →
                </span>
              </div>

              <p className={styles.actionDesc}>
                Đối chiếu khoản hoàn trả đã đưa
                vào Payroll.
              </p>
            </Link>
          </div>
        </section>

        {/* ==================================================
            FILTER
        ================================================== */}

        <form
          method="get"
          className={styles.filters}
        >
          <label className={styles.field}>
            <span>Tháng</span>

            <input
              type="month"
              name="month"
              defaultValue={p.month || ''}
            />
          </label>

          <label className={styles.field}>
            <span>Chi nhánh</span>

            <select
              name="branch"
              defaultValue={p.branch || ''}
            >
              <option value="">
                Tất cả chi nhánh
              </option>

              {branches.map(branch => (
                <option
                  key={branch.id}
                  value={branch.id}
                >
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Trạng thái hồ sơ</span>

            <select
              name="status"
              defaultValue={p.status || ''}
            >
              <option value="">
                Tất cả trạng thái
              </option>

              {Object.entries(states).map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                )
              )}
            </select>
          </label>

          <label
            className={`${styles.field} ${styles.search}`}
          >
            <span>
              Tìm nhân viên / mục đích
            </span>

            <input
              type="search"
              name="q"
              defaultValue={p.q || ''}
              maxLength={100}
              placeholder="Tên, mã nhân viên, mục đích..."
            />
          </label>

          <div className={styles.filterActions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              Áp dụng
            </button>

            <Link
              href="/admin/hr/expenses"
              className={styles.button}
            >
              Bỏ lọc
            </Link>
          </div>
        </form>

        {/* ==================================================
            MAIN LAYOUT
        ================================================== */}

        <div className={styles.layout}>
          <main className={styles.main}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>
                    EXPENSE LEDGER
                  </p>

                  <h2>
                    Sổ Công tác phí
                  </h2>

                  <p>
                    {rows.length} hồ sơ trong bộ
                    lọc hiện tại · tối đa 200 hồ
                    sơ gần nhất trong phạm vi
                    quyền được xem.
                  </p>
                </div>

                {p.work && (
                  <Link
                    href={href(p, {
                      work: null,
                      claim: null,
                    })}
                    className={styles.button}
                  >
                    Bỏ lọc nhanh
                  </Link>
                )}
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Chuyến / mục đích</th>
                      <th>Tháng</th>
                      <th>Đề nghị</th>
                      <th>Đã duyệt</th>
                      <th>Chứng từ</th>
                      <th>Workflow</th>
                      <th>Tuổi hồ sơ</th>
                      <th>Tác vụ</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.length ? (
                      rows.map(row => {
                        const evidence =
                          row.lineCount === null
                            ? '—'
                            : row.lineCount === 0
                              ? 'Chưa có dòng'
                              : `${row.evidenceCount}/${row.lineCount}`

                        return (
                          <tr key={row.claim.id}>
                            <td>
                              <strong>
                                {row.person
                                  ?.full_name ||
                                  'Chưa đọc được tên'}
                              </strong>

                              <span
                                className={
                                  styles.muted
                                }
                              >
                                {row.person
                                  ?.employee_code ||
                                  row.claim.employee_id}
                              </span>

                              <span
                                className={
                                  styles.muted
                                }
                              >
                                {row.branch?.name ||
                                  'Chưa đọc được chi nhánh'}
                              </span>
                            </td>

                            <td>
                              <Link
                                href={href(p, {
                                  claim:
                                    row.claim.id,
                                })}
                                className={
                                  styles.rowAction
                                }
                                prefetch={false}
                              >
                                {row.claim.title}
                              </Link>
                            </td>

                            <td>
                              {monthText(
                                row.claim
                                  .requested_month
                              )}
                            </td>

                            <td
                              className={
                                styles.money
                              }
                            >
                              {money(
                                row.requested,
                                row.claim.currency
                              )}
                            </td>

                            <td
                              className={
                                styles.money
                              }
                            >
                              {money(
                                row.approved,
                                row.claim.currency
                              )}
                            </td>

                            <td>
                              {evidence}
                            </td>

                            <td>
                              <span
                                className={badgeClass(
                                  row
                                )}
                              >
                                {workflowLabel(
                                  row
                                )}
                              </span>

                              {row.issues.length >
                                0 && (
                                <span
                                  className={
                                    styles.issue
                                  }
                                >
                                  {
                                    row.issues
                                      .length
                                  }{' '}
                                  cảnh báo
                                </span>
                              )}
                            </td>

                            <td>
                              {row.age === 0
                                ? 'Hôm nay'
                                : `${row.age} ngày`}
                            </td>

                            <td>
                              <Link
                                href={href(p, {
                                  claim:
                                    row.claim.id,
                                })}
                                className={
                                  styles.rowAction
                                }
                                prefetch={false}
                              >
                                Xử lý →
                              </Link>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={9}
                          className={
                            styles.empty
                          }
                        >
                          Không có hồ sơ phù hợp
                          bộ lọc hiện tại.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          {/* ================================================
              MANAGEMENT SIDEBAR
          ================================================= */}

          <aside className={styles.sidebar}>
            {selected ? (
              <section
                className={styles.detailCard}
              >
                <div
                  className={styles.detailHead}
                >
                  <div>
                    <p className={styles.eyebrow}>
                      CLAIM DETAIL
                    </p>

                    <h2>
                      {selected.claim.title}
                    </h2>
                  </div>

                  <Link
                    href={href(p, {
                      claim: null,
                    })}
                    className={styles.button}
                  >
                    Đóng
                  </Link>
                </div>

                <div
                  className={styles.detailGrid}
                >
                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Nhân viên
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {selected.person
                        ?.full_name ||
                        '—'}
                    </strong>

                    <small>
                      {selected.person
                        ?.employee_code ||
                        ''}
                    </small>
                  </div>

                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Đề nghị
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {money(
                        selected.requested,
                        selected.claim.currency
                      )}
                    </strong>
                  </div>

                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Đã duyệt
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {money(
                        selected.approved,
                        selected.claim.currency
                      )}
                    </strong>
                  </div>

                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Workflow
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {workflowLabel(
                        selected
                      )}
                    </strong>
                  </div>
                </div>

                {selected.issues.length > 0 && (
                  <div
                    className={
                      styles.issueList
                    }
                  >
                    <strong>
                      Cần chú ý
                    </strong>

                    {selected.issues.map(
                      issue => (
                        <p key={issue}>
                          • {issue}
                        </p>
                      )
                    )}
                  </div>
                )}

                {/* ------------------------------------------
                    REVIEW
                ------------------------------------------ */}

                {selected.claim.status ===
                  'SUBMITTED' &&
                  selected.claim.created_by !==
                    userId && (
                    <form
                      action={expenseAction}
                      className={
                        styles.actionForm
                      }
                    >
                      <h3>
                        Kiểm tra & phê duyệt
                      </h3>

                      <input
                        type="hidden"
                        name="action"
                        value="review"
                      />

                      <input
                        type="hidden"
                        name="claim"
                        value={
                          selected.claim.id
                        }
                      />

                      <input
                        type="hidden"
                        name="version"
                        value={
                          selected.claim.version
                        }
                      />

                      <input
                        type="hidden"
                        name="key"
                        value={randomUUID()}
                      />

                      <label
                        className={
                          styles.field
                        }
                      >
                        <span>Quyết định</span>

                        <select
                          name="decision"
                          required
                          defaultValue=""
                        >
                          <option
                            value=""
                            disabled
                          >
                            Chọn quyết định
                          </option>

                          <option value="APPROVED">
                            Phê duyệt
                          </option>

                          <option value="RETURNED">
                            Trả về bổ sung
                          </option>

                          <option value="REJECTED">
                            Từ chối
                          </option>
                        </select>
                      </label>

                      <label
                        className={
                          styles.field
                        }
                      >
                        <span>
                          Lý do / ghi chú
                        </span>

                        <textarea
                          name="reason"
                          rows={3}
                          maxLength={2000}
                          required
                        />
                      </label>

                      <SubmitButton>
                        Lưu quyết định
                      </SubmitButton>
                    </form>
                  )}

                {selected.claim.status ===
                  'SUBMITTED' &&
                  selected.claim.created_by ===
                    userId && (
                    <div
                      className={styles.notice}
                    >
                      Người lập hồ sơ không tự
                      phê duyệt hồ sơ của mình.
                    </div>
                  )}

                {/* ------------------------------------------
                    POST TO PAYROLL
                ------------------------------------------ */}

                {selected.claim.status ===
                  'APPROVED' &&
                  postingsAvailable &&
                  !selected.posting &&
                  periodsAvailable &&
                  selected.openPeriod && (
                    <form
                      action={payrollAction}
                      className={
                        styles.actionForm
                      }
                    >
                      <h3>
                        Đưa vào Payroll
                      </h3>

                      <p className={styles.muted}>
                        Kỳ{' '}
                        {monthText(
                          selected.openPeriod
                            .starts_on
                        )}{' '}
                        ·{' '}
                        {periodStates[
                          selected.openPeriod
                            .status
                        ] ||
                          selected.openPeriod
                            .status}
                      </p>

                      <input
                        type="hidden"
                        name="action"
                        value="v2_expense"
                      />

                      <input
                        type="hidden"
                        name="period"
                        value={
                          selected.openPeriod.id
                        }
                      />

                      <input
                        type="hidden"
                        name="version"
                        value={
                          selected.openPeriod
                            .version
                        }
                      />

                      <input
                        type="hidden"
                        name="employee"
                        value={
                          selected.claim
                            .employee_id
                        }
                      />

                      <input
                        type="hidden"
                        name="claim"
                        value={
                          selected.claim.id
                        }
                      />

                      <input
                        type="hidden"
                        name="key"
                        value={randomUUID()}
                      />

                      <label
                        className={
                          styles.field
                        }
                      >
                        <span>
                          Căn cứ ghi nhận hoàn trả
                        </span>

                        <textarea
                          name="note"
                          rows={3}
                          maxLength={2000}
                          required
                          defaultValue={`Công tác phí đã duyệt · ${selected.claim.title}`}
                        />
                      </label>

                      <SubmitButton>
                        Đưa công tác phí vào kỳ
                      </SubmitButton>

                      <p className={styles.muted}>
                        Thao tác này ghi khoản
                        hoàn trả vào Payroll,
                        không xác nhận đã chuyển
                        tiền.
                      </p>
                    </form>
                  )}

                {selected.claim.status ===
                  'APPROVED' &&
                  postingsAvailable &&
                  !selected.posting &&
                  periodsAvailable &&
                  !selected.openPeriod && (
                    <div
                      className={
                        styles.actionForm
                      }
                    >
                      <h3>
                        Chưa có kỳ Payroll phù hợp
                      </h3>

                      <p>
                        Kỳ phải cùng chi nhánh,
                        đúng tháng đề nghị và đang
                        ở trạng thái Đã tính hoặc
                        Đang kiểm tra.
                      </p>

                      <Link
                        href={`/admin/payroll?month=${monthText(
                          selected.claim
                            .requested_month
                        )}&branch=${
                          selected.claim.branch_id
                        }`}
                        className={`${styles.button} ${styles.buttonPrimary}`}
                        prefetch={false}
                      >
                        Mở kỳ lương →
                      </Link>
                    </div>
                  )}

                {selected.posting && (
                  <div
                    className={
                      styles.actionForm
                    }
                  >
                    <h3>
                      Đã đưa vào Payroll
                    </h3>

                    <p>
                      {money(
                        amount(
                          selected.posting.amount
                        ),
                        selected.posting
                          .currency
                      )}
                    </p>

                    <Link
                      href={`/admin/payroll/${selected.posting.period_id}`}
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      prefetch={false}
                    >
                      Mở kỳ lương →
                    </Link>

                    <p className={styles.muted}>
                      Trạng thái này không chứng
                      minh khoản tiền đã được
                      thanh toán riêng lẻ.
                    </p>
                  </div>
                )}

                {[
                  'DRAFT',
                  'RETURNED',
                ].includes(
                  selected.claim.status
                ) && (
                  <div
                    className={
                      styles.actionForm
                    }
                  >
                    <h3>
                      Chờ người lập hoàn thiện
                    </h3>

                    <p>
                      Nhà điều hành theo dõi trạng
                      thái; dữ liệu nháp thuộc
                      luồng self-service của người
                      lập.
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section
                className={styles.sideCard}
              >
                <p className={styles.eyebrow}>
                  MANAGEMENT SUMMARY
                </p>

                <h2
                  className={styles.sideTitle}
                >
                  Tổng quan phạm vi đang xem
                </h2>

                <div
                  className={styles.detailGrid}
                >
                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Hồ sơ
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {metricRows.length}
                    </strong>
                  </div>

                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Tổng đề nghị
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {linesAvailable
                        ? aggregate(
                            metricRows,
                            row =>
                              row.requested
                          )
                        : '—'}
                    </strong>
                  </div>

                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Tổng đã duyệt
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {aggregate(
                        metricRows.filter(
                          row =>
                            row.approved !==
                            null
                        ),
                        row => row.approved
                      )}
                    </strong>
                  </div>

                  <div className={styles.stat}>
                    <span
                      className={
                        styles.statLabel
                      }
                    >
                      Điều chỉnh giảm
                    </span>

                    <strong
                      className={
                        styles.statValue
                      }
                    >
                      {commonCurrency
                        ? money(
                            totalReduction,
                            commonCurrency
                          )
                        : reductionRows.length
                          ? 'Nhiều tiền tệ'
                          : '0'}
                    </strong>
                  </div>
                </div>

                <div
                  className={styles.issueList}
                >
                  <strong>
                    Ý nghĩa trạng thái
                  </strong>

                  <p>
                    • Đã duyệt ≠ đã vào Payroll.
                  </p>

                  <p>
                    • Đã vào Payroll ≠ đã chuyển
                    tiền.
                  </p>

                  <p>
                    • Chi trả thực tế được đối
                    soát ở Phiếu lương & chi trả.
                  </p>
                </div>
              </section>
            )}
          </aside>
        </div>

        <footer className={styles.footer}>
          <span>
            VIBE Academy · Expense Operations
          </span>

          <span>
            Đề nghị → Duyệt → Payroll → Chi trả
          </span>
        </footer>
      </div>
    </AppPage>
  )
}
