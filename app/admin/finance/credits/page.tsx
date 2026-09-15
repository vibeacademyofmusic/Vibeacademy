import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { creditData } from './data'
import { applyCredit, refundCredit } from './actions'
import { studentNames } from '../query'
import { money } from '../data'
import { vietnamDateTime, type Params } from '../operations'
import { Panel, Table, Pager, Field, Select, Confirm, LoadError, Notice, timeText } from '../_components/ui'
import SubmitButton from '../_components/SubmitButton'
export default async function CreditsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await createClient()
  let loaded
  try {
    const result = await creditData(db, params)
    const names = await studentNames(db, [...result.data.map(c => c.student_id), ...(result.credit ? [result.credit.student_id] : [])])
    loaded = { ...result, names }
  } catch { return <LoadError/> }
  const { data, credit, invoices, openings, uses, names } = loaded
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Số dư khách hàng</h1><Notice params={params}/>
    <p>Tiền đang giữ cho khách hàng chưa phân bổ vào nghĩa vụ. Đây không phải doanh thu mới. Mỗi lần sử dụng hoặc hoàn cần yêu cầu được phê duyệt riêng.</p>
    <Table headers={['Học viên', 'Credit gốc', 'Đã dùng', 'Đã hoàn', 'Còn lại', 'Nguồn', 'Chi tiết']} rows={data.map(c => [names.get(c.student_id), money(c.amount, c.currency), money(c.applied_amount, c.currency), money(c.refunded_amount, c.currency), money(c.remaining_credit, c.currency), c.payment_status === 'VOIDED' ? 'Thanh toán gốc đã vô hiệu' : c.legacy_settlement_credit ? 'Đã trả trước chuyển đổi — chờ kiểm tra nguồn' : 'Thanh toán sau chuyển đổi', <Link prefetch={false} key={c.id} href={'/admin/finance/credits?selected=' + c.id}>Xem số dư</Link>])}/>
    <Pager path="/admin/finance/credits" params={params} {...loaded}/>
    {credit && <Panel title={'Số dư của ' + names.get(credit.student_id)}>
      <p>Credit gốc: {money(credit.amount, credit.currency)} • Còn lại: {money(credit.remaining_credit, credit.currency)}</p>
      <div className="flex flex-wrap gap-4">{credit.payment_id && <Link prefetch={false} className="underline" href={'/admin/finance/payments?selected=' + credit.payment_id}>Thanh toán gốc</Link>}<Link prefetch={false} className="underline" href={'/finance?selected=' + credit.correction_id}>Điều chỉnh mở sổ gốc</Link></div>
      {credit.legacy_settlement_credit ? <p>Khoản trả trước chuyển đổi chưa có chứng từ Payment trong hệ thống. Giữ số dư chờ kiểm tra nguồn; không tạo thanh toán giả để sử dụng hoặc hoàn.</p> : Number(credit.remaining_credit) > 0 && <>
        <form action={applyCredit} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="credit_id" value={credit.id}/><input type="hidden" name="idempotency_key" value={randomUUID()}/>
          <Select name="obligation" label="Nghĩa vụ nhận phân bổ" required options={[...invoices.map(i => ({id:'invoice:' + i.invoice_id,name:i.invoice_number + ' • ' + money(Number(i.outstanding_balance), credit.currency)})), ...openings.map(o => ({id:'opening:' + o.id,name:'Mở sổ ' + o.opening_as_of_date + ' • ' + money(Number(o.outstanding_balance), credit.currency)}))]}/>
          <Field name="amount" label="Số tiền dùng từ credit" type="number" max={Number(credit.remaining_credit)}/><Field name="reason" label="Lý do sử dụng credit"/><Confirm text="Chỉ phân bổ sau khi người khác phê duyệt"/><SubmitButton>Gửi yêu cầu dùng credit</SubmitButton>
        </form><p className="text-sm">Tối đa 50 nghĩa vụ mỗi loại, cùng học viên, chi nhánh và tiền tệ. Không tự chuyển credit sang kỳ khác.</p>
        <form action={refundCredit} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="credit_id" value={credit.id}/><input type="hidden" name="idempotency_key" value={randomUUID()}/><Field name="amount" label="Số tiền hoàn credit" type="number" max={Number(credit.remaining_credit)}/><Field name="refunded_at" label="Thời gian hoàn (giờ Việt Nam)" type="datetime-local" value={vietnamDateTime()}/><Field name="reason" label="Lý do hoàn credit"/><Confirm text="Gửi để phê duyệt qua quy trình hoàn tiền hiện có"/><SubmitButton>Gửi yêu cầu hoàn credit</SubmitButton></form>
      </>}
      <h3 className="font-semibold">Lịch sử sử dụng (50 lần gần nhất)</h3>
      <Table headers={['Loại', 'Số tiền', 'Thời gian', 'Phê duyệt', 'Chứng từ']} rows={uses.map(u => [u.kind, money(Number(u.amount), credit.currency), timeText(u.created_at), <Link prefetch={false} key={u.id} href={'/finance?selected=' + u.id}>Xem phê duyệt</Link>, u.refund_id ? <Link prefetch={false} key={u.refund_id} href={'/admin/finance/refunds?selected=' + u.refund_id}>Phiếu hoàn / trạng thái đảo</Link> : 'Phân bổ từ thanh toán gốc'])}/>
    </Panel>}
  </div>
}
