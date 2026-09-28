import { readZaloConnectionView } from '@/lib/integrations/zalo/service'
import { RegistrationRecovery } from './RegistrationRecovery'
import {
  entityLabel,
  eventStatusLabel,
  eventTypeLabel,
  formatAdminTime,
  linkStatusLabel,
  maskOperationalText,
  processingLabel,
  readZaloAdminConfig,
} from '@/lib/integrations/zalo/admin'
import { zaloTemplateIsSendable } from '@/lib/integrations/zalo/outbound'

import { requireIntegrationAdmin } from '../access'
import { ZaloIntegrationView, type ZaloCustomerRow, type ZaloEventRow, type ZaloTemplateRow } from './view'

type Overview = {
  total_events: number
  events_today: number
  accepted_events: number
  pending_events: number
  failed_events: number
}

type EventRecord = {
  id: string
  received_at: string
  event_type: string
  external_event_id: string | null
  status: string
  processing_state: string
  processing_error: string | null
}

type CustomerRecord = {
  link_id: string
  entity_type: string
  display_label: string | null
  branch_name: string | null
  linked_at: string | null
  last_verified_at: string | null
  link_status: string
}

type TemplateRecord = {
  template_key: string
  provider: string
  provider_template_id: string | null
  status: string
  enabled: boolean
  payload_schema: Record<string, unknown> | null
}

function first<T>(data: T[] | T | null) {
  if (!data) return null
  return Array.isArray(data) ? data[0] ?? null : data
}

export default async function ZaloIntegrationPage({ searchParams }: { searchParams: Promise<{ result?: string; job?: string }> }) {
  const db = await requireIntegrationAdmin()
  const [overview, events, customers, templates, connection] = await Promise.all([
    db.rpc('zalo_integration_overview'),
    db.rpc('zalo_recent_events', { p_limit: 20 }),
    db.rpc('zalo_linked_customers'),
    db.from('notification_templates').select('template_key,provider,provider_template_id,status,enabled,payload_schema').eq('provider', 'ZALO').order('template_key'),
    readZaloConnectionView(),
  ])
  const counts = first(overview.data as Overview[] | Overview | null)
  const summary = {
    total: Number(counts?.total_events ?? 0),
    today: Number(counts?.events_today ?? 0),
    accepted: Number(counts?.accepted_events ?? 0),
    pending: Number(counts?.pending_events ?? 0),
    failed: Number(counts?.failed_events ?? 0),
  }
  const eventRows: ZaloEventRow[] = ((events.data ?? []) as EventRecord[]).map(event => ({
    id: event.id,
    time: formatAdminTime(event.received_at),
    type: eventTypeLabel(event.event_type),
    externalId: event.external_event_id || '—',
    status: eventStatusLabel(event.status),
    processing: processingLabel(event.processing_state),
    source: 'Webhook Zalo',
    error: maskOperationalText(event.processing_error),
  }))
  const customerRows: ZaloCustomerRow[] = ((customers.data ?? []) as CustomerRecord[]).map(customer => ({
    id: customer.link_id,
    entity: entityLabel(customer.entity_type),
    label: customer.display_label || '—',
    branch: customer.branch_name || '—',
    linkedAt: formatAdminTime(customer.linked_at),
    verifiedAt: formatAdminTime(customer.last_verified_at),
    status: linkStatusLabel(customer.link_status),
  }))
  const templateRows: ZaloTemplateRow[] = ((templates.data ?? []) as TemplateRecord[]).map(template => ({
    key: template.template_key,
    provider: template.provider,
    templateId: template.provider_template_id || 'Chưa có',
    status: template.status,
    enabled: template.enabled ? 'Yes' : 'No',
    payloadReady: template.payload_schema && Object.keys(template.payload_schema).length > 0
      ? (zaloTemplateIsSendable(template) ? 'Sẵn sàng gửi' : 'Schema có, gửi đang tắt')
      : 'Thiếu schema',
  }))

  return (
    <>
    <RegistrationRecovery searchParams={searchParams} />
    <ZaloIntegrationView
      config={{ ...readZaloAdminConfig(process.env, summary.total), accessTokenConfigured: connection.accessPresent, refreshTokenConfigured: connection.refreshPresent }}
      summary={summary}
      events={eventRows}
      customers={customerRows}
      templates={templateRows}
      loadError={Boolean(overview.error || events.error || customers.error || templates.error)}
    />
    </>
  )
}
