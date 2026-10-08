import { createClient } from '@/lib/supabase/server'
import { ProgressSteps, RecruitmentShell } from '../shell'
import { staffFacingError } from '../status'
import styles from '../workspace.module.css'
import { vietnamToday } from '../intake'
import { CounterForm } from './CounterForm'

const steps = ['Bản nháp', 'Đã nộp', 'Đã xác minh', 'Thanh toán', 'Xác nhận thanh toán', 'Chờ vào ca dạy']

export default async function NewRegistrationPage({ searchParams }: { searchParams: Promise<{ lead?: string; error?: string }> }) {
  const params = await searchParams
  const db = await createClient()
  const leadId = params.lead ?? ''
  const [{ data: branches, error: branchError }, { data: lead }, { data: curriculums, error: curriculumError }, { data: levels, error: levelError }] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    leadId ? db.from('crm_leads').select('id, branch_id, status, full_name, phone, parent_name, student_name, student_date_of_birth').eq('id', leadId).maybeSingle() : Promise.resolve({ data: null }),
    db.from('operational_curriculums').select('id, name').order('name'),
    db.from('curriculum_levels').select('id, curriculum_id, name, sequence_no').eq('status', 'ACTIVE').order('sequence_no'),
  ])
  const loadError = branchError || curriculumError || levelError
  const errorNotice = staffFacingError(params.error)
  return (
    <RecruitmentShell title="Đăng ký tại quầy" description="Khách đến và quyết định học ngay. Bản nháp chưa tạo học viên và chưa phải đăng ký thành công." current="counter">
      {errorNotice && <p className={styles.error} role="alert">{errorNotice}{params.error && params.error !== errorNotice && <details className={styles.diagnostics}><summary>Chi tiết kỹ thuật</summary><p>{params.error}</p></details>}</p>}
      {loadError && <p className={styles.error} role="alert">Không tải được dữ liệu đăng ký.</p>}
      <ProgressSteps labels={steps} currentIndex={0} />
      <div className={styles.layout}>
        <CounterForm branches={branches ?? []} lead={lead} curriculums={curriculums ?? []} levels={levels ?? []} today={vietnamToday()} />
        <aside className={styles.card}>
          <h2>Cách đọc các bước</h2>
          <p>Bước đang nhập là Bản nháp. Đã nộp chờ xác minh. Đã xác minh mới chốt học phí.</p>
          <p>Thanh toán chờ khoản phải thu được xác thực. Xác nhận thanh toán chỉ xảy ra sau khi payOS xác thực, không có nút ghi đã thu.</p>
          <p>Chờ vào ca dạy nghĩa là hồ sơ đã hoàn tất và chưa vào ca dạy. Hoàn tất đăng ký và thu đủ học phí là hai việc khác nhau.</p>
        </aside>
      </div>
    </RecruitmentShell>
  )
}
