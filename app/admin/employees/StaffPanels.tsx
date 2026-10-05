import Link from 'next/link'
import { NameCard } from '@/app/documents/staff-cards/NameCard'
import { loadStaffFace, searchIdentity } from './staff-data'
import { assignPosition, assignTeaching, endPosition, endTeaching, removePortrait, replacePortrait } from './staff-actions'
import { linkIdentity } from './actions'
import { createClient } from '@/lib/supabase/server'
import { vietnamToday, STAFF_POSITIONS, positionBadgeLabel } from '@/lib/staff/profile'

const capacities = [
  { id: 'TEACHER', name: 'Giáo viên' },
  { id: 'ASSISTANT', name: 'Trợ giảng' },
]

export async function StaffPanels({ employeeId, profileId, teacherId, identityQuery }: { employeeId: string; profileId: string | null; teacherId: string | null; identityQuery: string }) {
  const db = await createClient()
  let face: Awaited<ReturnType<typeof loadStaffFace>>
  try {
    face = await loadStaffFace(db, employeeId)
  } catch {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Chưa tải được năng lực, vị trí hoặc thẻ nhân sự.</p>
  }
  const matches = identityQuery ? await searchIdentity(db, identityQuery) : []
  const today = vietnamToday()
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--vibe-navy)]">Thẻ nhân sự</h3>
            <p className="text-sm text-[var(--vibe-muted)]">Thẻ được tạo từ dữ liệu đã lưu. Ảnh tải lên là chân dung, không phải nền thẻ có sẵn.</p>
          </div>
          <Link className="vibe-button" href={`/documents/staff-cards/${employeeId}`}>Xem, in và tải PDF</Link>
        </div>
        <NameCard employeeId={employeeId} card={face.facts} portraitUrl={face.portraitUrl} />
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--vibe-line)] bg-white p-5">
        <h3 className="text-lg font-semibold text-[var(--vibe-navy)]">Năng lực giảng dạy theo môn</h3>
        <p className="text-sm text-[var(--vibe-muted)]">Mỗi huy hiệu gồm năng lực và môn. Có thể giữ nhiều môn, kể cả khác năng lực. Không cấp quyền tài khoản và không quyết định lương.</p>
        <div className="flex flex-wrap gap-2">
          {face.facts.teachingBadges.length ? face.facts.teachingBadges.map(badge => <span key={badge} className="vibe-badge" data-tone="info">{badge}</span>) : <span className="text-sm text-[var(--vibe-muted)]">Chưa có năng lực đang hiệu lực.</span>}
        </div>
        <form action={assignTeaching} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="vibe-field"><span>Môn học</span>
            <select name="subject_id" required defaultValue="">
              <option value="" disabled>Chọn trong danh mục</option>
              {face.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name} · {subject.code}</option>)}
            </select>
          </label>
          <label className="vibe-field"><span>Năng lực</span>
            <select name="capacity" required defaultValue="TEACHER">
              {capacities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="vibe-field"><span>Ngày hiệu lực</span><input name="effective_from" type="date" required defaultValue={today} /></label>
          <label className="vibe-field"><span>Lý do / căn cứ</span><input name="reason" required /></label>
          <button className="vibe-button vibe-button-primary" type="submit">Thêm năng lực</button>
        </form>
        <AssignmentHistory rows={face.teaching.map(row => ({ id: row.id, label: `${row.capacity === 'TEACHER' ? 'Giáo viên' : 'Trợ giảng'} ${row.subject_name}`, from: row.effective_from, to: row.effective_to, status: row.status }))} employeeId={employeeId} action={endTeaching} />
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--vibe-line)] bg-white p-5">
        <h3 className="text-lg font-semibold text-[var(--vibe-navy)]">Vị trí công việc</h3>
        <p className="text-sm text-[var(--vibe-muted)]">Một hồ sơ có thể giữ nhiều vị trí cùng lúc. Vị trí này không thay vai trò vận hành cũ và không cấp quyền đăng nhập.</p>
        <div className="flex flex-wrap gap-2">
          {face.facts.positionBadges.length ? face.facts.positionBadges.map(badge => <span key={badge} className="vibe-badge" data-tone="warning">{badge}</span>) : <span className="text-sm text-[var(--vibe-muted)]">Chưa có vị trí đang hiệu lực.</span>}
        </div>
        <form action={assignPosition} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="vibe-field"><span>Vị trí</span>
            <select name="position_code" required defaultValue="VAM">
              {STAFF_POSITIONS.map(position => <option key={position.code} value={position.code}>{position.vi}</option>)}
            </select>
          </label>
          <label className="vibe-field"><span>Ngày hiệu lực</span><input name="effective_from" type="date" required defaultValue={today} /></label>
          <label className="vibe-field sm:col-span-2"><span>Lý do / căn cứ</span><input name="reason" required /></label>
          <button className="vibe-button vibe-button-primary" type="submit">Thêm vị trí</button>
        </form>
        <AssignmentHistory rows={face.positions.map(row => ({ id: row.id, label: positionBadgeLabel(row.position_code) || row.position_code, from: row.effective_from, to: row.effective_to, status: row.status }))} employeeId={employeeId} action={endPosition} />
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--vibe-line)] bg-white p-5">
        <h3 className="text-lg font-semibold text-[var(--vibe-navy)]">Ảnh chân dung</h3>
        <p className="text-sm text-[var(--vibe-muted)]">JPG, PNG hoặc WEBP, mỗi cạnh từ 400 đến 4000 điểm ảnh, tối đa 2 MB. Ảnh nằm trong kho riêng, không có đường dẫn công khai.</p>
        <form action={replacePortrait} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="vibe-field"><span>Ảnh mới</span><input name="portrait" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
          <div className="self-end"><button className="vibe-button" type="submit">Thay ảnh</button></div>
        </form>
        <form action={removePortrait} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="vibe-field"><span>Lý do gỡ ảnh</span><input name="reason" required /></label>
          <div className="self-end"><button className="vibe-button" type="submit">Gỡ ảnh</button></div>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--vibe-line)] bg-white p-5">
        <h3 className="text-lg font-semibold text-[var(--vibe-navy)]">Liên kết hồ sơ đã có</h3>
        <p className="text-sm text-[var(--vibe-muted)]">Tìm theo tên hoặc mã, rồi xác nhận đúng người. Hệ thống không tự gộp hai người chỉ vì trùng tên.</p>
        <form className="flex flex-wrap gap-3" action="/admin/employees" method="get">
          <input type="hidden" name="selected" value={employeeId} />
          <label className="vibe-field min-w-64"><span>Tìm giáo viên hoặc hồ sơ đăng nhập</span><input name="identity" defaultValue={identityQuery} /></label>
          <button className="vibe-button self-end" type="submit">Tìm</button>
        </form>
        <div className="space-y-3">
          {matches.map(match => (
            <form key={`${match.kind}-${match.id}`} action={linkIdentity} className="grid gap-3 rounded-lg border border-[var(--vibe-line)] p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="employee_id" value={employeeId} />
              <input type="hidden" name="confirm" value="LINK" />
              <input type="hidden" name="profile_id" value={match.kind === 'profile' ? match.id : profileId || ''} />
              <input type="hidden" name="teacher_id" value={match.kind === 'teacher' ? match.id : teacherId || ''} />
              <p><strong>{match.label}</strong><br /><span className="text-sm text-[var(--vibe-muted)]">{match.detail}{match.blocked ? ` · ${match.blocked}` : ''}</span></p>
              <label className="vibe-field"><span>Lý do liên kết</span><input name="reason" required disabled={Boolean(match.blocked)} /></label>
              <button className="vibe-button self-end" type="submit" disabled={Boolean(match.blocked)}>Xác nhận liên kết</button>
            </form>
          ))}
          {identityQuery && !matches.length && <p className="text-sm text-[var(--vibe-muted)]">Không thấy người khớp. Hãy tìm tên khác, không tạo hồ sơ trùng.</p>}
        </div>
      </section>
    </div>
  )
}

