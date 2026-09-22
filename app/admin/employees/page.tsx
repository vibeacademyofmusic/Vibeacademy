import { EmployeeSections } from '../_components/vibe'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { employeeData, type Employment } from './data'
import { createEmployee, updateEmployment, linkIdentity, configureUnit, updatePrivateProfile } from './actions'
import { Field, Select, Panel, Table, Pager, LoadError, Notice, dateText, timeText } from '../finance/_components/ui'
import SubmitButton from '../finance/_components/SubmitButton'
import type { Params } from '../finance/operations'
const statuses = [{ id: 'ACTIVE', name: 'Đang làm việc' }, { id: 'ON_LEAVE', name: 'Tạm nghỉ' }, { id: 'TERMINATED', name: 'Đã kết thúc' }]
const payTypes = [{ id: 'MONTHLY', name: 'Theo tháng' }, { id: 'PER_SESSION', name: 'Theo buổi' }, { id: 'HOURLY', name: 'Theo giờ' }]
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await createClient()
  let loaded
  try { loaded = await employeeData(db, params) } catch { return <LoadError/> }
  const { employee, versions, units, roles, branches, privateProfile } = loaded
  const unitOptions = units.map(u => ({ id: u.code, name: u.code + ' — ' + u.name }))
  const roleOptions = roles.map(r => ({ id: r.id, name: r.code }))
  const fields = (version?: Employment) => <>
    <Field name="full_name" label="Họ tên nhân viên" value={version?.full_name}/>
    <Field name="employee_group" label="Nhóm nhân viên" value={version?.employee_group}/>
    <Select name="pay_type" label="Hình thức trả lương" required options={payTypes} value={version?.pay_type}/>
    <Select name="operational_role_id" label="Vai trò công việc (không cấp quyền tài khoản)" options={roleOptions} value={version?.operational_role_id || ''} emptyLabel="Chưa chọn"/>
    <Field name="reason" label="Lý do / căn cứ"/>
  </>
  const latest = versions[0]
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Nhân viên</h1><Notice params={params}/>
    <p>Mã nhân viên giữ nguyên khi chuyển đơn vị. Hồ sơ công việc không tự tạo tài khoản, cấp quyền đăng nhập hoặc thay đổi bảng lương.</p>
    <form className="grid gap-3 sm:grid-cols-3"><Select name="unit" label="Đơn vị hiện tại" options={unitOptions} value={params.unit}/><Select name="status" label="Trạng thái" options={statuses} value={params.status}/><button className="self-end rounded border p-2">Lọc nhân viên</button></form>
    <Table headers={['Mã', 'Họ tên', 'Đơn vị gốc', 'Đơn vị hiện tại', 'Trạng thái', 'Trả lương']} rows={loaded.data.map(e => [<Link key={e.id} prefetch={false} className="underline" href={'?selected=' + e.id}>{e.employee_code}</Link>, e.full_name || 'Chưa đến ngày hiệu lực', e.home_unit, e.unit_code || '—', statuses.find(s => s.id === e.employment_status)?.name || 'Chưa hiệu lực', payTypes.find(p => p.id === e.pay_type)?.name || '—'])}/>
    <Pager path="/admin/employees" params={params} {...loaded}/>
    {employee && latest && <Panel title={employee.employee_code}><EmployeeSections id={employee.id}/><div id="profile"/>
      <Link prefetch={false} className="underline" href={'/admin/employees/' + employee.id + '/compensation'}>Cấu hình lương, lịch sử và phiếu lương</Link><p>Ngày vào làm: {dateText(employee.hire_date)} • Đơn vị gốc: {employee.home_unit}. Phiên bản mới nhất có hiệu lực {dateText(latest.effective_on)}.</p>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Thông tin liên hệ &amp; định danh
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            Dữ liệu riêng tư của Phòng Nhân sự. Email và số điện thoại được dùng làm thông tin nhận phiếu lương. CCCD đầy đủ không được hiển thị lại sau khi lưu.
          </p>
        </div>

        {privateProfile ? (
          <div className="grid gap-3 rounded-lg bg-white p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="text-slate-500">Email</span>
              <br />
              <strong>{privateProfile.email}</strong>
            </p>

            <p>
              <span className="text-slate-500">Số điện thoại / Zalo</span>
              <br />
              <strong>{privateProfile.phone}</strong>
            </p>

            <p>
              <span className="text-slate-500">Địa chỉ</span>
              <br />
              <strong>{privateProfile.address}</strong>
            </p>

            <p>
              <span className="text-slate-500">CCCD</span>
              <br />
              <strong>{privateProfile.citizen_id_masked}</strong>
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Hồ sơ nhân viên này chưa có thông tin liên hệ / định danh.
          </p>
        )}

        <form
          action={updatePrivateProfile}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input
            type="hidden"
            name="employee_id"
            value={employee.id}
          />

          <Field
            name="email"
            label="Email nhận phiếu lương"
            type="email"
            value={privateProfile?.email || ''}
          />

          <Field
            name="phone"
            label="Số điện thoại / Zalo"
            type="tel"
            value={privateProfile?.phone || ''}
          />

          <Field
            name="address"
            label="Địa chỉ liên hệ"
            value={privateProfile?.address || ''}
          />

          <Field
            name="citizen_id"
            label={
              privateProfile?.has_citizen_id
                ? 'CCCD mới — để trống nếu không đổi (' + privateProfile.citizen_id_masked + ')'
                : 'Số CCCD — 12 chữ số'
            }
            required={!privateProfile?.has_citizen_id}
          />

          <Field
            name="private_reason"
            label="Lý do / căn cứ cập nhật"
          />

          <div className="self-end">
            <SubmitButton>
              Lưu thông tin HR
            </SubmitButton>
          </div>
        </form>
      </section>
      <form id="roles" action={updateEmployment} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="employee_id" value={employee.id}/><input type="hidden" name="expected_version" value={latest.version}/>{fields(latest)}<Select name="unit_code" label="Đơn vị phân công" options={unitOptions} required value={latest.unit_code}/><Select name="employment_status" label="Trạng thái làm việc" options={statuses} required value={latest.employment_status}/><Field name="effective_on" label="Ngày hiệu lực (ngày kết thúc nếu nghỉ việc)" type="date" value={latest.effective_on}/><SubmitButton>Lưu phiên bản công việc</SubmitButton></form>
      <p className="text-sm">Lịch sử cũ được giữ nguyên. Ngày hiệu lực mới không được trước phiên bản mới nhất; chuyển đơn vị trong tương lai không đổi phân công hiện tại trước ngày đó.</p>
      <details><summary>Liên kết hồ sơ / giáo viên hiện có</summary><form action={linkIdentity} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="employee_id" value={employee.id}/><Field name="profile_id" label="ID profile hiện có (tùy chọn)" required={false} value={employee.profile_id || ''}/><Field name="teacher_id" label="ID giáo viên hiện có (tùy chọn)" required={false} value={employee.teacher_id || ''}/><Field name="reason" label="Lý do đổi liên kết"/><SubmitButton>Lưu liên kết</SubmitButton></form></details>
      <h3 id="history" className="font-semibold">Lịch sử công việc — 50 phiên bản gần nhất</h3>
      <Table headers={['Phiên bản', 'Hiệu lực', 'Đơn vị', 'Nhóm', 'Trạng thái', 'Trả lương', 'Lý do']} rows={versions.map(v => [v.version, dateText(v.effective_on), v.unit_code, v.employee_group, statuses.find(s => s.id === v.employment_status)?.name, payTypes.find(p => p.id === v.pay_type)?.name, v.reason])}/>
      <h3 className="font-semibold">Nhật ký thay đổi — 50 mục gần nhất</h3><Table headers={['Thao tác', 'Lý do', 'Người thực hiện', 'Thời gian']} rows={loaded.audit.map(a => [a.action, a.reason, a.actor, timeText(a.created_at)])}/>
    </Panel>}
    <Panel title="Thêm nhân viên">
      <p className="mb-3 text-sm text-slate-600">
        Hồ sơ nhân viên mới bắt buộc có thông tin liên hệ và định danh để Phòng Nhân sự có thể phát hành chứng từ đúng người nhận.
      </p>

      <form action={createEmployee} className="grid gap-3 sm:grid-cols-2">
        {fields()}

        <Select
          name="home_unit"
          label="Đơn vị gốc cấp mã"
          options={unitOptions}
          required
        />

        <Field
          name="hire_date"
          label="Ngày vào làm"
          type="date"
        />

        <Field
          name="email"
          label="Email nhận phiếu lương"
          type="email"
        />

        <Field
          name="phone"
          label="Số điện thoại / Zalo"
          type="tel"
        />

        <Field
          name="address"
          label="Địa chỉ liên hệ"
        />

        <Field
          name="citizen_id"
          label="Số CCCD — 12 chữ số"
        />

        <Field
          name="profile_id"
          label="ID profile hiện có (tùy chọn)"
          required={false}
        />

        <Field
          name="teacher_id"
          label="ID giáo viên hiện có (tùy chọn)"
          required={false}
        />

        <SubmitButton>
          Tạo hồ sơ nhân viên
        </SubmitButton>
      </form>
    </Panel>
    <Panel title="Liên kết đơn vị với chi nhánh"><p>Chỉ liên kết với chi nhánh đã xác nhận; không tự tạo hoặc suy đoán chi nhánh.</p>{units.map(u => <form key={u.code} action={configureUnit} className="grid gap-3 border-t py-3 sm:grid-cols-3"><input type="hidden" name="unit_code" value={u.code}/><Select name="branch_id" label={u.code + ' — ' + u.name} options={branches} value={u.branch_id || ''} emptyLabel="Chưa liên kết"/><Field name="reason" label={'Căn cứ liên kết ' + u.code}/><SubmitButton>Lưu liên kết {u.code}</SubmitButton></form>)}</Panel>
  </div>
}
