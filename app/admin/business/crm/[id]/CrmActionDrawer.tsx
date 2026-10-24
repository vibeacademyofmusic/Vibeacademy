'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Drawer, FormField, SelectField } from '@/app/admin/_components/vibe'
import { assignCrmLead, attributeCrmLead, followUpCrmLead, noteCrmLead, reviewCrmLead, setCrmLeadInterest, transitionCrmLead } from '../actions'
import { contactChannels, interestLevelLabel } from '../model'
import styles from './drawer.module.css'

type Step = { status: string; label: string }
type Person = { id: string; full_name: string | null }
type Campaign = { id: string; name: string }
type Candidate = { student_id: string; full_name: string | null; student_code: string }
type Action = 'menu' | 'contact' | 'schedule' | 'lost' | 'interest' | 'campaign' | 'owner' | 'review' | `step:${string}`

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus()
  return <button className="vibe-button vibe-button-primary" disabled={pending}>{pending ? 'Đang lưu…' : children}</button>
}

export function CrmActionDrawer({
  leadId, version, status, steps, interestLevel, campaignId, ownerId, parentId, linkedStudentId, owners, campaigns, candidates,
}: {
  leadId: string; version: number; status: string; steps: Step[]; interestLevel: string; campaignId: string | null
  ownerId: string | null; parentId: string | null; linkedStudentId: string | null
  owners: Person[]; campaigns: Campaign[]; candidates: Candidate[]
}) {
  const [active, setActive] = useState<Action | null>(null)
  const [request, setRequest] = useState('')
  const open = (action: Action) => { setRequest(crypto.randomUUID()); setActive(action) }
  const close = () => setActive(null)
  const common = <><input type="hidden" name="lead_id" value={leadId} /><input type="hidden" name="version" value={version} /><input type="hidden" name="request" value={request} /></>
  const channel = <SelectField label="Kênh" name="channel"><option value="">Không ghi kênh</option>{contactChannels.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField>
  const step = active?.startsWith('step:') ? steps.find(item => item.status === active.slice(5)) : null
  const titles: Record<string, string> = {
    contact: 'Ghi nhận liên hệ', schedule: 'Hẹn lịch chăm sóc', lost: 'Không tiếp tục', interest: 'Đổi mức độ quan tâm',
    campaign: 'Gắn chiến dịch', owner: 'Giao người phụ trách', review: 'Xem xét chuyển đổi',
  }

  return <>
    <div className="vibe-actions">
      <button type="button" className="vibe-button vibe-button-primary" onClick={() => open(status === 'NEW' ? 'contact' : 'schedule')}>
        {status === 'NEW' ? 'Ghi nhận liên hệ' : 'Hẹn lịch chăm sóc'}
      </button>
      <button type="button" className="vibe-button" onClick={() => open('schedule')}>Lịch chăm sóc</button>
      <button type="button" className="vibe-button" onClick={() => open('menu')}>Thao tác khác</button>
    </div>
    <Drawer open={active !== null} onClose={close} title={step?.label || titles[active || ''] || 'Thao tác hồ sơ'} subtitle="Chọn một thao tác và lưu để cập nhật hồ sơ.">
      <div className={styles.actions} aria-label="Chọn thao tác">
        <button type="button" className="vibe-button" aria-pressed={active === 'contact'} onClick={() => open('contact')}>Ghi nhận liên hệ</button>
        <button type="button" className="vibe-button" aria-pressed={active === 'schedule'} onClick={() => open('schedule')}>Hẹn chăm sóc</button>
        {steps.some(item => item.status === 'LOST') && <button type="button" className="vibe-button" aria-pressed={active === 'lost'} onClick={() => open('lost')}>Không tiếp tục</button>}
        <button type="button" className="vibe-button" aria-pressed={active === 'interest'} onClick={() => open('interest')}>Đổi mức độ quan tâm</button>
        <button type="button" className="vibe-button" aria-pressed={active === 'campaign'} onClick={() => open('campaign')}>Gắn chiến dịch</button>
        <button type="button" className="vibe-button" aria-pressed={active === 'owner'} onClick={() => open('owner')}>Người phụ trách</button>
        {status === 'WON' && <button type="button" className="vibe-button" aria-pressed={active === 'review'} onClick={() => open('review')}>Xem xét chuyển đổi</button>}
        {steps.filter(item => item.status !== 'LOST' && item.status !== 'CONTACTED').map(item => <button type="button" key={item.status} className="vibe-button" aria-pressed={active === `step:${item.status}`} onClick={() => open(`step:${item.status}`)}>{item.label}</button>)}
      </div>
      {active === 'contact' && <form action={steps.some(item => item.status === 'CONTACTED') ? transitionCrmLead : noteCrmLead} className={styles.form}>
        {common}{steps.some(item => item.status === 'CONTACTED') && <input type="hidden" name="to_status" value="CONTACTED" />}
        {channel}<FormField label="Nội dung liên hệ" name="note" required maxLength={4000} /><Submit>Ghi nhận liên hệ</Submit>
      </form>}
      {(active === 'lost' || step) && <form action={transitionCrmLead} className={styles.form}>
        {common}<input type="hidden" name="to_status" value={active === 'lost' ? 'LOST' : step?.status} />
        {channel}<FormField label={active === 'lost' ? 'Lý do không tiếp tục' : 'Ghi chú'} name="note" required={active === 'lost'} maxLength={4000} />
        <Submit>{active === 'lost' ? 'Xác nhận không tiếp tục' : step?.label || 'Cập nhật'}</Submit>
      </form>}
      {active === 'schedule' && <form action={followUpCrmLead} className={styles.form}>
        {common}<FormField label="Ngày chăm sóc" name="follow_up_on" type="date" required /><FormField label="Việc cần làm" name="note" maxLength={4000} placeholder="Gọi phụ huynh, gửi thông tin, hẹn học thử" />{channel}<Submit>Lưu lịch chăm sóc</Submit>
      </form>}
      {active === 'interest' && <form action={setCrmLeadInterest} className={styles.form}>
        {common}<SelectField label="Mức độ quan tâm" name="interest_level" defaultValue={interestLevel}>{Object.entries(interestLevelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><Submit>Cập nhật mức độ quan tâm</Submit>
      </form>}
      {active === 'campaign' && <form action={attributeCrmLead} className={styles.form}>
        {common}<SelectField label="Chiến dịch" name="campaign_id" defaultValue={campaignId || ''}><option value="">Chưa gắn chiến dịch</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField><FormField label="Mã tham chiếu" name="campaign_reference" maxLength={200} /><Submit>Lưu chiến dịch</Submit>
      </form>}
      {active === 'owner' && <form action={assignCrmLead} className={styles.form}>
        {common}<SelectField label="Người phụ trách" name="owner_user_id" defaultValue={ownerId || ''} required><option value="">Chọn người phụ trách</option>{owners.map(item => <option key={item.id} value={item.id}>{item.full_name || 'Chưa có tên'}</option>)}</SelectField><FormField label="Lý do giao việc" name="reason" required maxLength={4000} /><Submit>Giao người phụ trách</Submit>
      </form>}
      {active === 'review' && <form action={reviewCrmLead} className={styles.form}>
        {common}<SelectField label="Quyết định" name="decision" defaultValue="LINKED"><option value="PENDING">Cần xem xét</option><option value="LINKED">Gắn học viên đã có</option><option value="BLOCKED">Chưa đủ dữ liệu</option></SelectField>
        <SelectField label="Học viên đã có" name="student_id" defaultValue={linkedStudentId || ''}><option value="">Chưa chọn</option>{candidates.map(item => <option key={item.student_id} value={item.student_id}>{item.full_name} · {item.student_code}</option>)}</SelectField>
        <FormField label="Mã phụ huynh đã có" name="parent_id" defaultValue={parentId || ''} /><FormField label="Ghi chú xem xét" name="note" maxLength={4000} /><Submit>Ghi nhận xem xét</Submit>
      </form>}
    </Drawer>
  </>
}
