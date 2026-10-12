import type { ReactNode } from 'react'
import type { DB } from '../../finance/query'
import SubmitButton from '../../finance/_components/SubmitButton'
import { sendAuthorizedFixtureTest } from './authorized-test-actions'
export default async function AuthorizedFixtureTests({db,reminderId,context}:{db:DB;reminderId:string;context:ReactNode}) {
 const result=await db.rpc('authorized_zalo_fixture_test_view',{p_reminder:reminderId})
 const tests=(Array.isArray(result.data)?result.data:[]) as {id:string;template_id:string;state:string;expires_at:string}[]
 if(!tests.length) return null
 return <section className="space-y-3 rounded-xl border border-[var(--vibe-line)] bg-white p-4" aria-label="Đợt gửi Zalo kiểm thử">
  <h3 className="font-semibold text-[var(--vibe-navy)]">Đợt gửi kiểm thử được cho phép</h3>
  <p className="text-sm">Chỉ hồ sơ TEST-HP-HA-20261012, người nhận Hà Quốc An · số cuối 724. Mỗi mẫu gửi một lần trong đợt này. Lịch sử trước được giữ nguyên.</p>
  <p className="text-sm">Link PayOS mẫu đã hủy trước khi gửi; không thanh toán và không tạo công nợ thật.</p>
  <div className="flex flex-wrap gap-3">{tests.map(t=>{
   const ready=t.state==='AUTHORIZED' && Date.parse(t.expires_at)>Date.now()
   const label=t.template_id==='645192'?'Gửi mẫu nhắc học phí thử':'Gửi mẫu yêu cầu thanh toán thử'
   return <form action={sendAuthorizedFixtureTest} key={t.id}>{context}<input type="hidden" name="test_id" value={t.id}/><input type="hidden" name="reminder_id" value={reminderId}/><>{ready?<SubmitButton className="vibe-button vibe-button-primary" pendingLabel="Đang gửi">{label}</SubmitButton>:<button type="button" className="vibe-button" disabled>{t.template_id==='645192'?'Nhắc học phí: ':'Yêu cầu thanh toán: '}{t.state==='ACCEPTED'?'Đã tiếp nhận':t.state==='DELIVERED'?'Đã phát tới máy':t.state==='AUTHORIZED'?'Đợt thử hết hạn':t.state==='REJECTED'?'Zalo từ chối':'Đang đối soát lần thử'}</button>}</></form>
  })}</div>
 </section>
}
