import Preview from './Preview'
import { payrollAction } from '../actions'
import { PayrollSubmit } from './Dialog'
import { statusLabels, type Head } from './model'
import styles from './payroll.module.css'

/** Preserves the current form/RPC contract, including maker-checker and emergency fields. */
export default function Workflow({ head, finance = false, canOverride = false, needsReview = false }: { head: Head; finance?: boolean; canOverride?: boolean; needsReview?: boolean }) {
  const transitions = head.status === 'GENERATED' ? ['DRAFT', 'REVIEW'] : head.status === 'REVIEW' ? ['DRAFT', 'APPROVED'] : head.status === 'APPROVED' ? ['FINALIZED'] : []
  return <div className={styles.formStack}>
    <p className={styles.small}>Các thao tác dưới đây dùng luồng và kiểm tra quyền đang có trong hệ thống. Lưu trạng thái không phải xác nhận đã chi tiền.</p>
    {needsReview && !['APPROVED', 'FINALIZED'].includes(head.status) && <div className={styles.alert}><div><strong>Có dữ liệu cần đối chiếu</strong><p>Chưa nên duyệt/chốt khi chưa xử lý các cảnh báo. Không đổi trạng thái chỉ để bỏ qua lỗi ngày hiệu lực.</p></div></div>}
    {!finance && !['APPROVED','FINALIZED'].includes(head.status) && <Preview period={head.id}/>}
    {transitions.length > 0 && <section className={styles.section}><h3>Kiểm tra và chuyển trạng thái</h3><form action={payrollAction} className={styles.formStack}>
      {finance && <input type="hidden" name="workspace" value="finance"/>}<input type="hidden" name="action" value="transition"/><input type="hidden" name="period" value={head.id}/><input type="hidden" name="version" value={head.version}/>
      <label className={styles.field}>Trạng thái tiếp theo<select name="status" required defaultValue=""><option value="" disabled>Chọn thao tác</option>{transitions.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
      <label className={styles.field}>Lý do / ghi chú kiểm tra<textarea name="note" required maxLength={2000} rows={3}/></label>
      {canOverride && ['REVIEW', 'APPROVED'].includes(head.status) && <details className={styles.details}><summary>Ngoại lệ khẩn cấp — SUPER_ADMIN</summary><p className={styles.note}>Không dùng để xử lý lỗi dữ liệu. Lý do và người thực hiện được lưu trong lịch sử.</p><label className={styles.check}><input type="checkbox" name="override_type" value="MAKER_CHECKER_EMERGENCY"/>Xác nhận dùng ngoại lệ khẩn cấp</label><label className={`${styles.field} ${styles.spaced}`}>Lý do ngoại lệ<input name="override_reason" maxLength={2000}/></label></details>}
      <label className={styles.check}><input type="checkbox" name="confirm" value="yes" required/>Tôi đã kiểm tra số liệu và xác nhận chuyển trạng thái.</label>
      <PayrollSubmit>Lưu trạng thái kỳ lương</PayrollSubmit>
    </form></section>}
    {head.status === 'FINALIZED' && <div className={styles.sourcebox}>Kỳ đã chốt. Không mở lại hoặc ghi đè dữ liệu gốc; sửa sai qua quy trình riêng.</div>}
  </div>
}
