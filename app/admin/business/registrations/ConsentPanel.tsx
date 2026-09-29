import { InlineNotice, SectionCard } from '@/app/admin/_components/vibe'
import { recordRegistrationZaloPhoneConsent } from './actions'

export type ConsentEntry = { id: string; phone: string; at: string; actor: string | null; source: string; method: string | null; consenter: string | null; revokedAt: string | null; revokedBy: string | null }
const methods: Record<string, string> = { IN_PERSON: 'Trao đổi trực tiếp', PHONE: 'Cuộc gọi', WRITTEN: 'Văn bản / tin nhắn' }
const consenters: Record<string, string> = { STUDENT: 'Học viên', PARENT: 'Phụ huynh' }
const time = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

export function ConsentPanel({ applicationId, allowed, error, history }: { applicationId: string; allowed: boolean; error: boolean; history: ConsentEntry[] }) {
  const active = history.find(item => !item.revokedAt)
  return <SectionCard title="Zalo qua số điện thoại">
    <p className="text-sm">Chỉ gửi khi hồ sơ hoàn tất, khoản thu được xác thực và có đồng ý hợp lệ cho đúng số nhận tin. Lưu đồng ý sẽ kiểm tra lại điều kiện, chưa gửi tin.</p>
    {!allowed ? <InlineNotice tone="info">Chỉ quản trị hệ thống có quyền ghi nhận hoặc rút đồng ý nhận Zalo.</InlineNotice> : error ? <InlineNotice tone="error">Không tải được thông tin đồng ý. Hãy tải lại trang trước khi thao tác.</InlineNotice> : <>
      <InlineNotice tone="info">{active ? `Đã ghi nhận cho ${active.phone}.` : 'Chưa có đồng ý còn hiệu lực. Chỉ ghi nhận sau khi phụ huynh xác nhận.'}</InlineNotice>
      <form action={recordRegistrationZaloPhoneConsent} className="mt-3 grid gap-3">
        <input type="hidden" name="application_id" value={applicationId} />
        <input type="hidden" name="expected_consent" value={active?.id ?? ''} />
        <input type="hidden" name="operation" value="RECORD" />
        <label className="vibe-field"><span>Số điện thoại nhận thông báo</span><input name="phone" inputMode="tel" autoComplete="off" required placeholder="Nhập đúng số phụ huynh đã đồng ý" /></label>
        <label className="vibe-field"><span>Nguồn xác nhận</span><select name="consent_method" required defaultValue=""><option value="" disabled>Chọn nguồn xác nhận thực tế</option><option value="IN_PERSON">Trao đổi trực tiếp</option><option value="PHONE">Cuộc gọi với phụ huynh</option><option value="WRITTEN">Văn bản / tin nhắn của phụ huynh</option></select></label>
        <label className="flex items-start gap-2 text-sm"><input name="phone_consent" type="checkbox" value="yes" required />Tôi xác nhận phụ huynh đã đồng ý nhận thông báo giao dịch Zalo qua đúng số này (zbs-phone-v1).</label>
        <button className="vibe-button" type="submit">{active ? 'Ghi nhận đồng ý cho số đã nhập' : 'Ghi nhận đồng ý'}</button>
      </form>
      {active && <form action={recordRegistrationZaloPhoneConsent} className="mt-4 grid gap-3">
        <input type="hidden" name="application_id" value={applicationId} />
        <input type="hidden" name="expected_consent" value={active.id} />
        <input type="hidden" name="operation" value="REVOKE" />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="phone_consent" value="yes" required />Phụ huynh yêu cầu rút đồng ý cho {active.phone}. Tin đã chuyển tới Zalo không thể thu hồi bằng thao tác này.</label>
        <button className="vibe-button" type="submit">Ghi nhận rút đồng ý</button>
      </form>}
      {!!history.length && <details className="mt-4 text-sm"><summary>Lịch sử đồng ý và rút đồng ý</summary><ul className="mt-2 grid gap-2">{history.map(item => <li key={item.id}>{item.phone} · {time(item.at)} · Người đồng ý: {consenters[item.consenter ?? ''] ?? 'Chưa ghi'} · Người ghi nhận: {item.actor ?? 'Chưa ghi nhận'} · {item.source === 'REGISTRATION_FORM' ? 'Đăng ký tại quầy' : 'Tại hồ sơ'} · {methods[item.method ?? ''] ?? 'Chưa ghi nguồn xác nhận'}{item.revokedAt && <p>Hết hiệu lực: {time(item.revokedAt)} · Người ghi nhận: {item.revokedBy ?? 'Chưa ghi nhận'}</p>}</li>)}</ul></details>}
    </>}
  </SectionCard>
}
