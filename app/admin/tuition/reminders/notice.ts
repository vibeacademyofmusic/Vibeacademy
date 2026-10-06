import { rows, type DB } from '../../finance/query'
import { uuidPattern, vietnamDateTime } from '../../finance/operations'
import {
  evaluateTuitionNotice,
  tuitionReminderTemplateId,
  zaloAttemptLabel,
  type NoticeRecipient,
  type TuitionNotice,
  TUITION_PROVIDER_TEMPLATE_ID,
} from '@/lib/integrations/zalo/tuition-notice'
import { zaloPilotOutboundBlocked } from '@/lib/integrations/zalo/pilot-outbound'
import { tuitionNoticeReplyLabel, tuitionSendLabel } from '@/lib/integrations/zalo/tuition-reply'

export type TuitionNoticeConsent = {
  parentId: string
  scope: string
  grantedAt: string
  source: string | null
  recordedBy: string | null
}

export type TuitionNoticeView = TuitionNotice & {
  reminderId: string
  studentId: string
  studentName: string
  studentCode: string
  branchName: string
  consentRecord: TuitionNoticeConsent | null
  periodStart: string
  periodEnd: string
  eventCode: string | null
  templateId: string | null
  maskedPhone: string
  attemptLabel: string
  replyLabel: string
  replyAt: string | null
  needsReview: boolean
  replyChoice: string | null
  contactNote: string | null
  contactNotedAt: string | null
  contactNotedBy: string | null
  replies: { id: string; choice: string; buttonData: string; submitTime: string; receivedAt: string; trackingId: string; source: string }[]
  sends: { id: string; trackingId: string; sendStatus: string; sentAt: string | null; messageId: string | null; templateId: string | null }[]
}

type ReminderRow = {
  id: string
  status: string
  event_code: string | null
  window_start: string
  window_end: string
  starts_on: string
  effective_ends_on: string
  branch_name_snapshot: string
  enrollment_tuition_id: string
  amount: number | string | null
  currency: string
  full_name: string
  student_code: string
  student_id: string
}

