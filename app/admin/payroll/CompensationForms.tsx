import { payrollAction } from './actions'
import { Field, Select, Panel } from '../finance/_components/ui'
import SubmitButton from '../finance/_components/SubmitButton'
type Option={id:string;name:string}
export default function CompensationForms({employees,teachers,branches}:{employees:Option[];teachers:Option[];branches:Option[]}) {
 return <>
  <Panel title="Lương tháng nhân viên"><p>Mức lương phải phủ trọn kỳ. Lương thực tính theo phút lịch và chấm công đã duyệt; đi muộn/về sớm không tự động giảm lương.</p><form action={payrollAction} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="action" value="employee_rule"/><Select name="employee" label="Nhân viên" options={employees} required/><Select name="branch" label="Chi nhánh trả lương" options={branches} required/><Field name="rate" label="Lương tháng đầy đủ"/><Field name="currency" label="Tiền tệ" value="VND"/><Field name="from" label="Hiệu lực từ" type="date"/><Field name="to" label="Hiệu lực đến" type="date" required={false}/><SubmitButton>Lưu lương tháng nhân viên</SubmitButton></form></Panel>
  <Panel title="Lương theo buổi"><p>Chỉ tính buổi đã hoàn tất cho giáo viên thực dạy, theo loại lớp và mức đúng ngày dạy.</p><form action={payrollAction} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="action" value="session_rule"/><Select name="teacher" label="Giáo viên theo buổi" options={teachers} required/><Select name="branch" label="Chi nhánh dạy" options={branches} required/><Select name="class_type" label="Loại lớp" options={[{id:'ONE_ON_ONE',name:'Cá nhân'},{id:'GROUP',name:'Nhóm'}]} required/><Field name="rate" label="Đơn giá mỗi buổi"/><Field name="currency" label="Tiền tệ" value="VND"/><Field name="from" label="Hiệu lực từ" type="date"/><Field name="to" label="Hiệu lực đến" type="date" required={false}/><SubmitButton>Lưu mức theo buổi</SubmitButton></form></Panel>
 </>
}
