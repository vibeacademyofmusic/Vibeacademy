import Link from 'next/link'
import { adminClient, type Params } from '../../finance/operations'
import { rows } from '../../finance/query'
import { teachers } from '../../feedback/data'
import { period, payrollList, payTypes, money, states } from '../data'
import { payrollAction } from '../actions'
import { Panel, Table, Select, Field, Confirm, Pager, Notice, LoadError } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
export default async function PayrollPeriod({params,searchParams}:{params:Promise<{period:string}>;searchParams:Promise<Params>}) {
 const {period:id}=await params,p=await searchParams,db=await adminClient()
 let head,loaded
 try {head=await period(db,id)}catch{return <LoadError/>}
 if(!head)return <p>Không tìm thấy kỳ lương.</p>
 try {loaded=await Promise.all([payrollList(db,id,p),teachers(db),rows(db.from('payroll_events').select('id,status,note,actor_id,created_at,event_type,override_reason').eq('period_id',id).order('created_at',{ascending:false}).limit(50))])}catch{return <LoadError/>}
 const [list,ts,events]=loaded
 const transitions=head.status==='GENERATED'?['DRAFT','REVIEW']:head.status==='REVIEW'?['DRAFT','APPROVED']:head.status==='APPROVED'?['FINALIZED']:[]
 return <div className="min-w-0 space-y-5"><Link href="/admin/payroll" prefetch={false}>← Các kỳ lương</Link><h1 className="text-3xl font-bold">Kỳ lương {head.starts_on.slice(0,7)}</h1><Notice params={p}/><p>{states.find(s=>s.id===head.status)?.name} • {head.starts_on} → {head.ends_on}</p>
 {head.status==='DRAFT'&&<form action={payrollAction}><input type="hidden" name="action" value="generate"/><input type="hidden" name="period" value={id}/><SubmitButton>Tính bảng lương</SubmitButton></form>}
 {transitions.length>0&&<Panel title="Kiểm tra và chốt kỳ"><p>Quay về bản nháp để tính lại trước khi thêm điều chỉnh. Người tính lương hoặc thêm điều chỉnh phải nhờ người khác duyệt/chốt. SUPER_ADMIN chỉ được dùng ngoại lệ khẩn cấp có lý do và lưu vết đầy đủ.</p><form action={payrollAction} className="space-y-3"><input type="hidden" name="action" value="transition"/><input type="hidden" name="period" value={id}/><input type="hidden" name="version" value={head.version}/><Select name="status" label="Chuyển trạng thái" options={states.filter(s=>transitions.includes(s.id))} required/><Field name="note" label="Ghi chú kiểm tra"/>{['REVIEW','APPROVED'].includes(head.status)&&<details><summary>Ngoại lệ khẩn cấp — SUPER_ADMIN</summary><p>Chỉ chọn khi cần vượt quy tắc phân tách người lập và người duyệt. Không mở khóa dữ liệu đã chốt.</p><label className="block"><input type="checkbox" name="override_type" value="MAKER_CHECKER_EMERGENCY"/> Xác nhận dùng ngoại lệ khẩn cấp</label><Field name="override_reason" label="Lý do ngoại lệ khẩn cấp" required={false}/></details>}<Confirm text="Tôi đã kiểm tra số liệu và xác nhận chuyển trạng thái"/><SubmitButton>Lưu trạng thái kỳ lương</SubmitButton></form></Panel>}
 {head.status==='FINALIZED'&&<p>Đã chốt — bảng lương được khóa, không thể tính lại hoặc sửa khoản tiền.</p>}
 <form className="grid gap-3 sm:grid-cols-3"><Select name="teacher" label="Giáo viên" value={p.teacher} options={ts.map(t=>({id:t.id,name:t.full_name||t.teacher_code}))}/><Select name="type" label="Loại lương" value={p.type} options={payTypes}/><button>Lọc giáo viên</button></form>
 <Table headers={['Giáo viên','Loại','Giờ dạy','Lương tháng','Theo giờ','Điều chỉnh','Tổng']} rows={list.data.map(t=>[<Link prefetch={false} key={t.id} href={'/admin/payroll/'+id+'/'+t.teacher_id}>{t.teacher_name}</Link>,t.pay_type,t.teaching_hours,money(t.base_salary,t.currency),money(t.hourly_earnings,t.currency),money(t.adjustment_amount,t.currency),money(t.gross_amount,t.currency)])}/><Pager path={'/admin/payroll/'+id} params={p} {...list}/>
 <Panel title="Lịch sử kỳ lương"><Table headers={['Trạng thái','Ghi chú','Người thực hiện']} rows={events.map(e=>[e.status,e.override_reason?e.note+' — Ngoại lệ khẩn cấp: '+e.override_reason:e.note,e.actor_id])}/></Panel></div>
}
