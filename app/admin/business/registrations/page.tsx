import Link from 'next/link'
import { requestClient } from '@/lib/auth/request'
import { CrmLeadContent } from '../crm/CrmContent'
import { RecruitmentShell } from './shell'
import { registrationProgressLabel, staffFacingError } from './status'
import styles from './workspace.module.css'

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string; [key: string]: string | undefined }> }) {
  const params = await searchParams
  if (params.workspace === 'crm' || params.tab === 'crm') {
    return (
      <RecruitmentShell title="CRM & Tuyển sinh" description="Theo dõi khách hàng, mức độ quan tâm và giai đoạn bán hàng. Đăng ký tại quầy là thao tác tiếp nhận riêng." current="crm">
        <CrmLeadContent searchParams={Promise.resolve(params)} />
      </RecruitmentShell>
    )
  }
  const db = await requestClient()
  const { data, error } = await db.from('registration_applications')
    .select('id, application_code, student_name, status, desired_start_date, branches(name), student_placement_cases(status, scheduled_start_date)')
    .order('created_at', { ascending: false })
    .limit(100)
  const review = (data ?? []).filter(row => row.status === 'PAID')
  const notice = staffFacingError(params.error)
  return (
    <RecruitmentShell title="CRM & Tuyển sinh" description="Tạo hồ sơ học viên tại quầy, chọn chương trình và theo dõi đến khi thanh toán đủ để chờ vào ca dạy." current="list">
      {notice && <p className={styles.error} role="alert">{notice}{params.error && params.error !== notice && <span className={styles.diagnostics}> Mã tham chiếu nằm trong hồ sơ, không phải trạng thái thành công.</span>}</p>}
      {error && <p className={styles.error} role="alert">Không tải được danh sách đăng ký.</p>}
      <section className={styles.panel}>
        <h2>Đăng ký đã tạo</h2>
        <p className={styles.muted}>Mở một mã để xem học phí, thanh toán và kết quả. Danh sách này không gộp trạng thái CRM.</p>
      </section>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Mã</th><th>Học viên</th><th>Chi nhánh</th><th>Trạng thái</th><th>Ngày muốn học</th><th>Hành động</th></tr></thead>
          <tbody>
            {(data ?? []).map(row => {
              const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
              const placement = Array.isArray(row.student_placement_cases) ? row.student_placement_cases[0] : row.student_placement_cases
              return (
                <tr key={row.id}>
                  <td><Link href={`/admin/business/registrations/${row.id}`}>{row.application_code}</Link></td>
                  <td>{row.student_name || '—'}</td>
                  <td>{branch?.name || '—'}</td>
                  <td><span className={styles.badge}>{registrationProgressLabel(row.status, placement?.status, placement?.scheduled_start_date)}</span></td>
                  <td>{row.desired_start_date || '—'}</td>
                  <td><Link href={`/admin/business/registrations/${row.id}`}>Mở hồ sơ</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!error && !data?.length && <p className={styles.empty}>Chưa có hồ sơ đăng ký.</p>}
      </div>
      <section className={styles.warn}>
        <h2>Đối soát tài chính</h2>
        <p>Hồ sơ đã nhận tiền nhưng chưa tạo học viên nằm ở đây. Hệ thống không tự hoàn tiền. Hủy hồ sơ sau khi đã nhận thanh toán bị chặn cho đến khi tài chính xử lý.</p>
        {error ? <p>Chưa kiểm tra được hàng đợi vì danh sách hồ sơ lỗi.</p> : review.length === 0 ? <p>Không có hồ sơ đang chờ đối soát.</p> : <ul>{review.map(row => <li key={row.id}><Link href={`/admin/business/registrations/${row.id}`}>{row.application_code}</Link> · {row.student_name}</li>)}</ul>}
      </section>
    </RecruitmentShell>
  )
}
