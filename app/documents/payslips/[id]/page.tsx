import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '@/app/admin/finance/operations'
import { money } from '@/app/admin/payroll/data'
import {
  Table,
  dateText,
} from '@/app/admin/finance/_components/ui'

import PayslipDocument from '../PayslipDocument'
import {
  payslipComponentName,
  payslipTotals,
  type Payslip,
} from '../data'

function DebugBlock({ value }: { value: unknown }) {
  void value
  return <p>Không tải được phiếu lương.</p>
}

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!uuidPattern.test(id)) {
    notFound()
  }

  const db = await createClient()

  const result = await db.rpc('payroll_payslip', {
    p_payroll: id,
  })

  if (result.error) {
    return (
      <DebugBlock
        value={{
          stage: 'PAYSLIP_RPC_ERROR',
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
        }}
      />
    )
  }

  if (!result.data) {
    notFound()
  }

  const data = result.data as Payslip
  const pay = data.payroll
  const period = data.period

  const lines = data.lines ?? []
  const adjustments = data.adjustments ?? []
  const componentLines = data.component_lines_v2 ?? []
  const periodActions = data.period_actions_v2 ?? []

  const isV2 =
    data.engine === 'V2' ||
    pay.calculation_version?.startsWith('PAYROLL_V2') === true

  if (isV2) {
    const totals = data.totals

    if (!totals) {
      return (
        <DebugBlock
          value={{
            stage: 'PAYSLIP_V2_TOTALS_MISSING',
            payroll_id: pay.id,
            calculation_version: pay.calculation_version,
            component_lines: componentLines.length,
            period_actions: periodActions.length,
          }}
        />
      )
    }

    const earnings = componentLines.filter(
      (line) => line.category === 'EARNING'
    )

    const deductions = componentLines.filter(
      (line) => line.category === 'DEDUCTION'
    )

    const reimbursements = componentLines.filter(
      (line) => line.category === 'REIMBURSEMENT'
    )

    const earningActions = periodActions.filter(
      (action) => action.category === 'EARNING'
    )

    const reimbursementActions = periodActions.filter(
      (action) => action.category === 'REIMBURSEMENT'
    )

    return (
      <PayslipDocument
        reference={pay.id}
        status={period.status}
        startsOn={period.starts_on}
        endsOn={period.ends_on}
      >
        <div className="space-y-2">
          <p className="text-lg font-semibold">
            {pay.teacher_name}
          </p>

          <p>Mã nhân viên: {data.employee_code}</p>

          <p>
            Kỳ lương: {dateText(period.starts_on)}
            {' → '}
            {dateText(period.ends_on)}
          </p>

          <p>
            Trạng thái:{' '}
            {period.status === 'FINALIZED'
              ? 'Đã chốt'
              : 'Đã duyệt'}
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            Thu nhập
          </h2>

          <Table
            headers={[
              'Ngày',
              'Khoản thu nhập',
              'Số lượng',
              'Mức áp dụng',
              'Thành tiền',
            ]}
            rows={[
              ...earnings.map((line) => [
                dateText(line.earned_on),
                payslipComponentName(line.component_code),
                String(line.quantity),
                money(line.unit_rate, pay.currency),
                money(line.amount, pay.currency),
              ]),

              ...earningActions.map((action) => [
                'Trong kỳ',
                payslipComponentName(action.component_code),
                '1',
                money(action.amount, pay.currency),
                money(action.amount, pay.currency),
              ]),
            ]}
          />
        </section>

        {deductions.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">
              Khấu trừ
            </h2>

            <Table
              headers={[
                'Ngày',
                'Khoản khấu trừ',
                'Số lượng',
                'Mức áp dụng',
                'Số tiền',
              ]}
              rows={deductions.map((line) => [
                dateText(line.earned_on),
                payslipComponentName(line.component_code),
                String(line.quantity),
                money(line.unit_rate, pay.currency),
                money(line.amount, pay.currency),
              ])}
            />
          </section>
        )}

        {(reimbursements.length > 0 ||
          reimbursementActions.length > 0) && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">
              Hoàn trả
            </h2>

            <Table
              headers={[
                'Nguồn',
                'Khoản hoàn trả',
                'Nội dung',
                'Số tiền',
              ]}
              rows={[
                ...reimbursements.map((line) => [
                  line.source_type,
                  payslipComponentName(line.component_code),
                  'Theo dữ liệu kỳ lương',
                  money(line.amount, pay.currency),
                ]),

                ...reimbursementActions.map((action) => [
                  action.source_type,
                  payslipComponentName(action.component_code),
                  action.reason || 'Không có ghi chú',
                  money(action.amount, pay.currency),
                ]),
              ]}
            />
          </section>
        )}

        {adjustments.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">
              Điều chỉnh lịch sử
            </h2>

            <Table
              headers={[
                'Loại',
                'Lý do',
                'Số tiền',
              ]}
              rows={adjustments.map((adjustment) => [
                adjustment.kind,
                adjustment.reason,
                money(adjustment.amount, pay.currency),
              ])}
            />
          </section>
        )}

        <footer className="space-y-2 border-t pt-4">
          <p>
            Tổng thu nhập:{' '}
            <strong>
              {money(totals.earnings, pay.currency)}
            </strong>
          </p>

          <p>
            Tổng hoàn trả:{' '}
            <strong>
              {money(totals.reimbursements, pay.currency)}
            </strong>
          </p>

          <p>
            Tổng khấu trừ:{' '}
            <strong>
              {money(totals.deductions, pay.currency)}
            </strong>
          </p>

          {Number(totals.adjustment) !== 0 && (
            <p>
              Điều chỉnh lịch sử:{' '}
              <strong>
                {money(totals.adjustment, pay.currency)}
              </strong>
            </p>
          )}

          <p className="text-xl font-bold">
            Thực lĩnh: {money(totals.net, pay.currency)}
          </p>

          <p>
            Người duyệt:{' '}
            {period.approved_by || 'Không có thông tin'}
          </p>

          <p>
            Thời điểm duyệt:{' '}
            {period.approved_at
              ? String(period.approved_at)
              : 'Chưa có'}
          </p>

          <p>
            Chốt kỳ:{' '}
            {period.finalized_at
              ? String(period.finalized_at)
              : 'Chưa chốt'}
          </p>

          <p className="text-sm">
            Phiếu lương được lập từ bản Payroll đã
            duyệt/chốt. Việc phát hành phiếu không xác
            nhận tiền đã được chuyển cho nhân viên.
          </p>
        </footer>
      </PayslipDocument>
    )
  }

  const legacyTotals = payslipTotals(data)

  if (
    Math.round(legacyTotals.net * 100) !==
    Math.round(Number(pay.gross_amount) * 100)
  ) {
    return (
      <DebugBlock
        value={{
          stage: 'PAYSLIP_V1_TOTAL_MISMATCH',
          payroll_id: pay.id,
          calculated: legacyTotals.net,
          stored: pay.gross_amount,
        }}
      />
    )
  }

  return (
    <PayslipDocument
        reference={pay.id}
        status={period.status}
        startsOn={period.starts_on}
        endsOn={period.ends_on}
      >
      <div className="space-y-2">
        <p className="text-lg font-semibold">
          {pay.teacher_name}
        </p>

        <p>Mã nhân viên: {data.employee_code}</p>

        <p>
          Kỳ lương: {dateText(period.starts_on)}
          {' → '}
          {dateText(period.ends_on)}
        </p>
      </div>

      <Table
        headers={[
          'Ngày',
          'Khoản thu nhập',
          'Giờ theo lịch',
          'Mức đã áp dụng',
          'Thành tiền',
        ]}
        rows={lines.map((line) => [
          dateText(line.earned_on),
          line.kind,
          line.hours,
          money(line.rate, pay.currency),
          money(line.amount, pay.currency),
        ])}
      />

      {adjustments.length > 0 && (
        <Table
          headers={[
            'Điều chỉnh',
            'Lý do',
            'Số tiền',
          ]}
          rows={adjustments.map((adjustment) => [
            adjustment.kind,
            adjustment.reason,
            money(adjustment.amount, pay.currency),
          ])}
        />
      )}

      <footer className="space-y-2 border-t pt-4">
        <p>
          Tổng thu nhập:{' '}
          {money(legacyTotals.earnings, pay.currency)}
        </p>

        <p>
          Tổng khoản giảm:{' '}
          {money(legacyTotals.deductions, pay.currency)}
        </p>

        <p className="text-xl font-bold">
          Thực lĩnh:{' '}
          {money(pay.gross_amount, pay.currency)}
        </p>
      </footer>
    </PayslipDocument>
  )
}
