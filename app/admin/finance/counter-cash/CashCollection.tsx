import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import SubmitButton from '../_components/SubmitButton'
import { recordCounterCash } from './actions'
import { uuidPattern } from '../operations'
import { money } from '../data'

type Props = {
  kind: 'REGISTRATION' | 'RENEWAL'; sourceId: string; total: number; paid: number; threshold: number;
  allowed: boolean; blocked: boolean; requiresDueDate?: boolean; today: string;
  reminderId?: string; requestId?: string; receiptId?: string; error?: string;
}

export default function CashCollection(p: Props) {
  const remaining = Math.max(0, p.total - p.paid)
  const minimum = Math.max(1, p.threshold - p.paid)
  const suggestedAmount = p.paid >= p.threshold ? remaining : Math.min(remaining, p.threshold - p.paid)
  return <section className="vibe-card grid gap-4 p-4" aria-label="Thu tiền mặt tại quầy">
    <h3 className="font-semibold text-[var(--vibe-navy)]">Thu tiền mặt tại quầy</h3>
    {p.error && <p role="alert" className="text-sm text-red-800">{p.error}</p>}
    {p.receiptId && uuidPattern.test(p.receiptId) && <p role="status" className="text-sm">Đã ghi nhận tiền mặt và cập nhật công nợ. <Link className="underline font-semibold" href={`/documents/finance/payments/${p.receiptId}`}>Xem / In phiếu thu</Link></p>}
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      <div><dt>Học phí đã chốt</dt><dd className="font-semibold">{money(p.total, 'VND')}</dd></div>
      <div><dt>Đã thu</dt><dd className="font-semibold">{money(p.paid, 'VND')}</dd></div>
      <div><dt>Còn phải thu</dt><dd className="font-semibold">{money(remaining, 'VND')}</dd></div>
    </dl>
    {!p.allowed ? <p className="text-sm">Tài khoản chưa có quyền thu tiền mặt cho hồ sơ này.</p>
      : p.blocked ? <p role="status" className="text-sm">Đang có đơn thanh toán online hoặc khoản tiền cần đối soát. Kiểm tra đơn trước khi nhận tiền mặt.</p>
      : remaining === 0 ? <p role="status" className="text-sm">Đã thu đủ học phí.</p>
      : <form action={recordCounterCash} className="grid max-w-xl gap-3">
        <input type="hidden" name="kind" value={p.kind} />
        <input type="hidden" name="source_id" value={p.sourceId} />
        <input type="hidden" name="request_id" value={p.requestId && uuidPattern.test(p.requestId) ? p.requestId : randomUUID()} />
        <input type="hidden" name="expected_paid" value={p.paid} />
        {p.reminderId && <input type="hidden" name="reminder_id" value={p.reminderId} />}
        <label className="vibe-field"><span>Số tiền thực nhận (VND)</span><input name="amount" type="number" inputMode="numeric" min={minimum} max={remaining} step="1" required defaultValue={suggestedAmount} /></label>
        {p.requiresDueDate && <label className="vibe-field"><span>Hạn thanh toán hết học phí</span><input name="due_on" type="date" min={p.today} required /><small>Chọn theo thỏa thuận với phụ huynh. Đây không phải ngày bắt đầu học.</small></label>}
        <label className="vibe-field"><span>Ghi chú phiếu thu</span><textarea name="note" maxLength={500} rows={2} /></label>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="cash_acknowledged" value="yes" required /><span>Tôi đã nhận đủ số tiền nhập ở trên bằng tiền mặt tại quầy.</span></label>
        <SubmitButton className="vibe-button vibe-button-primary" pendingLabel="Đang ghi nhận tiền mặt…">Xác nhận thu tiền mặt</SubmitButton>
        <p className="text-sm">Phiếu thu và công nợ được cập nhật cùng lúc. Khi mạng chậm, kiểm tra kết quả trước khi nhận hoặc ghi tiền thêm lần nữa.</p>
      </form>}
  </section>
}
