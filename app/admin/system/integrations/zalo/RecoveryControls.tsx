'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import type { RecoveryView } from '@/lib/integrations/zalo/registration-recovery'
import { zaloRecoveryMessage } from '@/lib/integrations/zalo/recovery-labels'
import { recoverNotificationAction } from './recovery-actions'
export function RecoveryControls({ initial }: { initial: RecoveryView }) {
  const [view, action, pending] = useActionState(recoverNotificationAction, initial)
  const eligible = view.state === 'SEND' || view.state === 'RETRY'
  const protectedState = view.state === 'ACCEPTED' || view.state === 'UNCERTAIN'
  return <div className="mt-4 grid gap-3" aria-busy={pending}>
    <div className="text-sm" aria-live="polite">
      <p>Số đã đồng ý: {view.consentedPhone ?? 'Chưa ghi nhận'} · Số gắn với thông báo: {view.snapshotPhone ?? 'Chưa cập nhật'}.</p>
      <p>{view.state === 'DELIVERED' ? 'Đã có xác nhận phát tin.' : zaloRecoveryMessage(view.reason)}</p>
      {view.connectionReason && view.connectionReason !== view.reason && <p>{zaloRecoveryMessage(view.connectionReason)}</p>}
      {view.outcome && <p>Kết quả thao tác: {zaloRecoveryMessage(view.outcome)}</p>}
      <p>Số lần thử gửi: {view.attempts}/5. Kiểm tra điều kiện không gửi tin.</p>
    </div>
    {view.state !== 'DELIVERED' && <form action={action} className="vibe-actions">
      <input type="hidden" name="job_id" value={view.jobId} />
      <input type="hidden" name="expected_attempts" value={view.attempts} />
      {!protectedState && <button className="vibe-button vibe-button-primary" name="operation" value="SEND" disabled={pending || !eligible}>{pending ? 'Đang xử lý…' : view.state === 'RETRY' ? 'Gửi lại thông báo' : 'Gửi thông báo'}</button>}
      <button className="vibe-button" name="operation" value="CHECK" disabled={pending}>{pending ? 'Đang xử lý…' : protectedState ? 'Kiểm tra trạng thái' : 'Kiểm tra lại điều kiện'}</button>
    </form>}
    {protectedState && <p className="text-sm text-[var(--vibe-muted)]">Kiểm tra bằng chứng đã lưu và webhook; không tự gửi lại khi chưa rõ kết quả.</p>}
    {view.connectionReason && <Link className="text-sm underline" href="/admin/system/integrations/zalo">Kiểm tra kết nối OA dùng chung</Link>}
    {!!view.history?.length && <details className="text-sm"><summary>Lịch sử các lần thử gửi</summary>{view.history.map(item => <p key={item.number}>Lần {item.number}: {item.state} · HTTP {item.http ?? 'chưa ghi nhận'} · Mã Zalo {item.providerError ?? 'chưa ghi nhận'}</p>)}</details>}
  </div>
}
