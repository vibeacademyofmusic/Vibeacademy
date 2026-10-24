import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { logout } from '../login/actions'
import { financeContext } from './authorization'
import { operationNames } from './requests'
import { requestAction, reviewAction } from './actions'
import { rows } from '../admin/finance/query'
import { pageNumber, uuidPattern, vietnamDateTime, type Params } from '../admin/finance/operations'
import { money } from '../admin/finance/data'
import { Panel, Table, Select, Field, Confirm, Notice, LoadError, Pager, timeText } from '../admin/finance/_components/ui'
import SubmitButton from '../admin/finance/_components/SubmitButton'

type Request = { id:string;operation:string;target_id:string;branch_id:string;reason:string;status:string;maker_user_id:string;approver_user_id:string|null;created_at:string;details:Record<string,unknown>;source_snapshot:Record<string,unknown>;result_id:string|null }
type Payment = {id:string;payment_number:string;amount:number;currency:string;branch_name_snapshot:string}
type Payroll = {id:string;teacher_name:string;currency:string;gross_amount:number;period_id:string;payroll_periods:{starts_on:string;status:string}}
type Line = {id:string;amount:number;earning_type?:string;kind?:string;reason?:string;earned_on?:string}
const record = (value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}
const states = [{id:'PENDING_APPROVAL',name:'Chờ phê duyệt'},{id:'POSTED',name:'Đã ghi nhận'},{id:'CANCELLED',name:'Đã hủy yêu cầu'}]
function RequestFields({operation,targetName,targetId}:{operation:string;targetName:string;targetId:string}) {
  return <><input type="hidden" name="operation" value={operation}/><input type="hidden" name={targetName} value={targetId}/><input type="hidden" name="idempotency_key" value={randomUUID()}/><Field name="reason" label="Lý do yêu cầu"/></>
}
export default async function FinanceWorkspace({searchParams}:{searchParams:Promise<Params>}) {
  const p=await searchParams,{db,userId,isSuperAdmin}=await financeContext(),page=pageNumber(p.page)
  let loaded
  try {
    let requests=db.from('financial_approval_requests').select('id,operation,target_id,branch_id,reason,status,maker_user_id,approver_user_id,created_at,details,source_snapshot,result_id').order('created_at',{ascending:false}).order('id')
    if(states.some(s=>s.id===p.status))requests=requests.eq('status',p.status)
    loaded=await Promise.all([
      rows(requests.range((page-1)*25,page*25).returns<Request[]>()),
      uuidPattern.test(p.selected||'')?rows(db.from('financial_approval_requests').select('id,operation,target_id,branch_id,reason,status,maker_user_id,approver_user_id,created_at,details,source_snapshot,result_id').eq('id',p.selected!).returns<Request[]>()):Promise.resolve([] as Request[]),
      rows(db.from('payments').select('id,payment_number,amount,currency,branch_name_snapshot').eq('status','POSTED').order('created_at',{ascending:false}).limit(25).returns<Payment[]>()),
      rows(db.from('teacher_payrolls').select('id,teacher_name,currency,gross_amount,period_id,payroll_periods!inner(starts_on,status)').eq('payroll_periods.status','FINALIZED').order('id').limit(25).returns<Payroll[]>()),
      rows(db.from('payroll_periods').select('id,starts_on,status').in('status',['GENERATED','REVIEW','APPROVED']).order('starts_on',{ascending:false}).limit(25)),
    ])
  } catch {return <main className="p-6"><LoadError/></main>}
  const [requests,selectedRows,payments,payrolls,openPeriods]=loaded,selected=selectedRows[0]
  let chosen:Payroll|undefined,lines:Line[]=[],adjustments:Line[]=[],events:{id:string;event:string;reason:string;performed_by:string;performed_at:string}[]=[]
  try {
    if(uuidPattern.test(p.payroll||'')) {
      [chosen]=await rows(db.from('teacher_payrolls').select('id,teacher_name,currency,gross_amount,period_id,payroll_periods!inner(starts_on,status)').eq('id',p.payroll!).eq('payroll_periods.status','FINALIZED').returns<Payroll[]>())
      if(chosen)[lines,adjustments]=await Promise.all([
        rows(db.from('payroll_earning_lines').select('id,earning_type,amount,earned_on').eq('payroll_id',chosen.id).order('id').limit(100).returns<Line[]>()),
        rows(db.from('payroll_adjustments').select('id,kind,amount,reason').eq('payroll_id',chosen.id).order('id').limit(100).returns<Line[]>())])
    }
    if(selected)events=await rows(db.from('financial_approval_events').select('id,event,reason,performed_by,performed_at').eq('request_id',selected.id).order('performed_at').order('id').limit(50))
  }catch{return <main className="p-6"><LoadError/></main>}
  // Events in one transaction share a timestamp; UUID order is not workflow order.
  const eventOrder:Record<string,number>={REQUESTED:0,EMERGENCY_OVERRIDE:1,APPROVED:2,POSTED:3,CANCELLED:4}
  events.sort((a,b)=>a.performed_at.localeCompare(b.performed_at)||(eventOrder[a.event]??9)-(eventOrder[b.event]??9))
  const source=selected?.source_snapshot||{},details=selected?.details||{},sourcePayroll=record(source.payroll)
  const currency=String(source.currency||sourcePayroll.currency||'VND')
  return <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Phê duyệt tài chính</h1><div className="flex gap-4">{isSuperAdmin&&<Link prefetch={false} href="/admin/finance">Quản trị tài chính</Link>}<form action={logout}><button>Đăng xuất</button></form></div></header>
    <p>Yêu cầu mới chưa làm thay đổi số tiền. Người có quyền khác phải kiểm tra và phê duyệt. Đây là ghi nhận nội bộ, không chuyển tiền qua ngân hàng.</p>
    <Notice params={p}/>
    <form className="flex flex-wrap items-end gap-3"><Select name="status" label="Trạng thái yêu cầu" value={p.status} options={states}/><button className="rounded border p-2">Lọc yêu cầu</button></form>
    <Table headers={['Yêu cầu','Loại','Lý do','Trạng thái','Người lập','Ngày gửi']} rows={requests.slice(0,25).map(r=>[
      <Link key={r.id} prefetch={false} href={'/finance?selected='+r.id}>Xem yêu cầu</Link>,operationNames[r.operation],r.reason,states.find(s=>s.id===r.status)?.name||r.status,r.maker_user_id===userId?'Bạn':'Người lập khác',timeText(r.created_at)])}/>
    <Pager path="/finance" params={p} page={page} more={requests.length>25}/>
    {selected&&<Panel title={operationNames[selected.operation]}>
      <p>{selected.reason}</p><p>Trạng thái: {states.find(s=>s.id===selected.status)?.name||selected.status}</p>
      {selected.status==='POSTED'&&selected.result_id&&['REFUND','REFUND_CUSTOMER_CREDIT'].includes(selected.operation)&&<Link prefetch={false} href={'/documents/finance/refunds/'+selected.result_id}>Xem / In phiếu hoàn</Link>}
      {['APPLY_CUSTOMER_CREDIT','REFUND_CUSTOMER_CREDIT'].includes(selected.operation)&&<Link prefetch={false} href={'/documents/finance/credits/'+selected.target_id}>Xem sao kê số dư</Link>}
      {selected.operation==='CANCEL_INVOICE'&&<Link prefetch={false} href={'/documents/finance/invoices/'+selected.target_id}>Xem / In hóa đơn</Link>}
      <p>Chứng từ gốc: {String(source.invoice_number||source.payment_number||source.refund_number||sourcePayroll.teacher_name||selected.target_id)}</p>
      {['APPLY_CUSTOMER_CREDIT','REFUND_CUSTOMER_CREDIT'].includes(selected.operation)?<>
        <p>Credit còn lại khi lập: {money(Number(record(source.credit).remaining_credit),currency)} • Số tiền yêu cầu: {money(Number(source.amount),currency)}</p>
        <p>Thanh toán gốc: {String(record(source.credit).payment_id)} • Đích phân bổ: {String(record(source.obligation).invoice_number || record(source.obligation).id || 'Hoàn qua Payment gốc')}</p>
        <p>Không tạo doanh thu từ credit. Mọi chứng từ gốc được giữ nguyên.</p>
      </>:selected.operation==='OPENING_RECEIVABLE_CORRECTION'?<>
        <p>Mở sổ gốc: {money(Number(source.original_amount),currency)} • Giá trị trước sửa: {money(Number(source.old_amount),currency)} • Giá trị đúng: {money(Number(source.corrected_amount),currency)} • Chênh lệch: {money(Number(source.delta),currency)}</p>
        <p>Nguồn nhập: {String(source.source_reference)} • Lô: {String(source.migration_batch_id)}</p>
        <p>Chỉ điều chỉnh công nợ; không tạo thu tiền hoặc doanh thu. Bản gốc giữ nguyên.</p>
      </>:selected.operation==='PAYROLL_CORRECTION'?<>
        <p>Giá trị dòng gốc: {money(Number(source.original_amount),currency)} • Đích sửa đúng: {money(Number(source.corrected_amount),currency)} • Chênh lệch lần này: {money(Number(source.delta),currency)}</p>
        <p>{details.run_type==='OFF_CYCLE_CORRECTION'?'Đợt correction khẩn cấp riêng':'Kỳ nhận correction: '+String(record(source.target_period).starts_on||'')}</p>
        <p>Bảng lương gốc được giữ nguyên. Mã nguồn: {selected.target_id}</p>
      </>:<><p>Số tiền nguồn: {money(Number(source.amount??source.total_amount),currency)}</p>{details.amount!==undefined&&<p>Số tiền yêu cầu: {money(Number(details.amount),currency)}</p>}</>}
      {selected.status==='PENDING_APPROVAL'&&<form action={reviewAction} className="space-y-3">
        <input type="hidden" name="request_id" value={selected.id}/>
        {selected.maker_user_id===userId&&<p className="text-amber-900">Bạn là người lập yêu cầu. Không được tự phê duyệt thông thường.</p>}
        <Select name="action" label="Xử lý yêu cầu" required options={[{id:'approve',name:'Duyệt và ghi nhận'},{id:'cancel',name:'Hủy yêu cầu'}]}/>
        <Field name="note" label="Ghi chú kiểm tra"/>
        {isSuperAdmin&&<details><summary>Ngoại lệ khẩn cấp — SUPER_ADMIN</summary><label className="block"><input type="checkbox" name="override_type" value="MAKER_CHECKER_EMERGENCY"/> Xác nhận dùng ngoại lệ khẩn cấp</label><Field name="override_reason" label="Lý do ngoại lệ" required={false}/><p>Không mở khóa dữ liệu gốc đã chốt.</p></details>}
        <Confirm text="Tôi đã kiểm tra dữ liệu gốc, số tiền và xác nhận thao tác"/><SubmitButton>Xử lý yêu cầu</SubmitButton>
      </form>}
      <Table headers={['Sự kiện','Lý do','Người thực hiện','Thời gian']} rows={events.map(e=>[e.event,e.reason,e.performed_by,timeText(e.performed_at)])}/>
    </Panel>}
    <Panel title="Phiếu thu trong phạm vi"><Table headers={['Phiếu thu', 'Chi nhánh', 'Số tiền']} rows={payments.map(pay=>[<Link key={pay.id} prefetch={false} href={'/documents/finance/payments/'+pay.id}>{pay.payment_number}</Link>,pay.branch_name_snapshot,money(pay.amount,pay.currency)])}/></Panel>
    <Panel title="Yêu cầu hoàn tiền / hủy thanh toán">
      <p>25 thanh toán đã ghi nhận gần nhất trong phạm vi của bạn.</p>
      <form action={requestAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="idempotency_key" value={randomUUID()}/>
        <Select name="operation" label="Loại yêu cầu" required options={[{id:'REFUND',name:'Hoàn tiền'},{id:'VOID_PAYMENT',name:'Hủy thanh toán'}]}/>
        <Select name="payment_id" label="Thanh toán gốc" required options={payments.map(x=>({id:x.id,name:x.payment_number+' • '+x.branch_name_snapshot+' • '+money(x.amount,x.currency)}))}/>
        <Field name="amount" label="Số tiền hoàn (chỉ dùng khi hoàn tiền)" type="number" required={false}/><Field name="refunded_at" label="Thời gian hoàn (giờ Việt Nam)" type="datetime-local" value={vietnamDateTime()} required={false}/>
        <Field name="reason" label="Lý do yêu cầu"/><Field name="notes" label="Ghi chú hoàn tiền" required={false}/>
        <Confirm text="Gửi yêu cầu để người khác kiểm tra; chưa ghi nhận giao dịch"/><SubmitButton>Gửi yêu cầu tài chính</SubmitButton>
      </form>
    </Panel>
    <Panel title="Kỳ lương cần kiểm tra"><Table headers={['Kỳ','Trạng thái','Thao tác']} rows={openPeriods.map(t=>[t.starts_on,t.status,<Link key={t.id} prefetch={false} href={'/finance/payroll/'+t.id}>Kiểm tra kỳ lương</Link>])}/></Panel><Panel title="Correction lương đã chốt">
      <p>Chọn bảng lương gốc. Hiển thị tối đa 25 bảng lương đã chốt trong phạm vi được cấp quyền.</p>
      <Table headers={['Giáo viên','Kỳ gốc','Tổng gốc','Thao tác']} rows={payrolls.map(t=>[t.teacher_name,t.payroll_periods.starts_on,money(t.gross_amount,t.currency),<Link key={t.id} prefetch={false} href={'/finance?payroll='+t.id}>Chọn bảng lương gốc</Link>])}/>
      {chosen&&<form action={requestAction} className="space-y-3">
        <h3 className="font-semibold">{chosen.teacher_name} • {chosen.payroll_periods.starts_on}</h3>
        <RequestFields operation="PAYROLL_CORRECTION" targetName="payroll_id" targetId={chosen.id}/>
        {(lines.length>0||adjustments.length>0)&&<Select name="source_line" label="Dòng gốc cần sửa" required options={[
          ...lines.map(l=>({id:'earning:'+l.id,name:(l.earned_on||'')+' '+l.earning_type+' • '+money(l.amount,chosen!.currency)})),
          ...adjustments.map(a=>({id:'adjustment:'+a.id,name:a.kind+' '+a.reason+' • '+money(a.amount,chosen!.currency)}))]}/>}
        <p>Tối đa 100 dòng mỗi loại. Nhập giá trị đúng của dòng gốc, không nhập chênh lệch; database tính phần còn cần điều chỉnh.</p>
        <Field name="corrected_amount" label="Giá trị đúng sau sửa"/>
        <Select name="run_type" label="Kỳ ghi nhận correction" value="NEXT_OPEN_PERIOD" required options={[{id:'NEXT_OPEN_PERIOD',name:'Kỳ lương mở tiếp theo'},{id:'OFF_CYCLE_CORRECTION',name:'Đợt correction khẩn cấp riêng'}]}/>
        <Confirm text="Bản gốc giữ nguyên; correction phải được phê duyệt"/><SubmitButton>Gửi yêu cầu correction</SubmitButton>
      </form>}
    </Panel>
  </main>
}
