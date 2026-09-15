import Link from 'next/link'
import { financeContext } from '../../authorization'
import { rows } from '../../../admin/finance/query'
import { uuidPattern, pageNumber, type Params } from '../../../admin/finance/operations'
import { payrollAction } from '../../../admin/payroll/actions'
import { states, money } from '../../../admin/payroll/data'
import { Panel, Table, Select, Field, Confirm, Notice, LoadError, Pager } from '../../../admin/finance/_components/ui'
import SubmitButton from '../../../admin/finance/_components/SubmitButton'
export default async function PayrollReview({params,searchParams}:{params:Promise<{period:string}>;searchParams:Promise<Params>}) {
  const {period}=await params,p=await searchParams,{db,isSuperAdmin}=await financeContext(),page=pageNumber(p.page)
  if(!uuidPattern.test(period))return <p>Không tìm thấy kỳ lương.</p>
  let loaded
  try {loaded=await Promise.all([
    rows(db.from('payroll_periods').select('id,status,starts_on,ends_on,version').eq('id',period)),
    rows(db.from('teacher_payrolls').select('id,teacher_name,currency,base_salary,hourly_earnings,adjustment_amount,gross_amount').eq('period_id',period).order('id').range((page-1)*25,page*25)),
    rows(db.from('payroll_events').select('id,status,note,actor_id,override_reason').eq('period_id',period).order('created_at',{ascending:false}).limit(50)),
  ])}catch{return <LoadError/>}
  const [heads,payrolls,events]=loaded,head=heads[0]
  if(!head)return <p>Không có kỳ lương trong phạm vi được cấp quyền.</p>
  let detail,lines:{id:string;earned_on:string;earning_type:string;duration_hours:number;rate:number;amount:number}[]=[],adjustments:{id:string;kind:string;amount:number;reason:string;created_by:string;approved_by:string|null}[]=[]
  if(uuidPattern.test(p.payroll||'')){
    try {
      [detail]=await rows(db.from('teacher_payrolls').select('id,teacher_name,currency').eq('period_id',period).eq('id',p.payroll!))
      if(detail)[lines,adjustments]=await Promise.all([
        rows(db.from('payroll_earning_lines').select('id,earned_on,earning_type,duration_hours,rate,amount').eq('payroll_id',detail.id).order('earned_on').order('id').range((page-1)*25,page*25)),
        rows(db.from('payroll_adjustments').select('id,kind,amount,reason,created_by,approved_by').eq('payroll_id',detail.id).order('created_at').order('id').range((page-1)*25,page*25)),
      ])
    }catch{return <LoadError/>}
  }
  const transitions=head.status==='GENERATED'?['DRAFT','REVIEW']:head.status==='REVIEW'?['DRAFT','APPROVED']:head.status==='APPROVED'?['FINALIZED']:[]
  return <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-8"><Link prefetch={false} href="/finance">← Phê duyệt tài chính</Link>
    <h1 className="text-2xl font-bold">Kiểm tra kỳ lương {head.starts_on}</h1><Notice params={p}/><p>{states.find(s=>s.id===head.status)?.name}</p>
    <Table headers={['Giáo viên','Lương tháng','Theo giờ','Điều chỉnh','Tổng','Chi tiết']} rows={payrolls.slice(0,25).map(t=>[t.teacher_name,money(t.base_salary,t.currency),money(t.hourly_earnings,t.currency),money(t.adjustment_amount,t.currency),money(t.gross_amount,t.currency),<Link key={t.id} prefetch={false} href={'/finance/payroll/'+period+'?payroll='+t.id}>Kiểm tra từng dòng</Link>])}/>
    <Pager path={'/finance/payroll/'+period} params={p} page={page} more={detail?lines.length>25||adjustments.length>25:payrolls.length>25}/>
    {detail&&<Panel title={'Chi tiết: '+detail.teacher_name}><p>Các dòng thu nhập và điều chỉnh được phân trang, chỉ đọc. Thời lượng theo lịch, chưa có chấm công thực tế.</p>
      <Table headers={['Ngày','Loại','Giờ','Mức áp dụng','Thành tiền']} rows={lines.slice(0,25).map(l=>[l.earned_on,l.earning_type,l.duration_hours,money(l.rate,detail.currency),money(l.amount,detail.currency)])}/>
      <Table headers={['Loại điều chỉnh','Số tiền','Lý do','Người lập','Người duyệt']} rows={adjustments.slice(0,25).map(a=>[a.kind,money(a.amount,detail.currency),a.reason,a.created_by,a.approved_by||'Chưa duyệt'])}/>
    </Panel>}
    {transitions.length>0&&<Panel title="Duyệt / chốt kỳ lương"><p>Người lập hoặc thêm điều chỉnh không được tự duyệt/chốt. Các khoản đã chốt chỉ được sửa bằng correction liên kết nguồn.</p>
      <form action={payrollAction} className="space-y-3"><input type="hidden" name="workspace" value="finance"/><input type="hidden" name="action" value="transition"/><input type="hidden" name="period" value={period}/><input type="hidden" name="version" value={head.version}/>
        <Select name="status" label="Chuyển trạng thái" required options={states.filter(s=>transitions.includes(s.id))}/><Field name="note" label="Ghi chú kiểm tra"/>
        {isSuperAdmin&&<details><summary>Ngoại lệ khẩn cấp — SUPER_ADMIN</summary><label><input type="checkbox" name="override_type" value="MAKER_CHECKER_EMERGENCY"/> Xác nhận dùng ngoại lệ khẩn cấp</label><Field name="override_reason" label="Lý do ngoại lệ" required={false}/></details>}
        <Confirm text="Tôi đã kiểm tra số liệu và xác nhận chuyển trạng thái"/><SubmitButton>Lưu trạng thái kỳ lương</SubmitButton>
      </form></Panel>}
    {head.status==='FINALIZED'&&<p>Đã chốt. Không được mở lại hoặc sửa trực tiếp.</p>}
    <Panel title="Lịch sử"><Table headers={['Trạng thái','Ghi chú','Ngoại lệ','Người thực hiện']} rows={events.map(e=>[e.status,e.note,e.override_reason||'—',e.actor_id])}/></Panel>
  </main>
}
