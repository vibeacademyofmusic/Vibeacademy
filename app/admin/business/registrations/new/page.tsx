import { createClient } from '@/lib/supabase/server'
import { createRegistration } from '../actions'

export default async function NewRegistrationPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const params = await searchParams
  const db = await createClient()
  const leadId = params.lead ?? ''
  const [{ data: branches }, { data: lead }, { data: curriculums }, { data: levels }, { data: subjects }] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    leadId ? db.from('crm_leads').select('id, branch_id, status, full_name, phone, parent_name, student_name, student_date_of_birth, program_interest, instrument_interest').eq('id', leadId).maybeSingle() : Promise.resolve({ data: null }),
    db.from('curriculums').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('curriculum_levels').select('id, curriculum_id, name').eq('status', 'ACTIVE').order('sequence_no'),
    db.from('curriculum_subjects').select('id, level_id, name').eq('status', 'ACTIVE').order('name'),
  ])
  const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">Đăng ký mới</h1>
      {lead && lead.status !== 'WON' && <p className="mt-4 text-sm text-red-700">Chỉ tạo hồ sơ từ khách đã chốt thành công.</p>}
      <form action={createRegistration} className="mt-6 max-w-xl space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        {lead && <input type="hidden" name="crm_lead_id" value={lead.id} />}
        <label className="block text-sm">Chi nhánh<select name="branch_id" required defaultValue={lead?.branch_id ?? ''} className={field}>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="block text-sm">Học viên<input name="student_name" required defaultValue={lead?.student_name || lead?.full_name || ''} className={field} /></label>
        <label className="block text-sm">Ngày sinh<input name="student_date_of_birth" type="date" required defaultValue={lead?.student_date_of_birth ?? ''} className={field} /></label>
        <label className="block text-sm">Phụ huynh<input name="parent_name" required defaultValue={lead?.parent_name || lead?.full_name || ''} className={field} /></label>
        <label className="block text-sm">Điện thoại<input name="parent_phone" defaultValue={lead?.phone ?? ''} className={field} /></label>
        <p className="text-sm text-gray-600">Chọn chương trình, trình độ và môn đang hoạt động. Hồ sơ chỉ thành công sau khi thanh toán được xác nhận.</p>
        <label className="block text-sm">Chương trình<select name="curriculum_id" required defaultValue="" className={field}><option value="" disabled>Chọn chương trình</option>{(curriculums ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-sm">Trình độ<select name="level_id" required defaultValue="" className={field}><option value="" disabled>Chọn trình độ</option>{(levels ?? []).map(item => <option key={item.id} value={item.id}>{curriculums?.find(c => c.id === item.curriculum_id)?.name} · {item.name}</option>)}</select></label>
        <label className="block text-sm">Môn học<select name="subject_id" required defaultValue="" className={field}><option value="" disabled>Chọn môn học</option>{(subjects ?? []).map(item => <option key={item.id} value={item.id}>{levels?.find(l => l.id === item.level_id)?.name} · {item.name}</option>)}</select></label>
        <label className="block text-sm">Ngày muốn bắt đầu<input name="desired_start_date" type="date" className={field} /></label>
        <label className="block text-sm">Lịch mong muốn<input name="preferred_schedule" className={field} /></label>
        <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm text-white">Lưu bản nháp</button>
      </form>
    </div>
  )
}
