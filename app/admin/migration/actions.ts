'use server'
import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdminPermission } from '@/lib/authorization'
import { uuidPattern, validDate } from '../finance/operations'
import { columns, parseLegacyCsv } from './csv'

export async function uploadLegacy(form: FormData) {
  const db = await requireAdminPermission('migration.upload')
  const file = form.get('file'), source = String(form.get('source') ?? '').trim(), branch = String(form.get('branch') ?? ''), date = String(form.get('cutover') ?? '')
  let error = '', batch = ''
  try {
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv') || file.size > 500000 || !source || source.length > 100 || !uuidPattern.test(branch) || !validDate(date)) throw new Error('Kiểm tra tệp CSV, nguồn dữ liệu, chi nhánh và ngày chuyển đổi.')
    const bytes = Buffer.from(await file.arrayBuffer())
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    const rows = parseLegacyCsv(text)
    const result = await db.rpc('stage_legacy_batch', { p_source: source, p_filename: file.name, p_hash: createHash('sha256').update(bytes).digest('hex'), p_cutover: date, p_branch: branch, p_rows: rows, p_raw_csv: text })
    if (result.error) error = 'Không thể tiếp nhận. Kiểm tra quyền, ngày chuyển đổi và mã nguồn trùng.'
    else {
      batch = String(result.data)
      const validation = await db.rpc('validate_legacy_batch', { p_batch: batch })
      if (validation.error) error = 'Đã lưu nguồn nhưng chưa hoàn tất kiểm tra. Chạy lại kiểm tra batch.'
    }
  } catch (caught) { error = caught instanceof Error ? caught.message : 'Không thể đọc CSV.' }
  revalidatePath('/admin/migration')
  redirect('/admin/migration?' + new URLSearchParams({ ...(batch ? { batch } : {}), ...(error ? { error } : { success: 'Đã tiếp nhận và kiểm tra vào khu vực chờ duyệt. Chưa ghi dữ liệu nghiệp vụ.' }) }))
}

export async function reviewLegacy(form: FormData) {
  const db = await requireAdminPermission('migration.upload')
  const id = String(form.get('row') ?? ''), batch = String(form.get('batch') ?? ''), version = Number(form.get('version')), action = String(form.get('action') ?? ''), reason = String(form.get('reason') ?? '').trim()
  let error = '', outcome = ''
  if (!uuidPattern.test(id) || !uuidPattern.test(batch) || !Number.isSafeInteger(version) || version < 1 || !reason || reason.length > 2000 || !['MAP', 'VALIDATE', 'IDENTITY', 'ACADEMIC', 'FINANCE', 'REJECT', 'IMPORT', 'ROLLBACK_REQUEST', 'ROLLBACK_APPROVE'].includes(action) || form.get('confirm') !== 'yes') error = 'Vui lòng kiểm tra thao tác, lý do và xác nhận.'
  if (!error) {
    try {
      const payload = action === 'MAP' ? Object.fromEntries(columns.map(key => [key, String(form.get(key) ?? '').trim()])) : null
      const result = action.startsWith('ROLLBACK_')
        ? await db.rpc('rollback_legacy_row', { p_row: id, p_approve: action === 'ROLLBACK_APPROVE', p_reason: reason })
        : action === 'IMPORT'
        ? await db.rpc('import_legacy_row', { p_row: id, p_version: version })
        : await db.rpc('review_legacy_row', { p_row: id, p_version: version, p_action: action, p_reason: reason, p_payload: payload })
      if (result.error) {
        if (action === 'IMPORT') await db.rpc('record_legacy_import_failure', { p_row: id, p_version: version, p_code: result.error.code })
        error = action.startsWith('ROLLBACK_') ? 'Chưa thể rollback: kiểm tra người yêu cầu, người duyệt độc lập, nghiệm thu và hoạt động mới. Dữ liệu đã nhập được giữ nguyên.' : 'Chưa thể xử lý: kiểm tra mapping, phê duyệt độc lập và phiên bản dữ liệu. Tải lại trạng thái trước khi thử lại.'
      }
      else if (result.data === 'BLOCKED') error = 'Không được rollback vì dữ liệu đã có hoạt động mới hoặc thay đổi. Cần quy trình correction; dữ liệu nghiệp vụ được giữ nguyên.'
      else outcome = action === 'IMPORT' ? 'Đã nhập và đối soát học viên.' : 'Đã lưu kết quả kiểm tra. Xem trạng thái và các vấn đề bên dưới.'
    } catch { error = 'Chưa xác nhận được kết quả. Tải lại trước khi thử lại.' }
  }
  revalidatePath('/admin/migration')
  redirect('/admin/migration?' + new URLSearchParams({ ...(uuidPattern.test(batch) ? { batch } : {}), ...(uuidPattern.test(id) ? { selected: id } : {}), ...(error ? { error } : { success: outcome }) }))
}

export async function batchLegacy(form: FormData) {
  const db = await requireAdminPermission('migration.import')
  const batch = String(form.get('batch') ?? ''), action = String(form.get('action') ?? ''), reason = String(form.get('reason') ?? '').trim()
  let error = '', count = 0
  if (!uuidPattern.test(batch) || !['IMPORT_READY', 'SIGN_OFF', 'VALIDATE_BATCH'].includes(action) || !reason || reason.length > 2000 || form.get('confirm') !== 'yes') error = 'Kiểm tra thao tác, lý do và xác nhận.'
  if (!error) {
    try {
      if (action === 'VALIDATE_BATCH') {
        const result = await db.rpc('validate_legacy_batch', { p_batch: batch })
        if (result.error) error = 'Chưa hoàn tất kiểm tra batch.'
        else count = Number(result.data)
      } else if (action === 'SIGN_OFF') {
        const result = await db.rpc('sign_off_legacy_batch', { p_batch: batch, p_reason: reason })
        if (result.error) error = 'Chưa thể nghiệm thu: còn dòng chưa xử lý hoặc đối soát chưa khớp.'
      } else {
        const rows = await db.from('migration_batch_rows').select('id,version').eq('batch_id', batch).eq('status', 'READY').order('row_number').limit(25)
        if (rows.error) error = 'Không tải được các dòng đã duyệt.'
        else for (const row of rows.data ?? []) {
          // Separate RPC calls are separate transactions: a failure cannot erase earlier students.
          const result = await db.rpc('import_legacy_row', { p_row: row.id, p_version: row.version })
          if (result.error) {
            await db.rpc('record_legacy_import_failure', { p_row: row.id, p_version: row.version, p_code: result.error.code })
            error = `Đã nhập ${count} dòng; dòng tiếp theo cần kiểm tra trước khi tiếp tục. Không nhập lại các dòng đã thành công.`; break
          }
          count++
        }
      }
    } catch { error = 'Chưa xác nhận được kết quả. Tải lại trạng thái trước khi tiếp tục; không tự gửi lại toàn bộ tệp.' }
  }
  revalidatePath('/admin/migration')
  redirect('/admin/migration?' + new URLSearchParams({ ...(uuidPattern.test(batch) ? { batch } : {}), ...(error ? { error } : { success: action === 'SIGN_OFF' ? 'Đã nghiệm thu batch đối soát khớp.' : action === 'VALIDATE_BATCH' ? `Đã kiểm tra ${count} dòng; chưa ghi dữ liệu nghiệp vụ.` : `Đã nhập ${count} dòng đã duyệt. Có thể tiếp tục phần còn lại.` }) }))
}
