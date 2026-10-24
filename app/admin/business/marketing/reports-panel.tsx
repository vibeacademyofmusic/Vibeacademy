import { businessDate } from '@/app/admin/_lib/business-date'
import { FormField, MetricCard, SectionCard, SelectField } from '@/app/admin/_components/vibe'
import { createClient } from '@/lib/supabase/server'

import { activityLabels, cohortLabels, cohortRate, costPer, formatCost, formatRate } from '../reports/model'
import { marketingPath } from '../workspaces'

type Filters = { from?: string; to?: string; branch?: string; campaign?: string; source?: string; owner?: string; program?: string }

function valueOf(rows: { metric: string; value: number }[] | null, metric: string) {
  const value = rows?.find(row => row.metric === metric)?.value
  return value == null ? null : Number(value)
}

export async function MarketingReportsPanel({ filters }: { filters: Filters }) {
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
    <>
      <form className="vibe-filter" action={marketingPath} method="get">
        <input type="hidden" name="tab" value="reports" />
        <FormField label="Từ ngày" name="from" type="date" defaultValue={from} />
        <FormField label="Đến ngày" name="to" type="date" defaultValue={to} />
        <SelectField label="Chi nhánh" name="branch" defaultValue={filters.branch || ''}><option value="">Mọi chi nhánh</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
        <SelectField label="Chiến dịch" name="campaign" defaultValue={filters.campaign || ''}><option value="">Mọi chiến dịch</option>{(campaigns ?? []).map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</SelectField>
        <FormField label="Nguồn" name="source" defaultValue={filters.source || ''} placeholder="Ví dụ MANUAL" />
        <SelectField label="Người phụ trách" name="owner" defaultValue={filters.owner || ''}><option value="">Mọi người phụ trách</option>{(owners ?? []).map(owner => <option key={owner.id} value={owner.id}>{owner.full_name || 'Chưa có tên'}</option>)}</SelectField>
        <FormField label="Bộ môn" name="program" defaultValue={filters.program || ''} />
        <button className="vibe-button vibe-button-primary" type="submit">Xem</button>
      </form>
      <div className="vibe-metrics">
        <MetricCard title="Tỷ lệ đủ điều kiện" value={formatRate(cohortRate(qualified, created))} />
        <MetricCard title="Đủ điều kiện → thành công" value={formatRate(cohortRate(won, qualified))} />
        <MetricCard title="Tỷ lệ chuyển đổi" value={formatRate(cohortRate(won, created))} />
        <MetricCard title="Chi phí mỗi khách thành công" value={formatCost(costPer(budget, won))} note={`Mỗi lead: ${formatCost(costPer(budget, created))}`} />
      </div>
      <div className="vibe-grid">
        <SectionCard title="Phễu theo nhóm tạo mới">
          <dl className="space-y-2 text-sm">{cohortOrder.map(metric => <div key={metric} className="flex justify-between gap-4"><dt>{cohortLabels[metric]}</dt><dd>{valueOf(cohort, metric) ?? 0}</dd></div>)}</dl>
          <p>{cohortLabels.hours_to_first_contact}: {valueOf(cohort, 'hours_to_first_contact') ?? 'Chưa đủ dữ liệu'}</p>
          <p>{cohortLabels.days_to_close}: {valueOf(cohort, 'days_to_close') ?? 'Chưa đủ dữ liệu'}</p>
        </SectionCard>
        <SectionCard title="Phễu theo hoạt động trong kỳ">
          <dl className="space-y-2 text-sm">{activityOrder.map(metric => <div key={metric} className="flex justify-between gap-4"><dt>{activityLabels[metric]}</dt><dd>{valueOf(activity, metric) ?? 0}</dd></div>)}</dl>
        </SectionCard>
      </div>
    </>
  )
}
