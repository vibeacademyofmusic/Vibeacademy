import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AppPage, Eyebrow, InlineNotice, PageHeader } from '@/app/admin/_components/vibe'
import { CounterForm } from './CounterForm'

export default async function NewRegistrationPage({ searchParams }: { searchParams: Promise<{ lead?: string; error?: string }> }) {
  const params = await searchParams
  const db = await createClient()
  const leadId = params.lead ?? ''
  const [{ data: branches, error: branchError }, { data: lead }, { data: curriculums, error: curriculumError }, { data: levels, error: levelError }, { data: subjects, error: subjectError }] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    leadId ? db.from('crm_leads').select('id, branch_id, status, full_name, phone, parent_name, student_name, student_date_of_birth').eq('id', leadId).maybeSingle() : Promise.resolve({ data: null }),
    db.from('curriculums').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('curriculum_levels').select('id, curriculum_id, name, sequence_no').eq('status', 'ACTIVE').order('sequence_no'),
    db.from('curriculum_subjects').select('id, level_id, name').eq('status', 'ACTIVE').order('name'),
  ])
  const loadError = branchError || curriculumError || levelError || subjectError
  return (
    <AppPage>
      <Eyebrow>Kinh doanh</Eyebrow>
      <PageHeader title="Đăng ký tại quầy" description="Khách đến và quyết định học ngay. Bản nháp chưa phải đăng ký thành công." actions={<Link href="/admin/business/registrations">Danh sách đăng ký</Link>} />
      <nav className="vibe-tabs" aria-label="Không gian tuyển sinh">
        <span aria-current="page" aria-selected="true">Đăng ký tại quầy</span>
        <Link href="/admin/business/registrations?tab=crm">CRM</Link>
        <Link href="/admin/business/registrations">Danh sách đăng ký</Link>
      </nav>
      {params.error && <InlineNotice tone="error">{params.error}</InlineNotice>}
      {loadError && <InlineNotice tone="error">Không tải được dữ liệu đăng ký: {loadError.message}</InlineNotice>}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <CounterForm branches={branches ?? []} lead={lead} curriculums={curriculums ?? []} levels={levels ?? []} subjects={subjects ?? []} />
        <aside className="vibe-card grid gap-3 text-sm">
          <h2>Trạng thái hồ sơ</h2>
          <ol className="grid gap-2 text-slate-700">
            <li>1. Bản nháp — đang nhập</li>
            <li>2. Đã nộp — chờ xác minh</li>
            <li>3. Đã xác minh — chốt học phí</li>
            <li>4. Chờ cọc — MoMo chưa đủ 50%</li>
            <li>5. Đã nhận đủ cọc — tạo học viên và chờ xếp lớp</li>
          </ol>
          <p>Thanh toán chỉ được ghi nhận từ thông báo MoMo đã ký. Ảnh chuyển khoản hoặc nút “đã thu” không làm hồ sơ thành công.</p>
        </aside>
      </div>
    </AppPage>
  )
}
