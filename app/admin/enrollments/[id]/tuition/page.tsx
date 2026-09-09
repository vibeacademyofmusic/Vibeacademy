import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { displayLabel } from '@/lib/display'

import TuitionForm from './TuitionForm'

type TuitionPageProps = {
  params: Promise<{
    id: string
  }>

  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

function formatDate(value?: string | null) {
  if (!value) return 'Chưa xác định'

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(
    new Date(`${value}T00:00:00+07:00`)
  )
}

function formatMoney(
  value: number | string | null | undefined,
  currency = 'VND'
) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function addOneDay(value: string) {
  const date = new Date(
    `${value}T00:00:00Z`
  )

  date.setUTCDate(
    date.getUTCDate() + 1
  )

  return date
    .toISOString()
    .slice(0, 10)
}

export default async function TuitionPage({
  params,
  searchParams,
}: TuitionPageProps) {
  const { id } = await params
  const messages = await searchParams

  const supabase = await createClient()

  // =======================================================
  // ENROLLMENT
  // =======================================================

  const {
    data: enrollment,
    error: enrollmentError,
  } = await supabase
    .from('enrollments')
    .select(`
      id,
      student_id,
      class_id,
      enrolled_at,
      started_at,
      ended_at,
      status
    `)
    .eq('id', id)
    .maybeSingle()

  if (enrollmentError) {
    throw new Error(
      'Không thể tải thông tin ghi danh'
    )
  }

  if (!enrollment) {
    notFound()
  }

  // =======================================================
  // STUDENT / CLASS / PLANS / HISTORY
  // =======================================================

  const [
    studentResult,
    classResult,
    plansResult,
    termsResult,
  ] = await Promise.all([
    supabase
      .from('students')
      .select(`
        id,
        student_code,
        full_name
      `)
      .eq(
        'id',
        enrollment.student_id
      )
      .maybeSingle(),

    supabase
      .from('classes')
      .select(`
        id,
        code,
        name,
        branch_id
      `)
      .eq(
        'id',
        enrollment.class_id
      )
      .maybeSingle(),

    supabase
      .from('tuition_plans')
      .select(`
        id,
        code,
        name,
        duration_months,
        status
      `)
      .eq('status', 'ACTIVE')
      .order('duration_months'),

    supabase
      .from('enrollment_tuition')
      .select(`
        id,
        tuition_plan_id,
        starts_on,
        base_ends_on,
        effective_ends_on,

        plan_code_snapshot,
        plan_name_snapshot,
        duration_months_snapshot,

        branch_code_snapshot,
        branch_name_snapshot,

        list_price,
        discount_type,
        discount_value,
        discount_amount,
        discount_name,

        amount,
        currency,
        status,
        notes,
        created_at
      `)
      .eq(
        'enrollment_id',
        enrollment.id
      )
      .order('starts_on', {
        ascending: false,
      }),
  ])

  if (
    studentResult.error ||
    classResult.error ||
    plansResult.error ||
    termsResult.error
  ) {
    console.error(
      'Tuition page load errors:',
      {
        student:
          studentResult.error,
        class:
          classResult.error,
        plans:
          plansResult.error,
        terms:
          termsResult.error,
      }
    )

    throw new Error(
      'Không thể tải dữ liệu học phí'
    )
  }

  const student =
    studentResult.data

  const classItem =
    classResult.data

  const tuitionPlans =
    plansResult.data ?? []

  const terms =
    termsResult.data ?? []

  if (!classItem) {
    throw new Error(
      'Không tìm thấy lớp học'
    )
  }

  // =======================================================
  // BRANCH
  // =======================================================

  const {
    data: branch,
    error: branchError,
  } = await supabase
    .from('branches')
    .select(`
      id,
      code,
      name
    `)
    .eq(
      'id',
      classItem.branch_id
    )
    .maybeSingle()

  if (
    branchError ||
    !branch
  ) {
    throw new Error(
      'Không thể xác định chi nhánh của lớp'
    )
  }

  // =======================================================
  // TUITION PRICE MASTER
  //
  // Get:
  // - branch-specific price
  // - default price (branch_id NULL)
  //
  // Branch override always wins.
  // =======================================================

  const planIds =
    tuitionPlans.map(
      (plan) => plan.id
    )

  let pricingRows: Array<{
    tuition_plan_id: string
    branch_id: string | null
    list_price: number | string
    currency: string
  }> = []

  if (planIds.length > 0) {
    const {
      data: prices,
      error: pricesError,
    } = await supabase
      .from(
        'tuition_plan_branch_prices'
      )
      .select(`
        tuition_plan_id,
        branch_id,
        list_price,
        currency
      `)
      .in(
        'tuition_plan_id',
        planIds
      )
      .eq('status', 'ACTIVE')

    if (pricesError) {
      throw new Error(
        'Không thể tải bảng giá học phí'
      )
    }

    pricingRows =
      (prices ?? []) as typeof pricingRows
  }

  // =======================================================
  // RESOLVE PRICE FOR EACH PLAN
  //
  // 1. Exact branch override
  // 2. Global/default price
  // =======================================================

  const tuitionOptions =
    tuitionPlans
      .map((plan) => {
        const branchPrice =
          pricingRows.find(
            (price) =>
              price.tuition_plan_id ===
                plan.id &&
              price.branch_id ===
                branch.id
          )

        const defaultPrice =
          pricingRows.find(
            (price) =>
              price.tuition_plan_id ===
                plan.id &&
              price.branch_id === null
          )

        const resolvedPrice =
          branchPrice ??
          defaultPrice

        if (!resolvedPrice) {
          return null
        }

        return {
          planId: plan.id,
          planName: plan.name,
          durationMonths:
            plan.duration_months,
          listPrice: Number(
            resolvedPrice.list_price
          ),
        }
      })
      .filter(
        (
          option
        ): option is NonNullable<
          typeof option
        > => option !== null
      )

  // =======================================================
  // NEXT TUITION TERM
  // =======================================================

  const latestActiveTerm =
    [...terms]
      .filter(
        (term) =>
          term.status !==
          'CANCELLED'
      )
      .sort((a, b) =>
        b.effective_ends_on.localeCompare(
          a.effective_ends_on
        )
      )[0]

  const nextStartsOn =
    latestActiveTerm
      ? addOneDay(
          latestActiveTerm
            .effective_ends_on
        )
      : enrollment.started_at

  const canCreateTuition =
    enrollment.status ===
      'ACTIVE' &&
    Boolean(
      enrollment.started_at
    ) &&
    Boolean(nextStartsOn) &&
    tuitionOptions.length > 0

  return (
    <main className="max-w-5xl space-y-6">
      {/* ================================================
          NAVIGATION
      ================================================ */}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href={`/admin/students/${enrollment.student_id}`}
          className="font-medium text-blue-700 underline"
        >
          ← Hồ sơ học viên
        </Link>

        <Link
          href={`/admin/classes/${enrollment.class_id}`}
          className="font-medium text-blue-700 underline"
        >
          Lớp học
        </Link>
      </div>

      {/* ================================================
          HEADER
      ================================================ */}

      <section>
        <p className="text-sm font-medium text-gray-500">
          Tuition & Renewal
        </p>

        <h1 className="mt-1 text-3xl font-bold text-gray-950">
          Quản lý học phí
        </h1>

        <p className="mt-2 text-gray-600">
          {student?.full_name ??
            student?.student_code ??
            'Học viên'}
          {' · '}
          {classItem.name ??
            classItem.code}
        </p>
      </section>

      {/* ================================================
          MESSAGES
      ================================================ */}

      {messages.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {messages.error}
        </div>
      )}

      {messages.success && (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          {messages.success}
        </div>
      )}

      {/* ================================================
          ENROLLMENT SUMMARY
      ================================================ */}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-950">
          Thông tin ghi danh
        </h2>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Chi nhánh
            </dt>

            <dd className="mt-1 font-semibold">
              {branch.name}
            </dd>

            <p className="mt-1 text-xs text-gray-500">
              {branch.code}
            </p>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Ngày ghi danh lớp
            </dt>

            <dd className="mt-1 font-semibold">
              {formatDate(
                enrollment.enrolled_at
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Ngày bắt đầu học
            </dt>

            <dd className="mt-1 font-semibold">
              {formatDate(
                enrollment.started_at
              )}
            </dd>

            <p className="mt-1 text-xs font-medium text-amber-700">
              Mốc tính học phí
            </p>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Trạng thái
            </dt>

            <dd className="mt-1 font-semibold">
              {displayLabel(
                enrollment.status
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* ================================================
          CREATE / RENEW TUITION
      ================================================ */}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-950">
          {latestActiveTerm
            ? 'Gia hạn học phí'
            : 'Tạo kỳ học phí đầu tiên'}
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Giá học phí được hệ thống tự
          động xác định theo chi nhánh.
        </p>

        {!enrollment.started_at ? (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Học viên chưa có ngày bắt
            đầu học nên chưa thể tạo
            học phí.
          </div>
        ) : enrollment.status !==
          'ACTIVE' ? (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Chỉ ghi danh đang hoạt
            động mới có thể tạo kỳ học
            phí mới.
          </div>
        ) : tuitionOptions.length ===
          0 ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Chi nhánh này chưa có bảng
            giá học phí phù hợp.
          </div>
        ) : canCreateTuition &&
          nextStartsOn ? (
          <TuitionForm
            enrollmentId={
              enrollment.id
            }
            branchName={
              branch.name
            }
            startsOn={
              nextStartsOn
            }
            isRenewal={Boolean(
              latestActiveTerm
            )}
            options={
              tuitionOptions
            }
          />
        ) : null}
      </section>

      {/* ================================================
          HISTORY
      ================================================ */}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-950">
          Lịch sử học phí
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Mỗi kỳ giữ nguyên giá niêm
          yết, chương trình giảm giá và
          thành tiền tại thời điểm đăng
          ký.
        </p>

        {terms.length === 0 ? (
          <p className="mt-5 text-sm text-gray-500">
            Chưa có kỳ học phí nào.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {terms.map((term) => (
              <article
                key={term.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">
                      {
                        term.plan_name_snapshot
                      }
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      {
                        term.branch_name_snapshot
                      }
                      {' · '}
                      {
                        term.duration_months_snapshot
                      }{' '}
                      tháng
                    </p>
                  </div>

                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    {displayLabel(
                      term.status
                    )}
                  </span>
                </div>

                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      Giá niêm yết
                    </dt>

                    <dd className="mt-1 font-semibold">
                      {formatMoney(
                        term.list_price,
                        term.currency
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      Giảm giá
                    </dt>

                    <dd className="mt-1 font-semibold">
                      −{' '}
                      {formatMoney(
                        term.discount_amount,
                        term.currency
                      )}
                    </dd>

                    {term.discount_type ===
                      'PERCENT' && (
                      <p className="mt-1 text-xs text-gray-500">
                        {
                          term.discount_value
                        }
                        %
                      </p>
                    )}

                    {term.discount_name && (
                      <p className="mt-1 text-xs text-gray-500">
                        {
                          term.discount_name
                        }
                      </p>
                    )}
                  </div>

                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      Thành tiền
                    </dt>

                    <dd className="mt-1 text-lg font-bold text-gray-950">
                      {formatMoney(
                        term.amount,
                        term.currency
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      Thời hạn
                    </dt>

                    <dd className="mt-1 text-sm font-semibold">
                      {formatDate(
                        term.starts_on
                      )}
                      {' → '}
                      {formatDate(
                        term.effective_ends_on
                      )}
                    </dd>

                    {term.effective_ends_on !==
                      term.base_ends_on && (
                      <p className="mt-1 text-xs text-amber-700">
                        Đã điều chỉnh thời
                        hạn
                      </p>
                    )}
                  </div>
                </dl>

                {term.notes && (
                  <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-600">
                    {term.notes}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}