import { adminClient, type Params } from '../finance/operations'
import { Notice, LoadError } from '../finance/_components/ui'
import { payrollAction } from './actions'
import { loadIndex } from './_ux/load'
import PayrollIndex from './_ux/Index'
import { PayrollSubmit } from './_ux/Dialog'
import styles from './_ux/payroll.module.css'

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams
  const db = await adminClient()
  let data
  try { data = await loadIndex(db, p) } catch { return <LoadError/> }
  const createForm = <form action={payrollAction} className={styles.formStack}>
    <input type="hidden" name="action" value="create"/>
    <label className={styles.field}>Chi nhánh kỳ lương<select name="branch" required defaultValue=""><option value="" disabled>Chọn chi nhánh</option>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label className={styles.field}>Tháng tính lương<input type="month" name="month" required/></label>
    <PayrollSubmit>Tạo / mở kỳ lương</PayrollSubmit>
  </form>
  return <><Notice params={p}/><PayrollIndex data={data} filters={p} createForm={createForm}/></>
}