function AssignmentHistory({
  rows,
  employeeId,
  action,
}: {
  rows: { id: string; label: string; from: string; to: string | null; status: string }[]
  employeeId: string
  action: (form: FormData) => Promise<void>
}) {
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--vibe-navy)]">Lịch sử</h4>
      {rows.map(row => (
        <form key={row.id} action={action} className="grid items-end gap-2 border-t border-[var(--vibe-line)] py-2 sm:grid-cols-[1.4fr_.8fr_.8fr_1fr_auto]">
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="assignment_id" value={row.id} />
          <p className="text-sm"><strong>{row.label}</strong><br />{row.status === 'ACTIVE' ? 'Đang hiệu lực' : 'Đã kết thúc'}</p>
          <p className="text-sm text-[var(--vibe-muted)]">{row.from} → {row.to || 'nay'}</p>
          <label className="vibe-field"><span>Ngày kết thúc</span><input name="effective_to" type="date" defaultValue={row.to || vietnamToday()} disabled={row.status !== 'ACTIVE'} /></label>
          <label className="vibe-field"><span>Lý do</span><input name="reason" required={row.status === 'ACTIVE'} disabled={row.status !== 'ACTIVE'} /></label>
          <button className="vibe-button" type="submit" disabled={row.status !== 'ACTIVE'}>Kết thúc</button>
        </form>
      ))}
    </div>
  )
}