export async function loadTuitionNotice(db: DB, reminderId: string, selectedRecipientId?: string | null, sync: 'healthy' | 'failing' = 'healthy'): Promise<TuitionNoticeView | null> {
  if (!uuidPattern.test(reminderId)) return null
  const reminder = (await rows(db.from('tuition_reminder_operations').select('id,status,event_code,window_start,window_end,starts_on,effective_ends_on,branch_name_snapshot,enrollment_tuition_id,amount,currency,full_name,student_code,student_id').eq('id', reminderId).limit(1).returns<ReminderRow[]>()))[0]
  if (!reminder) return null
  const links = await rows(db.from('student_parents').select('parent_id,is_primary,can_view_finance,is_active,valid_from,valid_until').eq('student_id', reminder.student_id).returns<{ parent_id: string; is_primary: boolean; can_view_finance: boolean; is_active: boolean; valid_from: string | null; valid_until: string | null }[]>())
  const now = Date.now()
  const current = links.filter(link => link.is_active && (!link.valid_from || Date.parse(link.valid_from) <= now) && (!link.valid_until || Date.parse(link.valid_until) > now))
  const parentIds = current.map(link => link.parent_id)
  const parents = parentIds.length ? await rows(db.from('parents').select('id,parent_code,status,user_id').in('id', parentIds).returns<{ id: string; parent_code: string | null; status: string; user_id: string | null }[]>()) : []
  const profileIds = parents.map(parent => parent.user_id).filter((id): id is string => Boolean(id))
  const profiles = profileIds.length ? await rows(db.from('profiles').select('id,full_name,phone,status').in('id', profileIds).returns<{ id: string; full_name: string | null; phone: string | null; status: string }[]>()) : []
  const template = (await rows(db.from('notification_templates').select('status,enabled,provider_template_id').eq('template_key', 'ZALO_TUITION_REMINDER').limit(1).returns<{ status: string; enabled: boolean; provider_template_id: string | null }[]>()))[0]
  const consent = parentIds.length ? await rows(db.from('tuition_zalo_consents').select('parent_id,revoked_at,granted_at,consent_scope,source,recorded_by').eq('student_id', reminder.student_id).in('parent_id', parentIds).returns<{ parent_id: string; revoked_at: string | null; granted_at: string; consent_scope: string; source: string | null; recorded_by: string | null }[]>()) : []
  const recorderIds = consent.map(item => item.recorded_by).filter((id): id is string => Boolean(id))
  const recorders = recorderIds.length ? await rows(db.from('profiles').select('id,full_name').in('id', recorderIds).returns<{ id: string; full_name: string | null }[]>()) : []
  const attempts = await rows(db.from('notification_jobs').select('status,created_at').eq('entity_type', 'TUITION_REMINDER').eq('entity_id', reminder.id).eq('template_key', 'ZALO_TUITION_REMINDER').order('created_at', { ascending: false }).limit(1).returns<{ status: string; created_at: string }[]>())
  const replyState = (await rows(db.from('tuition_zalo_reply_states').select('reply_choice,submit_time,needs_review,contact_note,contact_noted_at,contact_noted_by').eq('reminder_id', reminder.id).limit(1).returns<{ reply_choice: string; submit_time: string; needs_review: boolean; contact_note: string | null; contact_noted_at: string | null; contact_noted_by: string | null }[]>()))[0]
  const contactAuthor = replyState?.contact_noted_by ? (await rows(db.from('profiles').select('id,full_name').eq('id', replyState.contact_noted_by).limit(1).returns<{ id: string; full_name: string | null }[]>()))[0] : null
  const replyRows = await rows(db.from('tuition_zalo_replies').select('id,reply_choice,button_data,submit_time,received_at,tracking_id,source').eq('reminder_id', reminder.id).order('submit_time', { ascending: false }).order('received_at', { ascending: false }).order('seq', { ascending: false }).limit(20).returns<{ id: string; reply_choice: string; button_data: string; submit_time: string; received_at: string; tracking_id: string; source: string }[]>())
  const sendRows = await rows(db.from('tuition_zalo_sends').select('id,tracking_id,send_status,sent_at,provider_message_id,provider_template_id').eq('reminder_id', reminder.id).order('created_at', { ascending: false }).limit(8).returns<{ id: string; tracking_id: string; send_status: string; sent_at: string | null; provider_message_id: string | null; provider_template_id: string | null }[]>())
  const packageAmount = reminder.amount == null ? null : Number(reminder.amount)
  const recipients: NoticeRecipient[] = current.map(link => {
    const parent = parents.find(row => row.id === link.parent_id)
    const profile = profiles.find(row => row.id === parent?.user_id && row.status === 'ACTIVE')
    return {
      id: link.parent_id,
      name: profile?.full_name || parent?.parent_code || 'Phụ huynh',
      phone: profile?.phone ?? null,
      canViewFinance: link.can_view_finance === true && parent?.status === 'ACTIVE',
      isPrimary: link.is_primary === true,
      active: true,
    }
  })
  const notice = evaluateTuitionNotice({
    reminderStatus: reminder.status,
    eventCode: reminder.event_code,
    windowStart: reminder.window_start,
    windowEnd: reminder.window_end,
    today: vietnamDateTime().slice(0, 10),
    periodStart: reminder.starts_on,
    periodEnd: reminder.effective_ends_on,
    studentName: reminder.full_name,
    studentCode: reminder.student_code,
    branchName: reminder.branch_name_snapshot,
    packageAmount: Number.isFinite(packageAmount) ? packageAmount : null,
    currency: reminder.currency,
    recipients,
    selectedRecipientId,
    consentParentIds: consent.filter(item => !item.revoked_at).map(item => item.parent_id),
    templateReady: tuitionReminderTemplateId(template) !== null,
    scheduledDispatchEnabled: false,
    manualSendEnabled: template?.enabled === true && template.provider_template_id === TUITION_PROVIDER_TEMPLATE_ID && !zaloPilotOutboundBlocked(),
  })
  const activeTemplateId = tuitionReminderTemplateId(template)
  const currentTemplateSend = activeTemplateId ? sendRows.find(row => row.provider_template_id === activeTemplateId) ?? null : null
  const legacyOnlyHistory = sendRows.length > 0 && currentTemplateSend == null
  const phone = notice.recipient?.phone ?? null
  const activeConsent = notice.recipient
    ? consent.find(item => item.parent_id === notice.recipient?.id && !item.revoked_at) ?? null
    : null
  return {
    ...notice,
    reminderId: reminder.id,
    studentId: reminder.student_id,
    studentName: reminder.full_name,
    studentCode: reminder.student_code,
    branchName: reminder.branch_name_snapshot,
    periodStart: reminder.starts_on,
    periodEnd: reminder.effective_ends_on,
    eventCode: reminder.event_code,
    templateId: tuitionReminderTemplateId(template),
    maskedPhone: phone ? phone.replace(/\d(?=\d{3})/g, '•') : 'Chưa có số điện thoại',
    consentRecord: activeConsent ? {
      parentId: activeConsent.parent_id,
      scope: activeConsent.consent_scope,
      grantedAt: activeConsent.granted_at,
      source: activeConsent.source,
      recordedBy: recorders.find(row => row.id === activeConsent.recorded_by)?.full_name ?? null,
    } : null,
    attemptLabel: currentTemplateSend ? tuitionSendLabel(currentTemplateSend.send_status) : legacyOnlyHistory ? 'Chưa gửi' : zaloAttemptLabel(attempts[0]?.status),
    replyLabel: tuitionNoticeReplyLabel(sendRows.find(row => row.send_status === 'SENT' || row.send_status === 'DELIVERED')?.send_status ?? sendRows[0]?.send_status, replyState?.reply_choice, sync),
    replyAt: replyState?.submit_time ?? null,
    needsReview: replyState?.needs_review === true,
    replyChoice: replyState?.reply_choice ?? null,
    contactNote: replyState?.contact_note ?? null,
    contactNotedAt: replyState?.contact_noted_at ?? null,
    contactNotedBy: contactAuthor?.full_name ?? null,
    replies: replyRows.map(row => ({
      id: row.id,
      choice: row.reply_choice,
      buttonData: row.button_data,
      submitTime: row.submit_time,
      receivedAt: row.received_at,
      trackingId: row.tracking_id,
      source: row.source,
    })),
    sends: sendRows.map(row => ({
      id: row.id,
      trackingId: row.tracking_id,
      sendStatus: tuitionSendLabel(row.send_status),
      sentAt: row.sent_at,
      messageId: row.provider_message_id,
      templateId: row.provider_template_id,
    })),
  }
}
