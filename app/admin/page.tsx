import Link from 'next/link'
import {
  loadExecutiveDashboard,
  markedAttendanceLabels,
  staffStatusLabels,
  type ActionGroup,
  type ExecutiveDashboard,
  type MoneyValue,
} from './_lib/dashboard-data'
import styles from './dashboard.module.css'

const groups: { id: ActionGroup; label: string }[] = [
  { id: 'NEEDS_ACTION', label: 'Cần xử lý' },
  { id: 'OVERDUE', label: 'Quá hạn' },
  { id: 'REVIEW', label: 'Cần rà soát' },
]

export default async function AdminDashboardPage() {
  return <ExecutiveDashboardView data={await loadExecutiveDashboard()} />
}

function markedTotal(data: ExecutiveDashboard) {
  const values = markedAttendanceLabels.map(([key]) => data.attendance[key])
  if (values.some(value => value == null)) return null
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

function countText(value: number | null) {
  return value == null ? 'Không tải được' : String(value)
}

function moneyText(value: MoneyValue) {
  return value.text ?? 'Không tải được'
}

function emphasis(value: number | null, exception = false) {
  if (value == null) return ''
  if (value === 0) return styles.quiet
  return exception ? styles.hot : ''
}

function ExecutiveDashboardView({ data }: { data: ExecutiveDashboard }) {
  const attendanceNote = markedAttendanceLabels
    .map(([key, label]) => `${label} ${countText(data.attendance[key])}`)
    .join(' · ')
  const lessonNote = `Sắp học ${countText(data.lessons.scheduled)} · Đã xong ${countText(data.lessons.completed)} · Đã hủy ${countText(data.lessons.cancelled)} · Học bù ${countText(data.lessons.makeup)}`
  const needsAttention = typeof data.needsAction === 'number' && data.needsAction > 0

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>EXECUTIVE OVERVIEW</p>
          <h1 className={styles.title}>Bảng điều hành VIBE</h1>
          <p className={styles.sub}>Ngày vận hành {data.businessDateLabel} · Giờ Việt Nam</p>
        </div>
        <p className={styles.scope}>{data.scope}</p>
      </header>

      <section className={styles.metrics} aria-label="Chỉ số điều hành">
        <Link className={styles.metric} href={data.links.attendance} prefetch={false}>
          <span className={styles.metricLabel}>Buổi học hôm nay</span>
          <strong className={styles.metricValue}>{countText(data.lessons.total)}</strong>
          <span className={styles.metricNote}>{lessonNote}</span>
        </Link>
        <Link className={styles.metric} href={data.links.attendance} prefetch={false}>
          <span className={styles.metricLabel}>Điểm danh đã ghi</span>
          <strong className={styles.metricValue}>{countText(markedTotal(data))}</strong>
          <span className={styles.metricNote}>{attendanceNote}. Không tính buổi chưa điểm danh là vắng.</span>
        </Link>
        <Link className={styles.metric} href={data.links.finance} prefetch={false}>
          <span className={styles.metricLabel}>Học phí đã thu tháng này</span>
          <strong className={styles.metricValue}>{moneyText(data.finance.collected)}</strong>
          <span className={styles.metricNote}>Tháng {data.monthLabel}. Tiền đã thu.{data.finance.collectedChange ? ` ${data.finance.collectedChange}.` : ''}</span>
        </Link>
        <Link className={styles.metric} href={data.links.studentsActive} prefetch={false}>
          <span className={styles.metricLabel}>Học viên đang hoạt động</span>
          <strong className={styles.metricValue}>{countText(data.students.active)}</strong>
          <span className={styles.metricNote}>Nhập học trong tháng {countText(data.students.admittedThisMonth)}</span>
        </Link>
        <a className={needsAttention ? `${styles.metric} ${styles.metricAttention}` : styles.metric} href="#action-center">
          <span className={styles.metricLabel}>Việc cần xử lý</span>
          <strong className={styles.metricValue}>{countText(data.needsAction)}</strong>
          <span className={styles.metricNote}>{data.needsActionNote ?? 'Tổng các hàng đợi đang hiện ở mục việc cần làm.'}</span>
        </a>
      </section>

      <section className={styles.split}>
        <section className={styles.panel} id="action-center">
          <div className={styles.panelHead}>
            <p className={styles.eyebrow}>OPERATIONS</p>
            <h2>Việc cần làm</h2>
            <p>Các hàng đợi đang mở. Số trên mỗi dòng là số việc của hàng đợi đó.</p>
          </div>
          {data.actions.length === 0 ? (
            <div className={styles.empty}>
              <strong>Không có việc cần xử lý</strong>
              <p>Không có hàng đợi đang chờ.</p>
            </div>
          ) : groups.map(group => {
            const items = data.actions.filter(item => item.group === group.id)
            if (!items.length) return null
            return (
              <div key={group.id}>
                <p className={styles.groupLabel}>{group.label}</p>
                {items.map(item => (
                  <Link className={styles.actionCard} key={item.title} href={item.href} prefetch={false}>
                    <div className={styles.actionTop}>
                      <strong>{item.title}</strong>
                      <span className={item.count != null && item.count > 0 ? `${styles.actionCount} ${styles.actionCountHot}` : styles.actionCount}>
                        {item.count == null ? '—' : item.count}
                      </span>
                    </div>
                    <p className={styles.actionDesc}>{item.context}</p>
                    <p className={styles.actionDesc}>{item.branch}{item.when ? ` · ${item.when}` : ''}</p>
                  </Link>
                ))}
              </div>
            )
          })}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.eyebrow}>TODAY</p>
            <h2>Vận hành hôm nay</h2>
          </div>
          <div className={styles.body}>
            <div className={styles.rows}>
              <div className={styles.row}><span>Tổng buổi</span><strong className={emphasis(data.lessons.total)}>{countText(data.lessons.total)}</strong></div>
              <div className={styles.row}><span>Sắp học</span><strong className={emphasis(data.lessons.scheduled)}>{countText(data.lessons.scheduled)}</strong></div>
              <div className={styles.row}><span>Đã xong</span><strong className={emphasis(data.lessons.completed)}>{countText(data.lessons.completed)}</strong></div>
              <div className={styles.row}><span>Đã hủy</span><strong className={emphasis(data.lessons.cancelled)}>{countText(data.lessons.cancelled)}</strong></div>
              <div className={styles.row}><span>Học bù</span><strong className={emphasis(data.lessons.makeup)}>{countText(data.lessons.makeup)}</strong></div>
              <div className={styles.row}><span>Chưa có giáo viên</span><strong className={emphasis(data.lessons.unassigned, true)}>{countText(data.lessons.unassigned)}</strong></div>
            </div>
            <Link className={styles.button} href={data.links.attendance} prefetch={false}>Mở điểm danh</Link>
            <Link className={`${styles.button} ${styles.buttonQuiet}`} href="/admin/session-teachers" prefetch={false}>Phân công giáo viên</Link>
          </div>
        </section>
      </section>

      <section className={styles.pair}>
        <section className={styles.sideCard}>
          <p className={styles.eyebrow}>FINANCE</p>
          <h2 className={styles.sideTitle}>Tài chính tháng {data.monthLabel}</h2>
          <p className={styles.actionDesc}>Các số đứng riêng. Không cộng thành một dòng tiền.</p>
          <div className={styles.rows}>
            <div className={styles.row}><span>Tiền học phí đã thu</span><strong>{moneyText(data.finance.collected)}</strong></div>
            <div className={styles.row}><span>Công nợ hóa đơn đang mở</span><strong>{moneyText(data.finance.invoiceReceivables)}</strong></div>
            <div className={styles.row}><span>Công nợ mở sổ còn lại</span><strong>{moneyText(data.finance.openingReceivables)}</strong></div>
            <div className={styles.row}><span>Công nợ hóa đơn quá hạn</span><strong>{moneyText(data.finance.overdueReceivables)}</strong></div>
            <div className={styles.row}><span>Chi phí vận hành đã ghi</span><strong>{moneyText(data.finance.recordedOperatingExpenses)}</strong></div>
          </div>
          <div className={styles.links}>
            <Link className={styles.link} href={data.links.finance} prefetch={false}>Báo cáo tài chính</Link>
            <Link className={styles.link} href={data.links.receivablesOverdue} prefetch={false}>Công nợ quá hạn</Link>
            <Link className={styles.link} href="/admin/finance/operating-expenses" prefetch={false}>Chi phí vận hành</Link>
          </div>
        </section>
        <section className={styles.sideCard}>
          <p className={styles.eyebrow}>BUSINESS</p>
          <h2 className={styles.sideTitle}>Kinh doanh & CRM</h2>
          <div className={styles.rows}>
            <div className={styles.row}><span>Follow-up quá hạn</span><strong className={emphasis(data.crm.followUpOverdue, true)}>{countText(data.crm.followUpOverdue)}</strong></div>
            <div className={styles.row}><span>Follow-up hôm nay</span><strong>{countText(data.crm.followUpToday)}</strong></div>
            <div className={styles.row}><span>Chưa liên hệ</span><strong className={emphasis(data.crm.uncontacted, true)}>{countText(data.crm.uncontacted)}</strong></div>
            <div className={styles.row}><span>Học thử hôm nay</span><strong>{countText(data.crm.trialToday)}</strong></div>
            <div className={styles.row}><span>Phản hồi điểm thấp chưa đóng</span><strong className={emphasis(data.feedbackOpen, true)}>{countText(data.feedbackOpen)}</strong></div>
          </div>
          <div className={styles.links}>
            <Link className={styles.link} href="/admin/business" prefetch={false}>Điều hành kinh doanh</Link>
            <Link className={styles.link} href="/admin/business/crm?queue=overdue" prefetch={false}>CRM quá hạn</Link>
            <Link className={styles.link} href="/admin/feedback?review=yes" prefetch={false}>Phản hồi cần xử lý</Link>
          </div>
        </section>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <p className={styles.eyebrow}>BRANCH OPERATIONS</p>
          <h2>Vận hành theo chi nhánh</h2>
        </div>
        {data.branches.length === 0 ? (
          <div className={styles.empty}>
            <strong>Chưa có chi nhánh để hiển thị</strong>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Chi nhánh</th>
                  <th>Buổi học hôm nay</th>
                  <th>Cảnh báo chuyên cần</th>
                  <th>Hóa đơn quá hạn</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map(branch => (
                  <tr key={branch.id}>
                    <td>{branch.name}</td>
                    <td><Link href={`/admin/attendance?date=${data.businessDate}&branch=${branch.id}`} prefetch={false}><span className={emphasis(branch.lessons)}>{countText(branch.lessons)}</span></Link></td>
                    <td><Link href={`/admin/attendance/retention?branch=${branch.id}`} prefetch={false}><span className={emphasis(branch.retention, true)}>{countText(branch.retention)}</span></Link></td>
                    <td><Link href={`/admin/finance/receivables?receivable=OVERDUE&branch=${branch.id}`} prefetch={false}><span className={emphasis(branch.overdueInvoices, true)}>{countText(branch.overdueInvoices)}</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.pair}>
        <section className={styles.sideCard}>
          <p className={styles.eyebrow}>ACADEMIC</p>
          <h2 className={styles.sideTitle}>Học thuật</h2>
          <div className={styles.rows}>
            <div className={styles.row}><span>Báo cáo chờ duyệt</span><strong className={emphasis(data.academic.reportsReadyForReview, true)}>{countText(data.academic.reportsReadyForReview)}</strong></div>
            <div className={styles.row}><span>Bài đánh giá chờ chấm</span><strong className={emphasis(data.academic.attemptsPendingReview, true)}>{countText(data.academic.attemptsPendingReview)}</strong></div>
          </div>
          <div className={styles.links}>
            <Link className={styles.link} href="/admin/reports/learning?status=READY_FOR_REVIEW" prefetch={false}>Báo cáo học tập</Link>
            <Link className={styles.link} href="/admin/elearning/assessments" prefetch={false}>Đề đánh giá và chấm bài</Link>
          </div>
        </section>
        <section className={styles.sideCard}>
          <p className={styles.eyebrow}>PEOPLE</p>
          <h2 className={styles.sideTitle}>Nhân sự</h2>
          <div className={styles.pills}>
            {Object.entries(staffStatusLabels).map(([status, label]) => (
              <span className={status === 'UNAUTHORIZED_ABSENCE' && (data.staff.attendance[status] ?? 0) > 0 ? `${styles.pill} ${styles.hot}` : styles.pill} key={status}>
                {label} {countText(data.staff.attendance[status])}
              </span>
            ))}
          </div>
          <div className={styles.rows}>
            <div className={styles.row}><span>Yêu cầu chưa duyệt</span><strong className={emphasis(data.staff.pendingRequests, true)}>{countText(data.staff.pendingRequests)}</strong></div>
            <div className={styles.row}><span>Kỳ lương đang kiểm tra</span><strong className={emphasis(data.staff.payrollInReview, true)}>{countText(data.staff.payrollInReview)}</strong></div>
          </div>
          <div className={styles.links}>
            <Link className={styles.link} href="/admin/hr/attendance" prefetch={false}>Chấm công</Link>
            <Link className={styles.link} href="/admin/employees/leave-requests" prefetch={false}>Yêu cầu nghỉ phép</Link>
            <Link className={styles.link} href="/admin/payroll?status=REVIEW" prefetch={false}>Kỳ lương</Link>
            <Link className={styles.link} href="/admin/hr/teaching" prefetch={false}>Đối soát buổi dạy</Link>
          </div>
        </section>
      </section>

      <section className={styles.pair}>
        <section className={styles.sideCard}>
          <p className={styles.eyebrow}>STUDENTS</p>
          <h2 className={styles.sideTitle}>Tình trạng học viên</h2>
          <div className={styles.rows}>
            <div className={styles.row}><span>Đang hoạt động</span><strong>{countText(data.students.active)}</strong></div>
            <div className={styles.row}><span>Hồ sơ bảo lưu</span><strong>{countText(data.students.paused)}</strong></div>
            <div className={styles.row}><span>Hồ sơ ngưng</span><strong>{countText(data.students.inactive)}</strong></div>
            <div className={styles.row}><span>Hồ sơ tốt nghiệp</span><strong>{countText(data.students.graduated)}</strong></div>
            <div className={styles.row}><span>Hồ sơ lưu trữ</span><strong>{countText(data.students.archived)}</strong></div>
            <div className={styles.row}><span>Ghi danh đang bảo lưu hôm nay</span><strong>{countText(data.students.pausedEnrollmentsToday)}</strong></div>
            <div className={styles.row}><span>Nhập học trong tháng</span><strong>{countText(data.students.admittedThisMonth)}</strong></div>
            <div className={styles.row}><span>Nhắc gia hạn đang chờ</span><strong className={emphasis(data.remindersPending, true)}>{countText(data.remindersPending)}</strong></div>
            <div className={styles.row}><span>Cảnh báo chuyên cần đang mở</span><strong className={emphasis(data.retentionOpen, true)}>{countText(data.retentionOpen)}</strong></div>
          </div>
          <div className={styles.links}>
            <Link className={styles.link} href={data.links.studentsActive} prefetch={false}>Học viên đang hoạt động</Link>
            <Link className={styles.link} href="/admin/tuition/reminders" prefetch={false}>Nhắc học phí</Link>
            <Link className={styles.link} href="/admin/attendance/retention" prefetch={false}>Cảnh báo chuyên cần</Link>
          </div>
        </section>
        <section className={styles.sideCard}>
          <p className={styles.eyebrow}>LEARNING</p>
          <h2 className={styles.sideTitle}>Học trực tuyến & kiểm tra</h2>
          <div className={styles.rows}>
            <div className={styles.row}><span>Bài chờ chấm</span><strong className={emphasis(data.academic.attemptsPendingReview, true)}>{countText(data.academic.attemptsPendingReview)}</strong></div>
            <div className={styles.row}><span>Quyền học đang hiệu lực</span><strong>{countText(data.activeGrants)}</strong></div>
          </div>
          <div className={styles.links}>
            <Link className={styles.link} href="/admin/elearning/assessments" prefetch={false}>Chấm bài</Link>
            <Link className={styles.link} href="/admin/elearning" prefetch={false}>Nội dung học trực tuyến</Link>
          </div>
        </section>
      </section>
    </div>
  )
}
