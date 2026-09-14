import { createClient } from '@/lib/supabase/server'

type Amount = number | string
export type Cash = { currency: string; cash_in: Amount; cash_out: Amount; net_cash: Amount }
export type Finance = {
  branch_name: string; currency: string; billed_amount: Amount; applied_payment_amount: Amount
  outstanding_amount: Amount; overdue_amount: Amount; cash_received: Amount
  cash_refunded: Amount; net_cash: Amount; overdue_invoice_count: Amount; issued_invoice_count: Amount
}
export type Forecast = {
  currency: string; month_start: string; forecast_period: 'CURRENT_MONTH' | 'NEXT_MONTH'
  expiring_tuition_count: Amount; expiring_student_count: Amount; projected_renewal_amount: Amount
  expected_cash_due: Amount; gross_forecast_opportunity: Amount
}
export type BranchForecast = Forecast & { branch_name: string }
export type Ledger = Cash & {
  transaction_id: string; transaction_number: string; transaction_type: 'PAYMENT' | 'REFUND'
  branch_name: string; occurred_at: string; payment_method: string | null
}
type Result<T> = { data: T[] | null; error: unknown }

export function vietnamMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-01`
}

// Read all summary pages: PostgREST's row limit must not silently understate totals.
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<Result<T>>): Promise<T[] | null> {
  const rows: T[] = []
  try {
    for (let from = 0; ; from += 500) {
      const result = await page(from, from + 499)
      if (result.error || !result.data) return null
      rows.push(...result.data)
      if (result.data.length < 500) return rows
    }
  } catch {
    return null
  }
}

export async function loadFinance() {
  const db = await createClient()
  const month = vietnamMonth()
  const forecastFields = 'currency,month_start,forecast_period,expiring_tuition_count,expiring_student_count,projected_renewal_amount,expected_cash_due,gross_forecast_opportunity'
  const [cash, finance, forecast, branches, ledger] = await Promise.all([
    readAll<Cash>((from, to) => db.from('branch_monthly_cash_summary')
      .select('currency,cash_in,cash_out,net_cash').eq('month_start', month)
      .order('branch_id').order('currency').order('branch_code').order('branch_name').range(from, to).returns<Cash[]>()),
    readAll<Finance>((from, to) => db.from('branch_finance_summary')
      .select('branch_name,currency,billed_amount,applied_payment_amount,outstanding_amount,overdue_amount,cash_received,cash_refunded,net_cash,overdue_invoice_count,issued_invoice_count')
      .order('branch_name').order('branch_id').order('currency').order('branch_code').range(from, to).returns<Finance[]>()),
    readAll<Forecast>((from, to) => db.from('system_monthly_revenue_forecast').select(forecastFields)
      .order('month_start').order('currency').range(from, to).returns<Forecast[]>()),
    readAll<BranchForecast>((from, to) => db.from('branch_monthly_revenue_forecast').select(`branch_name,${forecastFields}`)
      .order('month_start').order('branch_name').order('branch_id').order('currency').order('branch_code').range(from, to).returns<BranchForecast[]>()),
    (async (): Promise<Ledger[] | null> => {
      try {
        const { data, error } = await db.from('finance_cash_ledger')
          .select('transaction_id,transaction_number,transaction_type,branch_name,currency,occurred_at,payment_method,cash_in,cash_out,net_cash')
          .order('occurred_at', { ascending: false }).order('transaction_type').order('transaction_id').limit(20).returns<Ledger[]>()
        return error ? null : data
      } catch { return null }
    })(),
  ])
  return { month, cash, finance, forecast, branches, ledger }
}

export function currencies(rows: { currency: string }[]) {
  const values = [...new Set(rows.map(row => row.currency))]
  return values.length ? values.sort((a, b) => a === b ? 0 : a === 'VND' ? -1 : b === 'VND' ? 1 : a.localeCompare(b)) : ['VND']
}
export function sum<T extends { currency: string }>(rows: T[], currency: string, key: keyof T) {
  return rows.filter(row => row.currency === currency).reduce((total, row) => total + Number(row[key]), 0)
}
export function money(value: Amount, currency: string) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value))
}
