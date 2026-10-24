'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '@/app/admin/finance/operations'
export async function configureCompensation(form: FormData) {
  const db = await adminClient(), get = (key: string) => String(form.get(key) || '').trim(), employee = get('employee')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  let error = ''
  if (!uuidPattern.test(get('branch')) || !['MONTHLY', 'PER_SESSION', 'HOURLY'].includes(get('type')) || !/^\d{1,12}(\.\d{1,2})?$/.test(get('rate')) || Number(get('rate')) <= 0 || !/^[A-Z]{3}$/.test(get('currency')) || !validDate(get('from')) || (get('to') && (!validDate(get('to')) || get('to') < get('from'))) || !get('reason') || get('reason').length > 2000 || (get('type') === 'PER_SESSION' && !['ONE_ON_ONE', 'GROUP'].includes(get('class_type')))) error = 'Kiểm tra mức lương, ngày hiệu lực và lý do.'
  else {
    const result = await db.rpc('configure_employee_compensation', { p_employee: employee, p_branch: get('branch'), p_type: get('type'), p_rate: get('rate'), p_currency: get('currency'), p_from: get('from'), p_to: get('to') || null, p_class_type: get('type') === 'PER_SESSION' ? get('class_type') : null, p_reason: get('reason') })
    if (result.error) error = result.error.message === 'Compensation dates overlap' ? 'Ngày hiệu lực trùng mức lương đã có. Lịch sử không bị ghi đè.' : 'Không thể lưu. Kiểm tra liên kết giáo viên, chi nhánh và mức lương đang có.'
  }
  const workspace = staffField(form, 'workspace')

const path =
  workspace === 'hr_templates'
    ? '/admin/hr/templates'
    : '/admin/employees/' + employee + '/compensation'
  revalidatePath(path)
  revalidatePath('/admin/payroll')
  redirect(path + '?' + new URLSearchParams(error ? { error } : { success: 'Đã lưu mức lương và lý do.' }))
}

// Payroll V2: the new Staff form uses this action. The legacy export above is
// retained for other existing callers; this action never writes legacy rules.
type StaffCatalogComponent = {
  code: string
  name: string
  category: string
  default_calculation_method: string
  recurring_configurable: boolean
  status: string
}

function staffCompensationError(message: string, code?: string): string {
  const messages: Record<string, string> = {
    STAFF_COMPENSATION_UNAUTHORIZED:
      'Chỉ SUPER_ADMIN có tài khoản đang hoạt động được lưu cấu hình Staff.',
    STAFF_COMPENSATION_EMPLOYEE_NOT_FOUND:
      'Không tìm thấy hồ sơ nhân viên.',
    STAFF_COMPENSATION_BEFORE_HIRE_DATE:
      'Ngày hiệu lực không được trước ngày vào làm trong hồ sơ Staff.',
    STAFF_COMPENSATION_ACTIVE_EMPLOYMENT_REQUIRED:
      'Chưa có phiên bản hồ sơ nhân viên ACTIVE tại ngày bắt đầu hiệu lực.',
    STAFF_COMPENSATION_ACTIVE_BRANCH_REQUIRED:
      'Chi nhánh trả lương chưa hoạt động.',
    STAFF_COMPENSATION_COMPONENT_NOT_FOUND:
      'Thành phần lương không tồn tại hoặc đã ngừng sử dụng.',
    STAFF_COMPENSATION_EVENT_COMPONENT_NOT_CONFIGURABLE:
      'Thưởng và công tác phí theo chuyến phải nhập qua nghiệp vụ theo kỳ, không phải cấu hình định kỳ.',
    STAFF_COMPENSATION_INVALID_EFFECTIVE_RANGE:
      'Ngày kết thúc không được trước ngày bắt đầu.',
    STAFF_COMPENSATION_REASON_REQUIRED:
      'Lý do phải có từ 1 đến 2.000 ký tự.',
    STAFF_COMPENSATION_INVALID_FIXED_AMOUNT_SHAPE:
      'Khoản cố định cần số tiền dương và tiền tệ; không điền đơn giá buổi hoặc tỷ lệ phần trăm.',
    STAFF_COMPENSATION_INVALID_RATE_SHAPE:
      'Đơn giá theo buổi phải là số dương và có tiền tệ.',
    STAFF_COMPENSATION_TEACHER_PROFILE_REQUIRED:
      'Lương theo buổi cần liên kết hồ sơ giáo viên.',
    STAFF_COMPENSATION_ACTIVE_TEACHER_BRANCH_REQUIRED:
      'Giáo viên phải đang hoạt động và thuộc chi nhánh trả lương.',
    STAFF_COMPENSATION_ACTIVE_TEACHER_ROLE_REQUIRED:
      'Cần phân công vai trò TEACHER tại đúng chi nhánh, bao phủ thời gian cấu hình theo buổi.',
    STAFF_COMPENSATION_INVALID_CLASS_TYPE:
      'Loại lớp không hợp lệ.',
    STAFF_COMPENSATION_OVERLAP:
      'Đã có cấu hình cùng thành phần, chi nhánh và phạm vi lớp bị trùng hiệu lực. Không ghi đè mức cũ.',
    STAFF_COMPENSATION_UNSUPPORTED_CALCULATION_METHOD:
      'Phương pháp tính này chưa được hỗ trợ trên form Payroll V2.1.',
  }
  if (messages[message]) return messages[message]
  if (code === '23505') {
    return 'Cấu hình cùng ngày bắt đầu đã tồn tại. Tải lại danh sách để đối chiếu; không tạo lại mức lương.'
  }
  if (code === '23514') {
    return 'Cấu hình bị ràng buộc dữ liệu từ chối. Kiểm tra mã khoản, số tiền và ngày hiệu lực; FIXED_PAY đã ngừng sử dụng.'
  }
  if (code === 'PGRST202') {
    return 'Chưa tìm thấy RPC configure_staff_compensation_component trong API local. Dừng tại đây để kiểm tra migration; không reset dữ liệu.'
  }
  return 'Không thể lưu cấu hình. Xem Terminal để kiểm tra mã lỗi; chưa tính lại kỳ lương.'
}

