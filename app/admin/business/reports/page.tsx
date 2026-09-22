import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { activityLabels, cohortLabels, cohortRate, costPer, formatCost, formatRate } from './model'

type Filters = { from?: string; to?: string; branch?: string; campaign?: string; source?: string; owner?: string; program?: string }

function valueOf(rows: { metric: string; value: number }[] | null, metric: string) {
  const value = rows?.find(row => row.metric === metric)?.value
  return value == null ? null : Number(value)
}

export default async function BusinessReportPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams
  const today = businessDate()
  const from = filters.from || `${today.slice(0, 7)}-01`
  const to = filters.to || today
  const db = await createClient()
  const args = {
    p_from: from,
    p_to: to,
    p_branch: filters.branch || null,
    p_campaign: filters.campaign || null,
    p_source: filters.source || null,
    p_owner: filters.owner || null,
    p_program: filters.program || null,
  }
  const [{ data: branches }, { data: campaigns }, { data: owners }, { data: cohort }, { data: activity }, campaignRow] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('crm_campaigns').select('id, name, budget_amount').order('name'),
    db.from('profiles').select('id, full_name').eq('status', 'ACTIVE').order('full_name').limit(100),
    db.rpc('crm_cohort_funnel', args),
    db.rpc('crm_activity_funnel', args),
    filters.campaign ? db.from('crm_campaigns').select('budget_amount').eq('id', filters.campaign).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const created = valueOf(cohort, 'new') ?? 0
  const qualified = valueOf(cohort, 'qualified') ?? 0
  const won = valueOf(cohort, 'won') ?? 0
  const budget = campaignRow.data?.budget_amount == null ? null : Number(campaignRow.data.budget_amount)
  const cohortOrder = ['new', 'contacted', 'qualified', 'trial_booked', 'trial_completed', 'proposal', 'negotiating', 'won', 'lost']
  const activityOrder = ['contacted', 'qualified', 'trial_booked', 'trial_completed', 'proposal', 'negotiating', 'won', 'lost']

  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">Báo cáo kinh doanh</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">Phễu theo nhóm lấy khách được tạo trong kỳ, kể cả khi chốt ở kỳ sau. Phễu hoạt động chỉ đếm sự kiện xảy ra trong kỳ.</p>
      <form className="mt-6 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-4">
        <input name="from" type="date" defaultValue={from} className="rounded-lg border border-gray-300 px-3 py-2" />
        <input name="to" type="date" defaultValue={to} className="rounded-lg border border-gray-300 px-3 py-2" />
        <select name="branch" defaultValue={filters.branch || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi chi nhánh</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select name="campaign" defaultValue={filters.campaign || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi chiến dịch</option>{(campaigns ?? []).map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
        <input name="source" defaultValue={filters.source || ''} placeholder="Nguồn, ví dụ MANUAL" className="rounded-lg border border-gray-300 px-3 py-2" />
        <select name="owner" defaultValue={filters.owner || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi người phụ trách</option>{(owners ?? []).map(owner => <option key={owner.id} value={owner.id}>{owner.full_name || 'Chưa có tên'}</option>)}</select>
        <input name="program" defaultValue={filters.program || ''} placeholder="Bộ môn" className="rounded-lg border border-gray-300 px-3 py-2" />
        <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Xem</button>
      </form>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Tỷ lệ đủ điều kiện</h2><p className="mt-2 text-2xl font-semibold">{formatRate(cohortRate(qualified, created))}</p></article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Đủ điều kiện → thành công</h2><p className="mt-2 text-2xl font-semibold">{formatRate(cohortRate(won, qualified))}</p></article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Tỷ lệ chuyển đổi</h2><p className="mt-2 text-2xl font-semibold">{formatRate(cohortRate(won, created))}</p></article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Chi phí mỗi khách thành công</h2><p className="mt-2 text-2xl font-semibold">{formatCost(costPer(budget, won))}</p><p className="mt-1 text-sm text-gray-500">Mỗi lead: {formatCost(costPer(budget, created))}</p></article>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Phễu theo nhóm tạo mới</h2>
          <dl className="mt-4 space-y-2 text-sm">{cohortOrder.map(metric => <div key={metric} className="flex justify-between gap-4"><dt>{cohortLabels[metric]}</dt><dd>{valueOf(cohort, metric) ?? 0}</dd></div>)}</dl>
          <p className="mt-4 text-sm text-gray-500">{cohortLabels.hours_to_first_contact}: {valueOf(cohort, 'hours_to_first_contact') ?? 'Chưa đủ dữ liệu'}</p>
          <p className="text-sm text-gray-500">{cohortLabels.days_to_close}: {valueOf(cohort, 'days_to_close') ?? 'Chưa đủ dữ liệu'}</p>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Phễu theo hoạt động trong kỳ</h2>
          <dl className="mt-4 space-y-2 text-sm">{activityOrder.map(metric => <div key={metric} className="flex justify-between gap-4"><dt>{activityLabels[metric]}</dt><dd>{valueOf(activity, metric) ?? 0}</dd></div>)}</dl>
        </section>
      </div>
    </div>
  )
}
