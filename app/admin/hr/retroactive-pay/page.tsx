import Link from 'next/link'

import { adminClient, uuidPattern } from '../../finance/operations'
import SubmitButton from '../../finance/_components/SubmitButton'
import Preview from '../../payroll/_ux/Preview'

import { retroactiveAction } from './actions'

type Params = {
  source?: string
  employee?: string
  claim?: string
  success?: string
  error?: string
}

type Claim = {
  id: string
  source_period_id: string
  target_period_id: string | null
  employee_id: string
  branch_id: string
  amount: string | number
  currency: string
  reason: string
  status: string
  version: number
  created_by: string
  created_at: string
  approved_by: string | null
  approved_at: string | null
  posted_action_id: string | null
}

const statusName: Record<string, string> = {
  DRAFT: 'Nháp',
  REVIEW: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  POSTED: 'Đã đưa vào kỳ lương',
  CANCELLED: 'Đã hủy',
}

function money(
  value: string | number,
  currency: string
) {
  return (
    Number(value).toLocaleString('vi-VN') +
    ' ' +
    currency
  )
}

export default async function RetroactivePage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const p = await searchParams
  const db = await adminClient()

  let claim: Claim | null = null

  if (uuidPattern.test(p.claim || '')) {
    const result = await db
      .from('payroll_retroactive_claims')
      .select('*')
      .eq('id', p.claim!)
      .maybeSingle<Claim>()

    claim = result.data || null
  }

  if (
    !claim
    && uuidPattern.test(p.source || '')
    && uuidPattern.test(p.employee || '')
  ) {
    const existing = await db
      .from('payroll_retroactive_claims')
      .select('*')
      .eq('source_period_id', p.source!)
      .eq('employee_id', p.employee!)
      .neq('status', 'CANCELLED')
      .maybeSingle<Claim>()

    claim = existing.data || null
  }

  const sourceId =
    claim?.source_period_id ||
    (uuidPattern.test(p.source || '')
      ? p.source!
      : '')

  const employeeId =
    claim?.employee_id ||
    (uuidPattern.test(p.employee || '')
      ? p.employee!
      : '')

  const [
    sourceResult,
    employeeResult,
  ] = await Promise.all([
    sourceId
      ? db
          .from('payroll_periods')
          .select(
            'id,branch_id,starts_on,ends_on,status,version'
          )
          .eq('id', sourceId)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),

    employeeId
      ? db
          .from('employee_directory')
          .select(
            'id,employee_code,full_name'
          )
          .eq('id', employeeId)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),
  ])

  const source = sourceResult.data
  const employee = employeeResult.data

  let targets:
    {
      id: string
      starts_on: string
      status: string
      version: number
    }[] = []

  if (source) {
    const result = await db
      .from('payroll_periods')
      .select(
        'id,starts_on,status,version'
      )
      .eq(
        'branch_id',
        source.branch_id
      )
      .gt(
        'starts_on',
        source.starts_on
      )
      .in(
        'status',
        ['DRAFT','GENERATED','REVIEW']
      )
      .order('starts_on')

    targets = result.data || []
  }

  const target =
    claim?.target_period_id
      ? targets.find(
          row =>
            row.id ===
            claim!.target_period_id
        ) ||
        (
          await db
            .from('payroll_periods')
            .select(
              'id,starts_on,status,version'
            )
            .eq(
              'id',
              claim.target_period_id
            )
            .maybeSingle()
        ).data
      : null

  const targetPayroll =
    claim?.target_period_id
    && employeeId
      ? (
          await db
            .from('teacher_payrolls')
            .select('id')
            .eq(
              'period_id',
              claim.target_period_id
            )
            .eq(
              'employee_id',
              employeeId
            )
            .maybeSingle()
        ).data
      : null

  const configs =
    source && employeeId
      ? (
          await db
            .from(
              'staff_compensation_components'
            )
            .select(
              'id,component_code,calculation_method,amount,rate,currency,effective_from,effective_to,status'
            )
            .eq(
              'employee_id',
              employeeId
            )
            .eq(
              'branch_id',
              source.branch_id
            )
            .eq('status','ACTIVE')
            .lte(
              'effective_from',
              source.ends_on
            )
            .or(
              `effective_to.is.null,effective_to.gte.${source.starts_on}`
            )
            .order('component_code')
        ).data || []
      : []

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <Link
          href={
            source
              ? '/admin/payroll/' +
                source.id
              : '/admin/payroll'
          }
          className="text-sm underline"
        >
          ← Kỳ lương
        </Link>

        <h1 className="mt-3 text-3xl font-semibold text-slate-900">
          Truy lĩnh kỳ trước
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Dùng khi nhân viên bị bỏ sót hoàn toàn
          trong một kỳ đã duyệt/chốt.
          Kỳ nguồn không bị mở lại hoặc ghi đè.
        </p>
      </div>

      {p.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {p.error}
        </div>
      )}

      {p.success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {p.success}
        </div>
      )}

      {!source || !employee ? (
        <div className="rounded-xl border bg-white p-5">
          Chọn nhân viên từ tab
          “Vấn đề cần xử lý” của kỳ lương đã chốt.
        </div>
      ) : (
        <>
          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">
              Hồ sơ nguồn
            </h2>

            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-500">
                  Nhân viên
                </p>
                <strong>
                  {employee.full_name}
                </strong>
                <p>
                  {employee.employee_code}
                </p>
              </div>

              <div>
                <p className="text-slate-500">
                  Kỳ bị bỏ sót
                </p>
                <strong>
                  {source.starts_on.slice(0,7)}
                </strong>
                <p>{source.status}</p>
              </div>

              <div>
                <p className="text-slate-500">
                  Nguyên tắc
                </p>
                <strong>
                  Không sửa kỳ nguồn
                </strong>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">
              Cấu hình tìm thấy trong kỳ nguồn
            </h2>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2">
                      Thành phần
                    </th>
                    <th>Giá trị</th>
                    <th>Hiệu lực</th>
                  </tr>
                </thead>

                <tbody>
                  {configs.map(config => (
                    <tr
                      key={config.id}
                      className="border-b"
                    >
                      <td className="py-2">
                        {config.component_code}
                      </td>

                      <td>
                        {config.amount != null
                          ? money(
                              config.amount,
                              config.currency ||
                                'VND'
                            )
                          : config.rate != null
                            ? money(
                                config.rate,
                                config.currency ||
                                  'VND'
                              )
                            : '—'}
                      </td>

                      <td>
                        {config.effective_from}
                        {' → '}
                        {config.effective_to ||
                          'không giới hạn'}
                      </td>
                    </tr>
                  ))}

                  {!configs.length && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-4 text-slate-500"
                      >
                        Không đọc được cấu hình nguồn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {!claim ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
              <h2 className="font-semibold">
                Tạo hồ sơ truy lĩnh
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                V1 không tự suy đoán số tiền từ cấu hình.
                HR phải nhập số tiền đã kiểm tra và ghi rõ căn cứ.
              </p>

              <form
                action={retroactiveAction}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <input
                  type="hidden"
                  name="action"
                  value="create"
                />

                <input
                  type="hidden"
                  name="source"
                  value={source.id}
                />

                <input
                  type="hidden"
                  name="employee"
                  value={employee.id}
                />

                <label className="text-sm">
                  <span>
                    Số tiền truy lĩnh *
                  </span>
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    pattern="[0-9]{1,12}([.][0-9]{1,2})?"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>

                <label className="text-sm">
                  <span>Tiền tệ *</span>
                  <input
                    name="currency"
                    required
                    defaultValue="VND"
                    pattern="[A-Z]{3}"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span>
                    Căn cứ / lý do *
                  </span>
                  <textarea
                    name="reason"
                    required
                    maxLength={2000}
                    rows={3}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    placeholder="Ví dụ: Nhân viên được bổ sung hồ sơ sau khi kỳ 09/2026 đã chốt; lương kỳ 09 bị bỏ sót."
                  />
                </label>

                <div>
                  <SubmitButton>
                    Tạo hồ sơ truy lĩnh
                  </SubmitButton>
                </div>
              </form>
            </section>
          ) : (
            <section className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">
                    Hồ sơ truy lĩnh
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {claim.id}
                  </p>
                </div>

                <span className="rounded-full border px-3 py-1 text-sm font-medium">
                  {statusName[claim.status] ||
                    claim.status}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-500">
                    Số tiền
                  </p>
                  <strong className="text-lg">
                    {money(
                      claim.amount,
                      claim.currency
                    )}
                  </strong>
                </div>

                <div>
                  <p className="text-sm text-slate-500">
                    Kỳ nguồn
                  </p>
                  <strong>
                    {source.starts_on.slice(0,7)}
                  </strong>
                </div>

                <div>
                  <p className="text-sm text-slate-500">
                    Kỳ nhận
                  </p>
                  <strong>
                    {target
                      ? target.starts_on.slice(
                          0,
                          7
                        )
                      : 'Chưa chọn'}
                  </strong>
                </div>
              </div>

              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                <strong>Căn cứ:</strong>{' '}
                {claim.reason}
              </p>

              {claim.status === 'DRAFT' && (
                <form
                  action={retroactiveAction}
                  className="mt-4"
                >
                  <input
                    type="hidden"
                    name="action"
                    value="submit"
                  />
                  <input
                    type="hidden"
                    name="claim"
                    value={claim.id}
                  />
                  <input
                    type="hidden"
                    name="version"
                    value={claim.version}
                  />

                  <SubmitButton>
                    Gửi duyệt
                  </SubmitButton>
                </form>
              )}

              {claim.status === 'REVIEW' && (
                <form
                  action={retroactiveAction}
                  className="mt-5 space-y-4 rounded-lg border p-4"
                >
                  <input
                    type="hidden"
                    name="action"
                    value="approve"
                  />
                  <input
                    type="hidden"
                    name="claim"
                    value={claim.id}
                  />
                  <input
                    type="hidden"
                    name="version"
                    value={claim.version}
                  />

                  <label className="block text-sm">
                    <span>
                      Kỳ lương nhận khoản truy lĩnh *
                    </span>

                    <select
                      name="target"
                      required
                      defaultValue=""
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    >
                      <option
                        value=""
                        disabled
                      >
                        Chọn kỳ sau
                      </option>

                      {targets.map(row => (
                        <option
                          key={row.id}
                          value={row.id}
                        >
                          {row.starts_on.slice(
                            0,
                            7
                          )}
                          {' · '}
                          {row.status}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!targets.length && (
                    <p className="text-sm text-amber-700">
                      Chưa có kỳ lương mở sau kỳ nguồn.
                      Hãy tạo kỳ lương tiếp theo trước.
                    </p>
                  )}

                  <label className="block text-sm">
                    <span>
                      Ghi chú duyệt *
                    </span>
                    <textarea
                      name="note"
                      required
                      rows={3}
                      maxLength={2000}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>

                  <details className="rounded-lg bg-amber-50 p-3">
                    <summary className="cursor-pointer font-medium">
                      SUPER_ADMIN emergency override
                    </summary>

                    <p className="my-2 text-sm">
                      Chỉ dùng khi cùng một tài khoản
                      buộc phải vừa lập vừa duyệt trong môi trường kiểm thử.
                      Production nên dùng người duyệt khác.
                    </p>

                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="override"
                        value="yes"
                      />
                      Xác nhận dùng ngoại lệ
                    </label>

                    <textarea
                      name="override_reason"
                      rows={2}
                      maxLength={2000}
                      className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      placeholder="Lý do sử dụng ngoại lệ"
                    />
                  </details>

                  <SubmitButton>
                    Duyệt truy lĩnh
                  </SubmitButton>
                </form>
              )}

              {claim.status === 'APPROVED' && (
                <div className="mt-5 space-y-3">
                  {!target ? (
                    <p>
                      Chưa xác định kỳ nhận.
                    </p>
                  ) : ['APPROVED','FINALIZED'].includes(target.status) ? (
                    <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4">
                      <div>
                        <p className="font-semibold text-red-900">
                          Kỳ nhận đã đóng trước khi truy lĩnh được đưa vào
                        </p>

                        <p className="mt-1 text-sm text-red-800">
                          Kỳ {target.starts_on.slice(0,7)} đang ở trạng thái {target.status}.
                          Khoản truy lĩnh chưa POST nên không được ghi ngược vào kỳ này.
                          Hãy chuyển hồ sơ sang một kỳ lương đang mở phía sau.
                        </p>
                      </div>

                      {targets.length ? (
                        <form
                          action={retroactiveAction}
                          className="space-y-3 rounded-lg border border-red-200 bg-white p-4"
                        >
                          <input
                            type="hidden"
                            name="action"
                            value="retarget"
                          />

                          <input
                            type="hidden"
                            name="claim"
                            value={claim.id}
                          />

                          <input
                            type="hidden"
                            name="version"
                            value={claim.version}
                          />

                          <label className="block text-sm">
                            <span>
                              Chuyển sang kỳ nhận *
                            </span>

                            <select
                              name="target"
                              required
                              defaultValue=""
                              className="mt-1 w-full rounded-lg border px-3 py-2"
                            >
                              <option value="" disabled>
                                Chọn kỳ đang mở
                              </option>

                              {targets.map(row => (
                                <option
                                  key={row.id}
                                  value={row.id}
                                >
                                  {row.starts_on.slice(0,7)}
                                  {' · '}
                                  {row.status}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-sm">
                            <span>
                              Lý do chuyển kỳ *
                            </span>

                            <textarea
                              name="reason"
                              required
                              rows={3}
                              maxLength={2000}
                              className="mt-1 w-full rounded-lg border px-3 py-2"
                              defaultValue={`Kỳ nhận ${target.starts_on.slice(0,7)} đã đóng trước khi khoản truy lĩnh được POST.`}
                            />
                          </label>

                          <SubmitButton>
                            Chuyển truy lĩnh sang kỳ nhận mới
                          </SubmitButton>
                        </form>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-red-800">
                            Hiện chưa có kỳ lương đang mở phù hợp sau kỳ nguồn.
                          </p>

                          <Link
                            href="/admin/payroll"
                            className="inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
                          >
                            Tạo / mở kỳ lương tiếp theo →
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : target.status === 'DRAFT' ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <p className="font-semibold text-amber-900">
                          Bước tiếp theo · Tính bảng lương kỳ nhận
                        </p>

                        <p className="mt-1 text-sm text-amber-800">
                          Hồ sơ truy lĩnh đã được duyệt.
                          Kỳ nhận{' '}
                          <strong>
                            {target.starts_on.slice(
                              0,
                              7
                            )}
                          </strong>{' '}
                          đang ở Bản nháp.
                          Anh có thể tính Payroll ngay bên dưới,
                          không cần rời khỏi hồ sơ truy lĩnh.
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="mb-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                            Bước 1
                          </p>

                          <h3 className="mt-1 text-lg font-semibold text-slate-900">
                            Tính bảng lương {target.starts_on.slice(0, 7)}
                          </h3>

                          <p className="mt-1 text-sm text-slate-600">
                            Xem chênh lệch trước.
                            Nếu dữ liệu hợp lệ, xác nhận tính.
                            Sau khi thành công trang này sẽ tự cập nhật.
                          </p>
                        </div>

                        <Preview period={target.id} />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          prefetch={false}
                          href={'/admin/payroll/' + target.id}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                        >
                          Mở toàn bộ kỳ lương {target.starts_on.slice(0, 7)}
                        </Link>
                      </div>
                    </div>
                  ) : !targetPayroll ? (
                    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div>
                        <p className="font-semibold text-amber-900">
                          Kỳ nhận đã được tính nhưng nhân viên chưa có bản lương
                        </p>

                        <p className="mt-1 text-sm text-amber-800">
                          Payroll của kỳ{' '}
                          <strong>
                            {target.starts_on.slice(0, 7)}
                          </strong>{' '}
                          chưa sinh payroll header cho nhân viên này.
                          Đây là lỗi nguồn/cấu hình cần xử lý trong kỳ nhận,
                          không phải lỗi hồ sơ truy lĩnh.
                        </p>
                      </div>

                      <Link
                        prefetch={false}
                        href={'/admin/payroll/' + target.id + '?tab=issues'}
                        className="inline-flex w-fit rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
                      >
                        Mở kỳ nhận để xử lý →
                      </Link>
                    </div>
                  ) : (
                    <form
                      action={retroactiveAction}
                      className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
                    >
                      <input
                        type="hidden"
                        name="action"
                        value="post"
                      />
                      <input
                        type="hidden"
                        name="claim"
                        value={claim.id}
                      />
                      <input
                        type="hidden"
                        name="version"
                        value={claim.version}
                      />
                      <input
                        type="hidden"
                        name="period_version"
                        value={target.version}
                      />

                      <p className="text-sm">
                        Khoản này sẽ được cộng vào
                        bảng lương kỳ{' '}
                        <strong>
                          {target.starts_on.slice(
                            0,
                            7
                          )}
                        </strong>
                        . Không sửa kỳ nguồn.
                      </p>

                      <textarea
                        name="note"
                        required
                        rows={2}
                        maxLength={2000}
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                        placeholder="Ghi chú đưa khoản truy lĩnh vào kỳ lương"
                      />

                      <SubmitButton>
                        Đưa vào kỳ lương
                      </SubmitButton>
                    </form>
                  )}
                </div>
              )}

              {claim.status === 'POSTED' && (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <strong>
                    Đã đưa vào kỳ lương.
                  </strong>

                  {claim.target_period_id && (
                    <p className="mt-2 text-sm">
                      <Link
                        className="underline"
                        href={
                          '/admin/payroll/' +
                          claim.target_period_id
                        }
                      >
                        Mở kỳ nhận →
                      </Link>
                    </p>
                  )}
                </div>
              )}

              {['DRAFT','REVIEW','APPROVED'].includes(
                claim.status
              ) && (
                <details className="mt-5">
                  <summary className="cursor-pointer text-sm text-red-700">
                    Hủy hồ sơ truy lĩnh
                  </summary>

                  <form
                    action={retroactiveAction}
                    className="mt-3 space-y-3"
                  >
                    <input
                      type="hidden"
                      name="action"
                      value="cancel"
                    />
                    <input
                      type="hidden"
                      name="claim"
                      value={claim.id}
                    />
                    <input
                      type="hidden"
                      name="version"
                      value={claim.version}
                    />

                    <textarea
                      name="note"
                      required
                      rows={2}
                      maxLength={2000}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Lý do hủy"
                    />

                    <SubmitButton>
                      Xác nhận hủy hồ sơ
                    </SubmitButton>
                  </form>
                </details>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