function staffField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function staffDate(value: string): boolean {
  // Use the existing date validator, plus a strict calendar round-trip.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validDate(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
}

function configuredResponse(
  data: unknown,
  employee: string,
  branch: string,
  componentCode: string
): data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const result = data as Record<string, unknown>
  return (
    (result.status === 'CONFIGURED' || result.status === 'ALREADY_CONFIGURED') &&
    typeof result.component_id === 'string' &&
    uuidPattern.test(result.component_id) &&
    result.employee_id === employee &&
    result.branch_id === branch &&
    result.component_code === componentCode
  )
}

export async function configureStaffCompensation(form: FormData): Promise<void> {
  // Preserve the existing authenticated application client. No service-role key.
  // Keep auth/redirect control flow outside the RPC try/catch.
  const db = await adminClient()
  const employee = staffField(form, 'employee').toLowerCase()
  const workspace = staffField(form, 'workspace')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')

  const path = '/admin/employees/' + employee + '/compensation'
  const branch = staffField(form, 'branch').toLowerCase()
  const componentCode = staffField(form, 'component_code').toUpperCase()
  const value = staffField(form, 'value')
  const currency = staffField(form, 'currency').toUpperCase()
  const from = staffField(form, 'from')
  const to = staffField(form, 'to')
  const classType = staffField(form, 'class_type').toUpperCase()
  const reason = staffField(form, 'reason')
  const issues: string[] = []

  if (!uuidPattern.test(branch)) issues.push('Chưa chọn chi nhánh trả lương hợp lệ.')
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(componentCode)) {
    issues.push('Chưa chọn thành phần thu nhập hoặc khấu trừ hợp lệ.')
  }
  if (['FIXED_PAY', 'BONUS', 'TRAVEL_EXPENSE', 'SOCIAL_INSURANCE', 'LABOR_INSURANCE'].includes(componentCode)) {
    issues.push('Khoản này không được tạo bằng form cấu hình định kỳ. Lương tháng dùng BASE_SALARY; thưởng và công tác phí theo chuyến dùng luồng riêng.')
  }
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
    issues.push('Số tiền/đơn giá phải lớn hơn 0, tối đa 12 chữ số phần nguyên và 2 số thập phân. Không nhập dấu phân cách hàng nghìn hoặc dấu âm.')
  }
  if (!/^[A-Z]{3}$/.test(currency)) issues.push('Tiền tệ phải có 3 chữ cái, ví dụ VND.')
  if (!staffDate(from)) issues.push('Ngày bắt đầu hiệu lực không hợp lệ.')
  if (to && (!staffDate(to) || to < from)) issues.push('Ngày kết thúc phải hợp lệ và không trước ngày bắt đầu.')
  if (!reason || reason.length > 2000) issues.push('Lý do phải có từ 1 đến 2.000 ký tự.')

  let error = issues.join(' ')
  let success = ''
  if (!error) {
    try {
      const catalogResult = await db
        .from('payroll_component_catalog')
        .select('code,name,category,default_calculation_method,recurring_configurable,status')
        .eq('code', componentCode)
        .maybeSingle<StaffCatalogComponent>()

      if (catalogResult.error) {
        console.error('Staff compensation catalog read failed:', {
          code: catalogResult.error.code,
          message: catalogResult.error.message,
        })
        error = 'Không đọc được danh mục thành phần lương. Chưa gửi yêu cầu lưu.'
      } else {
        const catalog = catalogResult.data
        const fixed = catalog?.default_calculation_method === 'FIXED_AMOUNT' &&
          ['EARNING', 'DEDUCTION'].includes(catalog.category)
        const perSession = componentCode === 'TEACHING_PER_SESSION' &&
          catalog?.default_calculation_method === 'PER_SESSION' &&
          catalog.category === 'EARNING'

        if (!catalog || catalog.status !== 'ACTIVE' || !catalog.recurring_configurable) {
          error = 'Thành phần đã ngừng sử dụng hoặc không cho cấu hình định kỳ.'
        } else if (!fixed && !perSession) {
          error = 'Form này chỉ hỗ trợ khoản cố định và TEACHING_PER_SESSION. Chưa cấu hình theo giờ hoặc phần trăm cho Payroll V2.1.'
        } else if (fixed && classType) {
          error = 'Khoản cố định không được kèm loại lớp. Dùng form thu nhập/khấu trừ cố định.'
        } else if (perSession && classType && !['ONE_ON_ONE', 'GROUP'].includes(classType)) {
          error = 'Loại lớp phải là tất cả, cá nhân hoặc nhóm.'
        } else {
          // The RPC derives category/method from its catalog and enforces
          // SUPER_ADMIN, Staff eligibility, date overlap and audit logging.
          // Decimal values stay strings; no floating-point payroll arithmetic.
          const result = await db.rpc('configure_staff_compensation_component', {
            p_employee: employee,
            p_component_code: componentCode,
            p_branch: branch,
            p_amount: fixed ? value : null,
            p_rate: perSession ? value : null,
            p_percentage: null,
            p_basis_component_code: null,
            p_currency: currency,
            p_class_type: perSession ? classType || null : null,
            p_effective_from: from,
            p_effective_to: to || null,
            p_reason: reason,
          })

          if (result.error) {
            console.error('configure_staff_compensation_component failed:', {
              code: result.error.code,
              message: result.error.message,
            })
            error = staffCompensationError(result.error.message, result.error.code)
          } else if (!configuredResponse(result.data, employee, branch, componentCode)) {
            error = 'Chưa xác nhận được kết quả lưu. Tải lại danh sách Staff trước khi thử lại; không tính lại bảng lương.'
          } else {
            success = result.data.status === 'ALREADY_CONFIGURED'
              ? 'Cấu hình giống hệt đã tồn tại; không tạo thêm. Kỳ lương đã tính chưa được tính lại.'
              : 'Đã lưu cấu hình Staff V2. Kết quả của các kỳ lương đã tính chưa thay đổi.'
          }
        }
      }
    } catch {
      // A response failure does not prove the database failed to commit.
      error = 'Chưa xác nhận được kết quả do lỗi kết nối. Tải lại danh sách cấu hình trước khi thử lại.'
    }
  }

  // Refresh views only. Do not run generate_staff_payroll_v2 here.
  revalidatePath(
    '/admin/employees/' + employee + '/compensation'
  )
  revalidatePath('/admin/hr/templates')
  revalidatePath('/admin/payroll', 'layout')
  revalidatePath('/finance/payroll', 'layout')

  const query = new URLSearchParams()

  if (workspace === 'hr_templates') {
    query.set('employee', employee)
  }

  if (error) {
    query.set('error', error)
  } else {
    query.set('success', success)
  }

  redirect(path + '?' + query.toString())
}
