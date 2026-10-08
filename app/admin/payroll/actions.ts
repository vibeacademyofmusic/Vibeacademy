'use server'

import { financeContext } from '../../finance/authorization'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  adminClient,
  uuidPattern,
  validDate,
} from '../finance/operations'

export async function payrollAction(form: FormData) {
  const get = (key: string) =>
    String(form.get(key) ?? '').trim()

  const action = get('action')
  const db =
    action === 'transition'
      ? (await financeContext()).db
      : await adminClient()

  const pid = get('period')
  const teacher = get('teacher')
  const note = get('note')

  const args: Record<
    string,
    string | number | null
  > = {}

  let rpc = ''
  let error = ''

  const uid = (value: string) =>
    uuidPattern.test(value)

  const amount = (value: string) =>
    /^-?\d{1,12}(\.\d{1,2})?$/.test(value) &&
    Number(value) !== 0

  const positiveAmount = (value: string) =>
    /^\d{1,12}(\.\d{1,2})?$/.test(value) &&
    Number(value) > 0

  const positiveVersion = (value: string) =>
    /^\d+$/.test(value) && Number(value) > 0

  if (
    action === 'create' &&
    uid(get('branch')) &&
    validDate(get('month') + '-01')
  ) {
    rpc = 'create_payroll_period'
    Object.assign(args, {
      p_branch: get('branch'),
      p_month: get('month') + '-01',
    })
  } else if (
    action === 'rule' &&
    uid(teacher) &&
    uid(get('branch')) &&
    ['HOURLY', 'MONTHLY'].includes(get('type')) &&
    amount(get('rate')) &&
    Number(get('rate')) > 0 &&
    /^[A-Z]{3}$/.test(get('currency')) &&
    validDate(get('from')) &&
    (!get('to') ||
      (validDate(get('to')) &&
        get('to') >= get('from')))
  ) {
    rpc = 'add_compensation_rule'
    Object.assign(args, {
      p_teacher: teacher,
      p_branch: get('branch'),
      p_type: get('type'),
      p_rate: get('rate'),
      p_currency: get('currency'),
      p_from: get('from'),
      p_to: get('to') || null,
    })
  } else if (
    action === 'employee_rule' &&
    uid(get('employee')) &&
    uid(get('branch')) &&
    amount(get('rate')) &&
    Number(get('rate')) > 0 &&
    /^[A-Z]{3}$/.test(get('currency')) &&
    validDate(get('from')) &&
    (!get('to') ||
      (validDate(get('to')) &&
        get('to') >= get('from')))
  ) {
    rpc = 'add_employee_compensation_rule'
    Object.assign(args, {
      p_employee: get('employee'),
      p_branch: get('branch'),
      p_rate: get('rate'),
      p_currency: get('currency'),
      p_from: get('from'),
      p_to: get('to') || null,
    })
  } else if (
    action === 'session_rule' &&
    uid(teacher) &&
    uid(get('branch')) &&
    ['ONE_ON_ONE', 'GROUP'].includes(
      get('class_type')
    ) &&
    amount(get('rate')) &&
    Number(get('rate')) > 0 &&
    /^[A-Z]{3}$/.test(get('currency')) &&
    validDate(get('from')) &&
    (!get('to') ||
      (validDate(get('to')) &&
        get('to') >= get('from')))
  ) {
    rpc = 'add_session_compensation_rule'
    Object.assign(args, {
      p_teacher: teacher,
      p_branch: get('branch'),
      p_class_type: get('class_type'),
      p_rate: get('rate'),
      p_currency: get('currency'),
      p_from: get('from'),
      p_to: get('to') || null,
    })
  } else if (
    action === 'trip_costs' &&
    uid(get('payroll')) &&
    uid(pid) &&
    uid(get('trip')) &&
    uid(get('key')) &&
    ['allowance', 'transport', 'lodging'].every(
      (key) =>
        /^\d{1,12}(\.\d{1,2})?$/.test(get(key))
    ) &&
    note &&
    note.length <= 2000
  ) {
    rpc = 'add_payroll_trip_costs'
    Object.assign(args, {
      p_payroll: get('payroll'),
      p_trip: get('trip'),
      p_allowance: get('allowance'),
      p_transport: get('transport'),
      p_lodging: get('lodging'),
      p_reason: note,
      p_key: get('key'),
    })
  } else if (
    action === 'evidence_adjust' &&
    uid(get('payroll')) &&
    uid(pid) &&
    uid(get('key')) &&
    [
      'BONUS',
      'DEDUCTION',
      'CORRECTION',
      'TRAVEL_ALLOWANCE',
    ].includes(get('kind')) &&
    amount(get('amount')) &&
    note &&
    note.length <= 2000 &&
    (!get('attendance') ||
      uid(get('attendance'))) &&
    (!get('trip') || uid(get('trip')))
  ) {
    rpc = 'add_payroll_evidence_adjustment'
    Object.assign(args, {
      p_payroll: get('payroll'),
      p_kind: get('kind'),
      p_amount: get('amount'),
      p_reason: note,
      p_attendance: get('attendance') || null,
      p_trip: get('trip') || null,
      p_key: get('key'),
    })
  } else if (
    action === 'generate' &&
    uid(pid)
  ) {
    // Payroll V2 is now the authoritative generator for Staff.
    rpc = 'generate_staff_payroll_v2'
    args.p_period = pid
  } else if (
    action === 'v2_bonus' &&
    uid(pid) &&
    positiveVersion(get('version')) &&
    uid(get('employee')) &&
    positiveAmount(get('amount')) &&
    /^[A-Z]{3}$/.test(get('currency')) &&
    uid(get('key')) &&
    note &&
    note.length <= 2000
  ) {
    rpc = 'add_payroll_v2_bonus'
    Object.assign(args, {
      p_period: pid,
      p_version: Number(get('version')),
      p_employee: get('employee'),
      p_amount: get('amount'),
      p_currency: get('currency'),
      p_reason: note,
      p_key: get('key'),
    })
  } else if (
    action === 'v2_expense' &&
    uid(pid) &&
    positiveVersion(get('version')) &&
    uid(get('claim')) &&
    uid(get('key')) &&
    note &&
    note.length <= 2000
  ) {
    rpc = 'post_expense_claim_to_payroll_v2'
    Object.assign(args, {
      p_period: pid,
      p_version: Number(get('version')),
      p_claim: get('claim'),
      p_reason: note,
      p_key: get('key'),
    })
  } else if (
    action === 'v2_cancel' &&
    uid(pid) &&
    positiveVersion(get('version')) &&
    uid(get('period_action')) &&
    note &&
    note.length <= 2000
  ) {
    rpc = 'cancel_payroll_v2_period_action'
    Object.assign(args, {
      p_action: get('period_action'),
      p_version: Number(get('version')),
      p_reason: note,
    })
  } else if (
    action === 'transition' &&
    uid(pid) &&
    [
      'DRAFT',
      'REVIEW',
      'APPROVED',
      'FINALIZED',
    ].includes(get('status')) &&
    positiveVersion(get('version')) &&
    note &&
    note.length <= 2000 &&
    get('confirm') === 'yes'
  ) {
    // Always use the V2-aware transition RPC.
    rpc = 'transition_payroll_with_override'

    const hasEmergency =
      Boolean(get('override_type')) ||
      Boolean(get('override_reason'))

    if (
      hasEmergency &&
      !(
        ['APPROVED', 'FINALIZED'].includes(
          get('status')
        ) &&
        get('override_type') ===
          'MAKER_CHECKER_EMERGENCY' &&
        get('override_reason') &&
        get('override_reason').length <= 2000
      )
    ) {
      rpc = ''
      error =
        'Ngoại lệ khẩn cấp cần đúng loại và lý do rõ ràng.'
    } else {
      Object.assign(args, {
        p_period: pid,
        p_version: Number(get('version')),
        p_status: get('status'),
        p_note: note,
        p_override_type: hasEmergency
          ? get('override_type')
          : null,
        p_override_reason: hasEmergency
          ? get('override_reason')
          : null,
      })
    }
  } else if (
    action === 'adjust' &&
    uid(get('payroll')) &&
    uid(pid) &&
    ['BONUS', 'DEDUCTION', 'CORRECTION'].includes(
      get('kind')
    ) &&
    amount(get('amount')) &&
    note &&
    note.length <= 2000
  ) {
    rpc = 'add_payroll_adjustment'
    Object.assign(args, {
      p_payroll: get('payroll'),
      p_kind: get('kind'),
      p_amount: get('amount'),
      p_reason: note,
    })
  } else {
    if (action === 'v2_bonus' || action === 'v2_expense') {
      const issues: string[] = []

      if (!uid(pid)) {
        issues.push(
          'Thiếu hoặc sai mã kỳ lương (period).'
        )
      }

      if (!positiveVersion(get('version'))) {
        issues.push(
          'Thiếu hoặc sai phiên bản kỳ lương (version).'
        )
      }

      if (!uid(get('key'))) {
        issues.push(
          'Thiếu hoặc sai mã yêu cầu chống trùng (key).'
        )
      }

      if (!note) {
        issues.push(
          action === 'v2_bonus'
            ? 'Chưa nhập lý do thưởng (note).'
            : 'Chưa nhập ghi chú đưa công tác phí vào kỳ (note).'
        )
      } else if (note.length > 2000) {
        issues.push(
          'Lý do hoặc ghi chú không được vượt quá 2.000 ký tự.'
        )
      }

      if (action === 'v2_bonus') {
        if (!uid(get('employee'))) {
          issues.push(
            'Thiếu hoặc sai mã nhân viên (employee).'
          )
        }

        if (!positiveAmount(get('amount'))) {
          issues.push(
            'Tiền thưởng phải lớn hơn 0, tối đa 12 chữ số phần nguyên và 2 chữ số thập phân; không nhập dấu phân cách hàng nghìn. Ví dụ: 100000.'
          )
        }

        if (!/^[A-Z]{3}$/.test(get('currency'))) {
          issues.push(
            'Tiền tệ phải gồm 3 chữ cái viết hoa, ví dụ VND.'
          )
        }
      } else if (!uid(get('claim'))) {
        issues.push(
          'Chưa chọn công tác phí hoặc mã Expense Claim không hợp lệ (claim).'
        )
      }

      error = issues.length > 0
        ? issues.join(' ')
        : 'Thao tác Payroll V2 không hợp lệ. Cần kiểm tra dữ liệu biểu mẫu.'
    } else {
      error =
        'Vui lòng kiểm tra dữ liệu, ngày hiệu lực và xác nhận.'
    }
  }

  const base =
    get('workspace') === 'finance'
      ? '/finance/payroll'
      : '/admin/payroll'

  let destination = uid(pid)
    ? `${base}/${pid}`
    : base

  // Keep V2 period actions on the Staff detail page after submit.
  if (
    uid(pid) &&
    uid(get('employee')) &&
    ['v2_bonus', 'v2_expense', 'v2_cancel'].includes(
      action
    )
  ) {
    destination = `${base}/${pid}/${get('employee')}`
  }

  if (rpc) {
    try {
      const result = await db.rpc(rpc, args)

      if (result.error) {
        const messages: Record<string, string> = {
          PAYROLL_PERIOD_ALREADY_CLOSED:
            'Kỳ lương của chi nhánh và tháng này đã được duyệt/chốt. Không thể tạo kỳ thứ hai hoặc tính lại dữ liệu lịch sử.',
          PAYROLL_PERIOD_INVALID_INPUT:
            'Chi nhánh hoặc tháng tính lương không hợp lệ.',
          PAYROLL_PERIOD_CREATE_RACE_RELOAD:
            'Kỳ lương vừa thay đổi bởi một thao tác khác. Hãy tải lại danh sách kỳ lương.',
          'Monthly payroll requires linked Employee Master and approved attendance':
            'Lương tháng cần liên kết hồ sơ nhân viên và chấm công đã duyệt.',

          'Approved attendance required for every required shift':
            'Còn ca làm việc chưa có chấm công được duyệt. Hãy hoàn tất chấm công trước khi tính lương.',

          'No required minutes; manual payroll review required':
            'Kỳ không có phút làm việc bắt buộc. Cần kiểm tra lịch và hồ sơ nhân viên.',

          'Monthly assignment crosses payroll branch; review required':
            'Phân công trong kỳ không khớp chi nhánh trả lương. Cần kiểm tra trước khi tính.',

          'Explicit active employee branch mapping required':
            'Cần cấu hình liên kết đơn vị–chi nhánh và nhân viên lương tháng đang hoạt động.',

          'Deduction requires payable late or early evidence from this payroll':
            'Khấu trừ cần mã chấm công đi muộn/về sớm của chính nhân viên trong kỳ.',

          'Deduction evidence must match generated payable snapshot':
            'Bằng chứng phải khớp chấm công đã dùng khi tính lương.',

          'Approved trip for payroll employee required':
            'Cần mã chuyến công tác đã duyệt của chính nhân viên.',

          'Payroll maker cannot approve or finalize':
            'Người tính lương hoặc thêm khoản phát sinh không được tự duyệt/chốt. Hãy nhờ người có quyền khác kiểm tra.',

          'Valid SUPER_ADMIN emergency override reason and type required':
            'Ngoại lệ khẩn cấp chỉ dành cho SUPER_ADMIN, bắt buộc loại ngoại lệ và lý do.',

          'Completed session has unresolved teacher or compensation':
            'Có buổi hoàn tất chưa xác định giáo viên hoặc thiếu mức lương đúng ngày. Hãy bổ sung nguồn rồi tính lại.',

          'Monthly rule must cover full period; pay type and currency cannot change within period':
            'Lương tháng phải phủ trọn kỳ; không đổi loại lương hoặc tiền tệ giữa kỳ.',

          'Compensation dates overlap':
            'Ngày hiệu lực bị trùng với mức lương đang có.',

          'Payroll with adjustments cannot return to draft':
            'Đã có điều chỉnh legacy: hãy thêm khoản sửa sai, không quay về bản nháp.',

          'Invalid teacher branch':
            'Giáo viên phải hoạt động và thuộc chi nhánh.',

          PAYROLL_V2_NO_ELIGIBLE_STAFF:
            'Không có Staff đủ điều kiện và cấu hình lương cho kỳ này.',

          PAYROLL_V2_REQUIRES_DRAFT:
            'Chỉ được tính lại Payroll V2 khi kỳ đang ở Bản nháp.',

          PAYROLL_RETROACTIVE_PENDING_BLOCKS_CLOSE:
            'Không thể duyệt/chốt kỳ: còn hồ sơ truy lĩnh đã duyệt nhắm vào kỳ này nhưng chưa được đưa vào Payroll.',

          PAYROLL_V2_PARTIAL_FIXED_COMPONENT_UNSUPPORTED:
            'Có khoản cố định không phủ trọn kỳ. Chưa được tự suy đoán cách chia tỷ lệ.',

          PAYROLL_V2_CALCULATION_METHOD_UNSUPPORTED:
            'Kỳ này có phương thức tính lương chưa được Payroll V2.1 hỗ trợ.',

          PAYROLL_V2_PERIOD_CHANGED_RELOAD:
            'Kỳ lương đã thay đổi. Hãy tải lại trang trước khi thao tác.',

          PAYROLL_V2_ACTION_REQUIRES_GENERATED_OR_REVIEW:
            'Thưởng và công tác phí chỉ được thêm sau khi đã tính bảng lương và trước khi duyệt.',

          PAYROLL_V2_ACTION_CANCEL_REQUIRES_GENERATED_OR_REVIEW:
            'Chỉ được hủy khoản phát sinh khi kỳ đang Đã tính hoặc Đang kiểm tra.',

          PAYROLL_V2_BONUS_INVALID_AMOUNT:
            'Tiền thưởng phải lớn hơn 0 và tối đa 2 chữ số thập phân.',

          PAYROLL_V2_ACTION_CURRENCY_MISMATCH:
            'Tiền tệ của khoản phát sinh không khớp bảng lương.',

          PAYROLL_V2_EXPENSE_CLAIM_NOT_APPROVED:
            'Công tác phí phải đến từ Expense Claim đã được duyệt.',

          PAYROLL_V2_EXPENSE_CLAIM_PERIOD_MISMATCH:
            'Expense Claim không thuộc đúng chi nhánh hoặc tháng của kỳ lương.',

          PAYROLL_V2_EXPENSE_CLAIM_ALREADY_POSTED:
            'Expense Claim này đã được đưa vào một kỳ lương.',

          PAYROLL_V2_EXPENSE_CLAIM_LEGACY_CONFLICT:
            'Chuyến công tác này đã từng được tính theo luồng Payroll cũ. Cần đối soát trước khi tiếp tục.',

          PAYROLL_V2_ACTION_KEY_ALREADY_USED:
            'Yêu cầu đã được sử dụng cho một thao tác khác. Hãy tải lại trang.',
        }

        error =
          messages[result.error.message] ||
          `Không thể thực hiện: ${result.error.message}`
      } else if (
        action === 'create' &&
        typeof result.data === 'string' &&
        uid(result.data)
      ) {
        destination += '/' + result.data
      }
    } catch {
      error =
        'Chưa xác nhận được kết quả. Hãy tải lại trước khi thử lại.'
    }
  }

  revalidatePath('/admin/payroll', 'layout')
  revalidatePath('/finance', 'layout')

  redirect(
    destination +
      '?' +
      new URLSearchParams(
        error
          ? { error }
          : { success: 'Đã lưu thao tác bảng lương.' }
      )
  )
}
