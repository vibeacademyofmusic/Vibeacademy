import type { Payroll } from '@/app/admin/payroll/data'
type Line = { id: string; earned_on: string; kind: string; hours: number; rate: number; amount: number; required_minutes: number | null; payable_minutes: number | null }
type Adjustment = { id: string; kind: string; amount: number; reason: string }
export type Payslip = { payroll: Payroll; employee_code: string; period: { starts_on: string; ends_on: string; status: string; approved_by: string; approved_at: string; finalized_at: string | null }; lines: Line[]; adjustments: Adjustment[] }
export function payslipTotals(data: Payslip) {
  const amounts = [...data.lines, ...data.adjustments].map(x => Math.round(Number(x.amount) * 100))
  return { earnings: amounts.filter(x => x > 0).reduce((a, b) => a + b, 0) / 100, deductions: amounts.filter(x => x < 0).reduce((a, b) => a - b, 0) / 100, net: amounts.reduce((a, b) => a + b, 0) / 100 }
}
