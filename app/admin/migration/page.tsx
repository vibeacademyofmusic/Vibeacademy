import Link from 'next/link'
import { requireAdminPermission } from '@/lib/authorization'
import { Confirm, Field, LoadError, Notice, Pager, Panel, Select, Table, inputClass } from '../finance/_components/ui'
import { pageNumber, uuidPattern, type Params } from '../finance/operations'
import { columns, fieldLabels, statusLabels } from './csv'
import { batchLegacy, reviewLegacy, uploadLegacy } from './actions'

type Row = { id: string; row_number: number; version: number; status: string; source_reference: string; normalized_payload: Record<string, string>; raw_payload: Record<string, string>; validation_result: string[]; last_import_error: string | null }
export default async function MigrationPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await requireAdminPermission('migration.upload')
  const [batches, branches] = await Promise.all([
    db.from('migration_batches').select('id,source_system,source_file_name,cutover_date,signed_off_at').order('created_at', { ascending: false }).limit(50),
    db.from('branches').select('id,name').eq('status', 'ACTIVE').order('name'),
  ])
  if (batches.error || branches.error) return <LoadError />
  const batch = uuidPattern.test(params.batch ?? '') ? params.batch! : batches.data?.[0]?.id
  const page = pageNumber(params.page)
  let rowQuery = db.from('migration_batch_rows').select('id,row_number,version,status,source_reference,normalized_payload')
  if (params.status && params.status in statusLabels) rowQuery = rowQuery.eq('status', params.status)
  const rows = batch ? await rowQuery.eq('batch_id', batch).order('row_number').range((page - 1) * 25, page * 25).returns<Row[]>() : { data: [], error: null }
  const selectedRows = batch && uuidPattern.test(params.selected ?? '') ? await db.from('migration_batch_rows').select('id,row_number,version,status,source_reference,normalized_payload,raw_payload,validation_result,last_import_error').eq('batch_id', batch).eq('id', params.selected!).limit(1).returns<Row[]>() : { data: [], error: null }
  const counts = batch ? await db.from('migration_batch_counts').select('status,row_count,failed_attempt_rows').eq('batch_id', batch) : { data: [], error: null }
  const reconciliation = batch ? await db.from('migration_reconciliation').select('row_id,status,imported_amount,imported_paid,imported_outstanding,currency,amount_difference,paid_difference,outstanding_difference').eq('batch_id', batch).limit(500) : { data: [], error: null }
  const preview = batch ? await db.from('migration_dry_run_summary').select('currency,expected_students,expected_enrollments,expected_academic_baselines,expected_tuition_terms,expected_new_amount,expected_new_paid,expected_new_outstanding,exact_matches,strong_matches,possible_duplicates').eq('batch_id', batch) : { data: [], error: null }
  if (rows.error || reconciliation.error || selectedRows.error || counts.error || preview.error) return <LoadError />
  const selected = selectedRows.data?.[0]
  return <div className="min-w-0 space-y-6">
    <h1 className="text-3xl font-bold">Chuyển dữ liệu học viên</h1><Notice params={params} />
    <p>Dữ liệu chưa xác định lớp chỉ nằm trong khu vực chờ duyệt. Không tạo lớp giả, enrollment hoặc ghi công nợ trước khi duyệt đầy đủ.</p>
    <Panel title="Tiếp nhận CSV"><form action={uploadLegacy} className="grid gap-4 sm:grid-cols-2">
      <Field name="source" label="Tên hệ thống nguồn" /><Field name="cutover" label="Ngày chuyển đổi (Việt Nam)" type="date" />
      <Select name="branch" label="Chi nhánh của tệp" options={branches.data ?? []} required />
      <label className="block text-sm">Tệp CSV UTF-8, tối đa 500 học viên<input className={inputClass} type="file" name="file" accept=".csv,text/csv" required /></label>
      <button className="rounded bg-gray-900 px-4 py-2 text-white">Tiếp nhận để kiểm tra</button>
    </form><details><summary>Cột mẫu V1</summary><p className="break-all text-sm">{columns.join(',')}</p><p className="text-sm">Ngày YYYY-MM-DD, tiền không có dấu phân cách hàng nghìn. Có thể để mã lớp trống để chờ xác minh. Học viên: ACTIVE / PAUSED / INACTIVE. Học phí: ACTIVE / PAUSED / EXPIRED / CANCELLED. Bảo lưu cần ngày bắt đầu, kết thúc và ngày hiệu lực đã xác minh; không tạo lịch sử bảo lưu cũ.</p></details></Panel>
    <Panel title="Các tệp gần nhất"><div className="flex flex-wrap gap-3">{batches.data?.map(item => <Link key={item.id} prefetch={false} className="underline" href={'/admin/migration?batch=' + item.id}>{item.source_system} — {item.source_file_name} ({item.cutover_date})</Link>)}</div></Panel>
    <Panel title="Hàng đợi kiểm tra"><p>{counts.data?.map(item => `${statusLabels[item.status]}: ${item.row_count}${Number(item.failed_attempt_rows) ? ` (lần nhập lỗi: ${item.failed_attempt_rows})` : ''}`).join(' · ')}</p>
      <form className="flex flex-wrap items-end gap-3"><input type="hidden" name="batch" value={batch ?? ''} /><Select name="status" label="Lọc trạng thái" value={params.status} options={Object.entries(statusLabels).map(([id, name]) => ({ id, name }))} /><button className="rounded border px-4 py-2">Lọc</button></form>
      <Table headers={['Dòng', 'Mã nguồn', 'Học viên', 'Trạng thái', 'Thao tác']} rows={(rows.data ?? []).slice(0, 25).map(row => [row.row_number, row.source_reference, row.normalized_payload.full_name, statusLabels[row.status], <Link key={row.id} prefetch={false} className="underline" href={`/admin/migration?batch=${batch}&selected=${row.id}&page=${page}`}>Kiểm tra dòng {row.row_number}</Link>])} />
      <Pager path="/admin/migration" params={{ ...params, batch }} page={page} more={(rows.data?.length ?? 0) > 25} /></Panel>
    <Panel title="Dự kiến trước khi nhập"><p>Chỉ dự kiến cho dòng đã kiểm tra hợp lệ, chưa nhập. Mỗi đơn vị gồm học viên, ghi danh, chương trình và kỳ học phí; chưa tạo dữ liệu nghiệp vụ. Trùng mã nguồn không nhập thêm; trùng mã học viên hoặc nghi trùng tên phải được kiểm tra, không tự gộp.</p><Table headers={['Tiền tệ', 'Học viên mới', 'Ghi danh mới', 'Chương trình mới', 'Kỳ học phí mới', 'Học phí mở sổ mới', 'Đã trả đầu kỳ', 'Công nợ', 'Trùng mã nguồn', 'Trùng mã học viên', 'Nghi trùng tên']} rows={(preview.data ?? []).map(row => [row.currency ?? '—', row.expected_students, row.expected_enrollments, row.expected_academic_baselines, row.expected_tuition_terms, row.expected_new_amount, row.expected_new_paid, row.expected_new_outstanding, row.exact_matches, row.strong_matches, row.possible_duplicates])} /></Panel>
    {batch && <Panel title="Xử lý batch"><p>{batches.data?.find(item => item.id === batch)?.signed_off_at ? 'Batch đã nghiệm thu.' : 'Mỗi lần nhập tối đa 25 dòng đã duyệt, mỗi học viên là một giao dịch riêng. Khi có lỗi, dừng tại dòng lỗi và giữ các dòng đã thành công.'}</p>
      <form action={batchLegacy} className="space-y-3"><input type="hidden" name="batch" value={batch} />
        <Select name="action" label="Thao tác batch" required options={[{ id: 'VALIDATE_BATCH', name: 'Chạy lại kiểm tra toàn batch' }, { id: 'IMPORT_READY', name: 'Nhập các dòng đã duyệt / tiếp tục' }, { id: 'SIGN_OFF', name: 'Nghiệm thu sau đối soát' }]} />
        <Field name="reason" label="Kết quả kiểm tra batch" /><Confirm text="Đã kiểm tra trạng thái và số tiền; nghiệm thu chỉ được phép khi không còn dòng cần xử lý và mọi chênh lệch bằng 0." /><button className="rounded border px-4 py-2">Xử lý batch</button>
      </form></Panel>}
    {selected && <Panel title={`Kiểm tra ${selected.source_reference}`}>
      <p>{statusLabels[selected.status]} — phiên bản {selected.version}</p>
      {selected.last_import_error && <p role="alert">Lần nhập trước chưa thành công. Kiểm tra dữ liệu và mapping trước khi tiếp tục; các dòng đã nhập không cần nhập lại.</p>}
      {!!selected.validation_result.length && <ul role="alert" className="list-inside list-disc text-amber-900">{selected.validation_result.map(code => <li key={code}>{code === 'CLASS_MAPPING_REQUIRED' || code === 'CLASS_MAPPING_INVALID' ? 'Cần xác nhận mã lớp hợp lệ trong chi nhánh.' : code === 'FINANCE_RECONCILIATION_MISMATCH' ? 'Số tiền không khớp giá tính hoặc công nợ đầu kỳ.' : code === 'ACADEMIC_MAPPING_INVALID' ? 'Chương trình / cấp độ chưa khớp lớp.' : `Cần kiểm tra: ${code}`}</li>)}</ul>}
      <details><summary>Dữ liệu gốc (chỉ đọc)</summary><Table headers={['Trường', 'Giá trị nguồn']} rows={columns.map(key => [fieldLabels[key], selected.raw_payload[key] ?? ''])} /></details>
      {!['IMPORTED', 'ROLLED_BACK'].includes(selected.status) && <>
        <form action={reviewLegacy} className="space-y-4"><input type="hidden" name="row" value={selected.id} /><input type="hidden" name="batch" value={batch} /><input type="hidden" name="version" value={selected.version} /><input type="hidden" name="action" value="MAP" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{columns.map(key => <Field key={key} name={key} label={fieldLabels[key]} value={selected.normalized_payload[key] ?? ''} required={!['class_code', 'discount_name', 'base_ends_on', 'effective_ends_on', 'pause_starts_on', 'pause_ends_on'].includes(key)} />)}</div>
          <Field name="reason" label="Căn cứ xác minh / sửa mapping" /><Confirm text="Lưu mapping sẽ hủy phê duyệt cũ; dữ liệu nguồn được giữ nguyên." /><button className="rounded border px-4 py-2">Lưu mapping đã xác minh</button>
        </form>
        <form action={reviewLegacy} className="space-y-3"><input type="hidden" name="row" value={selected.id} /><input type="hidden" name="batch" value={batch} /><input type="hidden" name="version" value={selected.version} />
          <Select name="action" label="Thao tác kiểm tra" required options={[{ id: 'VALIDATE', name: 'Chạy kiểm tra dữ liệu' }, { id: 'IDENTITY', name: 'Duyệt thông tin học viên' }, { id: 'ACADEMIC', name: 'Duyệt lớp / chương trình / cấp độ' }, { id: 'FINANCE', name: 'Duyệt tài chính (người độc lập)' }, { id: 'REJECT', name: 'Từ chối dòng' }, ...(selected.status === 'READY' ? [{ id: 'IMPORT', name: 'Nhập học viên đã duyệt' }] : [])]} />
          <Field name="reason" label="Lý do / kết quả đối chiếu" /><Confirm text="Đã đối chiếu nguồn; chỉ thao tác Nhập mới ghi dữ liệu nghiệp vụ." /><button className="rounded bg-gray-900 px-4 py-2 text-white">Thực hiện</button>
        </form></>}
      {selected.status === 'IMPORTED' && <form action={reviewLegacy} className="space-y-3 rounded border border-amber-200 p-4">
        <p>Rollback chỉ áp dụng trước nghiệm thu và trước hoạt động mới. Người yêu cầu không tự duyệt; lịch sử được giữ bằng bản đảo số dư, không bị xóa.</p>
        <input type="hidden" name="row" value={selected.id} /><input type="hidden" name="batch" value={batch} /><input type="hidden" name="version" value={selected.version} />
        <Select name="action" label="Rollback có kiểm soát" required options={[{ id: 'ROLLBACK_REQUEST', name: 'Gửi yêu cầu rollback' }, { id: 'ROLLBACK_APPROVE', name: 'Duyệt yêu cầu của người khác' }]} />
        <Field name="reason" label="Lý do rollback / kết quả kiểm tra" /><Confirm text="Đã kiểm tra hoạt động sau chuyển đổi; nếu có hoạt động mới phải dùng correction." /><button className="rounded border px-4 py-2">Xử lý yêu cầu rollback</button>
      </form>}
    </Panel>}
    <Panel title="Đối soát các dòng đã nhập"><p>Tiền mở sổ không phải tiền thu mới. Mọi chênh lệch phải bằng 0; dòng chưa nhập chưa có số tiền nghiệp vụ. Dòng đã đảo hiển thị số gốc để lưu lịch sử; số dư hiện hành của dòng đó bằng 0.</p><Table headers={['Trạng thái', 'Tiền tệ', 'Học phí', 'Đã trả đầu kỳ', 'Công nợ', 'Lệch học phí', 'Lệch đã trả', 'Lệch công nợ']} rows={(reconciliation.data ?? []).map(row => [statusLabels[row.status], row.currency ?? '—', row.imported_amount ?? '—', row.imported_paid ?? '—', row.imported_outstanding ?? '—', row.amount_difference ?? '—', row.paid_difference ?? '—', row.outstanding_difference ?? '—'])} /></Panel>
  </div>
}
