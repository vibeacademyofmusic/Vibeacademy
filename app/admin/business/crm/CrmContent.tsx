import Link from 'next/link'

import { DataTable, EmptyState, FilterBar, FormField, InlineNotice, MetricCard, SectionCard, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { createCrmLead } from './actions'
import { crmDirectory, loadLeadPage, type LeadFilters, type RegistrationSummary } from './data'
import { interestLevelLabel, followUpState, journeyLabel, openRegistrationStatuses, sourceLabel, statusLabel, statusTone, tabs } from './model'

function hrefFor(filters: LeadFilters, patch: LeadFilters) {
  const params = new URLSearchParams({ workspace: 'crm' })
  const next = { ...filters, page: undefined, error: undefined, success: undefined, ...patch }
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value)
  const query = params.toString()
  return query ? `/admin/business/registrations?${query}` : '/admin/business/registrations?workspace=crm'
}

function registrationFor(rows: RegistrationSummary[], leadId: string) {
  return rows.find(row => row.crm_lead_id === leadId && row.linked_student_id)
    ?? rows.find(row => row.crm_lead_id === leadId && openRegistrationStatuses.includes(row.status))
    ?? rows.find(row => row.crm_lead_id === leadId)
}

export async function CrmLeadContent({ searchParams }: { searchParams: Promise<LeadFilters & { error?: string; success?: string }> }) {
  const filters = await searchParams
  const [directory, list] = await Promise.all([crmDirectory(), loadLeadPage(filters)])
  const branchName = new Map(directory.branches.map(branch => [branch.id, branch.name]))
  const ownerName = new Map(directory.owners.map(owner => [owner.id, owner.full_name]))
  const activeTab = filters.tab || 'all'

  return (
    <div className="space-y-6" aria-label="CRM & Tuyển sinh">
      {filters.error && <InlineNotice tone="error">{filters.error}</InlineNotice>}
      {filters.success && <InlineNotice>{filters.success}</InlineNotice>}
      {directory.directoryError && <InlineNotice tone="error">Không tải được dữ liệu CRM.</InlineNotice>}
      <div className="vibe-metrics">
        {directory.metrics.map(item => <MetricCard key={item.id} title={item.title} value={item.value} />)}
      </div>
      <FilterBar>
        {directory.queue.map(item => (
          <Link key={item.id} href={hrefFor(filters, { queue: item.id, tab: undefined, page: undefined })} className="vibe-button">
            {item.label} · {item.value}
          </Link>
        ))}
      </FilterBar>
      <nav className="vibe-tabs" aria-label="Hành trình khách hàng">
        {tabs.map(tab => (
          <Link key={tab.id} href={hrefFor(filters, { tab: tab.id === 'all' ? undefined : tab.id, queue: undefined })} aria-selected={activeTab === tab.id}>{tab.label}</Link>
        ))}
      </nav>
      <form className="vibe-filter" method="get">
        <input type="hidden" name="workspace" value="crm" />
        {filters.tab && <input type="hidden" name="tab" value={filters.tab} />}
        <FormField label="Tìm kiếm" name="q" defaultValue={filters.q} placeholder="Tên hoặc số điện thoại" maxLength={80} />
        <SelectField label="Giai đoạn" name="status" defaultValue={filters.status || ''}><option value="">Mọi giai đoạn</option>{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</SelectField>
        <SelectField label="Chi nhánh" name="branch" defaultValue={filters.branch || ''}><option value="">Mọi chi nhánh được phép</option>{directory.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
        <SelectField label="Người phụ trách" name="owner" defaultValue={filters.owner || ''}><option value="">Mọi người phụ trách</option>{directory.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name || 'Chưa có tên'}</option>)}</SelectField>
        <SelectField label="Nguồn" name="source" defaultValue={filters.source || ''}><option value="">Mọi nguồn</option>{Object.entries(sourceLabel).map(([source, label]) => <option key={source} value={source}>{label}</option>)}</SelectField>
        <SelectField label="Mức độ quan tâm" name="interest_level" defaultValue={filters.interest_level || ''}><option value="">Tất cả</option>{Object.entries(interestLevelLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        <FormField label="Bộ môn / nhạc cụ" name="interest" defaultValue={filters.interest} maxLength={80} />
        <SelectField label="Follow-up" name="follow" defaultValue={filters.follow || ''}><option value="">Mọi lịch hẹn</option><option value="today">Hôm nay</option><option value="overdue">Quá hạn</option><option value="scheduled">Đã hẹn</option><option value="none">Chưa hẹn</option></SelectField>
        <button className="vibe-button vibe-button-primary">Lọc</button>
      </form>
      {list.error ? <InlineNotice tone="error">Không tải được dữ liệu CRM.</InlineNotice> : list.rows.length === 0 ? <EmptyState>Không có khách hàng phù hợp bộ lọc.</EmptyState> : (
        <DataTable
          headers={['Khách hàng', 'Nhu cầu học', 'Chi nhánh', 'Nguồn', 'Phụ trách', 'Việc tiếp theo', 'Hạn follow-up', 'Giai đoạn', 'Quan tâm', 'Thao tác']}
          rows={list.rows.map(row => {
            const registration = registrationFor(list.registrations, row.id)
            const converted = Boolean(row.converted_student_id || registration?.linked_student_id)
            const registering = Boolean(registration && openRegistrationStatuses.includes(registration.status))
            const learner = row.student_name || 'Chưa ghi học viên'
            const contact = row.parent_name || row.full_name || 'Chưa có tên'
            return [
              <Link key="name" href={`/admin/business/crm/${row.id}`} className="font-semibold">{contact}<br /><span className="font-normal text-gray-500">{learner}</span></Link>,
              [row.program_interest, row.instrument_interest].filter(Boolean).join(' / ') || '—',
              branchName.get(row.branch_id) || '—',
              sourceLabel[row.source_type] || row.source_type,
              row.owner_user_id ? ownerName.get(row.owner_user_id) || 'Đã gán' : 'Chưa gán',
              followUpState(row.next_follow_up_on, list.today),
              row.next_follow_up_on || '—',
              <StatusBadge key="stage" tone={statusTone(row.status, converted)}>{journeyLabel(row.status, converted, registering)}</StatusBadge>,
              interestLevelLabel[row.interest_level] || 'Tham khảo',
              <Link key="open" href={`/admin/business/crm/${row.id}`}>Mở</Link>,
            ]
          })}
        />
      )}
      {!list.error && list.count != null && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{list.count} khách hàng</span>
          <span>
            {list.page > 1 && <Link href={hrefFor(filters, { page: String(list.page - 1) })} className="mr-4">Trước</Link>}
            {list.count > list.page * 25 && <Link href={hrefFor(filters, { page: String(list.page + 1) })}>Sau</Link>}
          </span>
        </div>
      )}
      <SectionCard title="Thêm khách hàng">
        <form action={createCrmLead} className="vibe-filter">
          <SelectField label="Chi nhánh" name="branch_id" required>{directory.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
          <FormField label="Người liên hệ" name="full_name" maxLength={200} />
          <FormField label="Phụ huynh" name="parent_name" maxLength={200} />
          <FormField label="Học viên dự kiến" name="student_name" maxLength={200} />
          <FormField label="Ngày sinh học viên" name="student_date_of_birth" type="date" />
          <FormField label="Số điện thoại" name="phone" maxLength={40} />
          <FormField label="Email" name="email" type="email" maxLength={200} />
          <FormField label="Bộ môn" name="program_interest" maxLength={200} />
          <FormField label="Nhạc cụ" name="instrument_interest" maxLength={200} />
          <SelectField label="Nguồn" name="source_type" defaultValue="MANUAL">{Object.entries(sourceLabel).map(([source, label]) => <option key={source} value={source}>{label}</option>)}</SelectField>
          <SelectField label="Mức độ quan tâm" name="interest_level" defaultValue="REFERENCE">{Object.entries(interestLevelLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <button className="vibe-button vibe-button-primary">Tạo khách hàng</button>
        </form>
      </SectionCard>
    </div>
  )
}
