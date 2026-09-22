import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { cohortRate, formatRate } from './reports/model'

const cards = [
  { metric: 'leads_created_month', label: 'Mới trong tháng', href: '/admin/business/crm' },
  { metric: 'uncontacted', label: 'Chưa liên hệ', href: '/admin/business/crm?queue=uncontacted' },
  { metric: 'follow_up_today', label: 'Follow-up hôm nay', href: '/admin/business/crm?queue=due' },
  { metric: 'follow_up_overdue', label: 'Follow-up quá hạn', href: '/admin/business/crm?queue=overdue' },
  { metric: 'qualified_now', label: 'Đủ điều kiện', href: '/admin/business/crm?status=QUALIFIED' },
  { metric: 'negotiating_now', label: 'Đang thương lượng', href: '/admin/business/crm?queue=negotiating' },
  { metric: 'trial_today', label: 'Học thử hôm nay', href: '/admin/business/crm?queue=trial' },
  { metric: 'won_cohort_month', label: 'Thành công trong nhóm tháng này', href: '/admin/business/crm?tab=won' },
  { metric: 'reactivation_open', label: 'Hồ sơ cũ đang mở', href: '/admin/business/reactivation' },
  { metric: 'reactivation_need_contact', label: 'Cũ chưa liên hệ', href: '/admin/business/reactivation?status=NEW_REACTIVATION' },
  { metric: 'reactivation_interested', label: 'Cũ quan tâm quay lại', href: '/admin/business/reactivation?status=INTERESTED' },
  { metric: 'reactivation_returned_month', label: 'Đã quay lại trong tháng', href: '/admin/business/reactivation?status=RETURNED' },
  { metric: 'warranty_active', label: 'Đang bảo hành', href: '/admin/business/instrument-customers?filter=ACTIVE' },
  { metric: 'warranty_expiring', label: 'Bảo hành sắp hết', href: '/admin/business/instrument-customers?filter=EXPIRING' },
  { metric: 'warranty_open', label: 'Hồ sơ bảo hành đang mở', href: '/admin/business/instrument-customers?filter=OPEN_CASE' },
  { metric: 'after_sales_follow_up', label: 'Hậu mãi đến hạn', href: '/admin/business/instrument-customers?view=care&filter=FOLLOW_UP' },
  { metric: 'upgrade_opportunities', label: 'Cơ hội nâng cấp', href: '/admin/business/instrument-customers?view=care' },
  { metric: 'repurchased', label: 'Đã mua lại', href: '/admin/business/instrument-customers?view=care' },
  { metric: 'campaigns_active', label: 'Chiến dịch đang chạy', href: '/admin/business/campaigns?status=ACTIVE' },
]

export default async function BusinessHomePage() {
  const db = await createClient()
  const { data, error } = await db.rpc('crm_business_snapshot', { p_branch: null })
  const metrics = new Map(((data ?? []) as { metric: string; value: number }[]).map(row => [row.metric, Number(row.value)]))
  const created = metrics.get('leads_created_month') ?? 0
  const won = metrics.get('won_cohort_month') ?? 0
  const opened = metrics.get('reactivation_opened_month') ?? 0
  const returned = metrics.get('reactivation_returned_month') ?? 0

  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">Điều hành kinh doanh</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">Số liệu đọc từ khách hàng mới, khách hàng cũ, phiếu bán đàn và chiến dịch. Không xếp hạng nhân viên.</p>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Không tải được số liệu.</div>}
      <section className="mt-6">
        <h2 className="text-sm font-semibold tracking-wide text-gray-500">HÔM NAY CẦN XỬ LÝ</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.filter(card => ['uncontacted', 'follow_up_overdue', 'trial_today', 'negotiating_now', 'reactivation_need_contact', 'warranty_open', 'warranty_expiring', 'after_sales_follow_up'].includes(card.metric)).map(card => (
            <Link key={card.metric} href={card.href} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-2xl font-semibold">{metrics.get(card.metric) ?? 0}</div>
              <div className="mt-1 text-sm text-gray-600">{card.label}</div>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Chuyển đổi khách mới trong tháng</h2><p className="mt-2 text-2xl font-semibold">{formatRate(cohortRate(won, created))}</p></article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Quay lại trong tháng</h2><p className="mt-2 text-2xl font-semibold">{formatRate(cohortRate(returned, opened))}</p></article>
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => (
          <Link key={card.metric} href={card.href} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <div className="text-2xl font-semibold">{metrics.get(card.metric) ?? 0}</div>
            <div className="mt-1 text-sm text-gray-600">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
