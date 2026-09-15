import Link from 'next/link'
import { adminClient, type Params } from '../finance/operations'
import { branches, rows } from '../finance/query'
import { teachers } from '../feedback/data'
import { periods, states, payTypes, money } from './data'
import { payrollAction } from './actions'
import { Field, Select, Panel, Table, Pager, Notice, LoadError } from '../finance/_components/ui'
import SubmitButton from '../finance/_components/SubmitButton'
export default async function PayrollPage({searchParams}:{searchParams:Promise<Params>}) {
 const p=await searchParams,db=await adminClient()
 let loaded
 try {loaded=await Promise.all([periods(db,p),branches(db),teachers(db),rows(db.from('teacher_compensation_rules').select('id,teacher_id,branch_id,pay_type,rate,currency,effective_from,effective_to').order('created_at',{ascending:false}).limit(50))])} catch{return <LoadError/>}
 const [list,bs,ts,rules]=loaded,teacherOptions=ts.map(t=>({id:t.id,name:t.full_name||t.teacher_code}))
 return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Bảng lương giáo viên</h1><Notice params={p}/><p>Giờ dạy dùng thời lượng lịch của buổi hoàn tất và giáo viên thực tế. Đây là bảng tính nội bộ, chưa thực hiện thanh toán.</p>
 <form className="grid gap-3 sm:grid-cols-4"><Select name="branch" label="Chi nhánh" options={bs} value={p.branch}/><Select name="status" label="Trạng thái" options={states} value={p.status}/><Field name="month" label="Tháng" type="month" value={p.month} required={false}/><button>Lọc kỳ lương</button></form>
 <Table headers={['Kỳ','Chi nhánh','Trạng thái','Giáo viên','Lương tháng','Theo giờ','Điều chỉnh','Tổng']} rows={list.data.map(r=>[<Link prefetch={false} key={r.id+(r.currency||'')} href={'/admin/payroll/'+r.id}>{r.starts_on.slice(0,7)}</Link>,bs.find(b=>b.id===r.branch_id)?.name,states.find(s=>s.id===r.status)?.name,r.teacher_count,money(r.monthly_total,r.currency||''),money(r.hourly_total,r.currency||''),money(r.adjustments,r.currency||''),money(r.gross_amount,r.currency||'')])}/><Pager path="/admin/payroll" params={p} {...list}/>
 <Panel title="Tạo kỳ lương"><form action={payrollAction} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="action" value="create"/><Select name="branch" label="Chi nhánh kỳ lương" options={bs} required/><Field name="month" label="Tháng tính lương" type="month"/><SubmitButton>Tạo kỳ lương</SubmitButton></form></Panel>
 <Panel title="Mức lương có hiệu lực"><p>Lương tháng phải có một mức phủ toàn bộ kỳ. Các mức không được trùng ngày; chưa tự tính lương tháng theo tỷ lệ ngày.</p><form action={payrollAction} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="action" value="rule"/><Select name="teacher" label="Giáo viên" options={teacherOptions} required/><Select name="branch" label="Chi nhánh áp dụng" options={bs} required/><Select name="type" label="Loại lương" options={payTypes} required/><Field name="rate" label="Mức lương tháng hoặc đơn giá giờ"/><Field name="currency" label="Tiền tệ" value="VND"/><Field name="from" label="Hiệu lực từ" type="date"/><Field name="to" label="Hiệu lực đến" type="date" required={false}/><SubmitButton>Thêm mức lương</SubmitButton></form><p>50 mức được tạo gần nhất.</p><Table headers={['Giáo viên','Chi nhánh','Loại','Mức','Từ','Đến']} rows={rules.map(r=>[teacherOptions.find(t=>t.id===r.teacher_id)?.name,bs.find(b=>b.id===r.branch_id)?.name,r.pay_type,money(r.rate,r.currency),r.effective_from,r.effective_to||'Không giới hạn'])}/></Panel></div>
}
