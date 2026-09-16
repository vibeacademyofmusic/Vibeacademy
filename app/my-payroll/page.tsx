import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { rows } from '@/app/admin/finance/query'
import { money, type Payroll } from '@/app/admin/payroll/data'
import { pageNumber, type Params } from '@/app/admin/finance/operations'
import { Table, Pager, LoadError } from '@/app/admin/finance/_components/ui'
export default async function OwnPayroll({searchParams}:{searchParams:Promise<Params>}) {
 const params=await searchParams,page=pageNumber(params.page),db=await createClient()
 const {data:claims,error:authError}=await db.auth.getClaims()
 if(authError||!claims?.claims) redirect('/login')
 if(params.view==='corrections') {
  const corrections=await db.rpc('own_payroll_off_cycle_corrections',{p_offset:(page-1)*25})
  if(corrections.error)return <LoadError/>
  const items=(corrections.data||[]) as {correction_id:string;currency:string;amount:number;reason:string;approved_at:string}[]
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-4 sm:p-8"><h1 className="text-2xl font-bold">Điều chỉnh lương ngoài kỳ của tôi</h1><Link prefetch={false} href="/my-payroll">Bảng lương theo kỳ</Link><p>Điều chỉnh đã duyệt, tách khỏi bảng lương gốc đã chốt. Đây không phải xác nhận đã chi tiền.</p><Table headers={['Ngày duyệt','Số tiền điều chỉnh','Lý do']} rows={items.slice(0,25).map(c=>[new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short'}).format(new Date(c.approved_at)),money(c.amount,c.currency),c.reason])}/><Pager path="/my-payroll" params={params} page={page} more={items.length>25}/><form action={logout}><button className="rounded border px-4 py-2">Đăng xuất</button></form></main>
 }
 const {data,error}=await db.rpc('own_payrolls',{p_offset:(page-1)*25})
 if(error)return <main className="p-6"><LoadError/></main>
 const payrolls=(data||[]) as Payroll[]
 let periods:{id:string;starts_on:string;status:string}[]=[]
 try {if(payrolls.length) periods=await rows(db.from('payroll_periods').select('id,starts_on,status').in('id',payrolls.map(p=>p.period_id)))} catch {return <LoadError/>}
 return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-4 sm:p-8"><h1 className="text-2xl font-bold">Bảng lương của tôi</h1><Link prefetch={false} href="/my-payroll?view=corrections">Điều chỉnh lương ngoài kỳ đã duyệt</Link><p>Chỉ hiển thị lương của bạn đã được duyệt hoặc chốt. Số tiền này chưa xác nhận đã chi trả.</p><Table headers={['Kỳ / trạng thái','Họ tên','Loại lương','Lương cơ bản','Buổi / giờ','Điều chỉnh','Tổng','Phiếu lương']} rows={payrolls.slice(0,25).map(p=>[(periods.find(x=>x.id===p.period_id)?.starts_on.slice(0,7)||'')+' — '+(periods.find(x=>x.id===p.period_id)?.status==='FINALIZED'?'Đã chốt':'Đã duyệt'),p.teacher_name,p.pay_type,money(p.base_salary,p.currency),money(p.hourly_earnings,p.currency),money(p.adjustment_amount,p.currency),money(p.gross_amount,p.currency),<Link key={p.id} prefetch={false} href={'/documents/payslips/'+p.id}>Xem / In phiếu lương</Link>])}/><Pager path="/my-payroll" params={params} page={page} more={payrolls.length>25}/><form action={logout}><button className="rounded border px-4 py-2">Đăng xuất</button></form></main>
}
