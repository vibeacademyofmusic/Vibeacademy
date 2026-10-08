'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '../../finance/operations'

const base = '/admin/hr/retroactive-pay'

function v(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}

function validVersion(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0
}

function validAmount(value: string) {
  return /^\d{1,12}(\.\d{1,2})?$/.test(value)
    && Number(value) > 0
}

function friendly(message: string) {
  const map: Record<string, string> = {
    RETROACTIVE_SOURCE_MUST_BE_CLOSED:
      'Chỉ tạo truy lĩnh cho kỳ đã duyệt/chốt.',

    RETROACTIVE_SOURCE_PAYROLL_ALREADY_EXISTS:
      'Nhân viên đã có bản lương trong kỳ nguồn. Trường hợp này phải dùng Correction, không dùng Truy lĩnh.',

    RETROACTIVE_SOURCE_COMPENSATION_REQUIRED:
      'Không tìm thấy cấu hình lương của nhân viên trong kỳ nguồn.',

    RETROACTIVE_ALREADY_EXISTS:
      'Nhân viên đã có một hồ sơ truy lĩnh đang hoạt động cho kỳ này.',

    RETROACTIVE_MAKER_CANNOT_APPROVE:
      'Người lập hồ sơ không được tự duyệt. Hãy dùng người duyệt khác hoặc SUPER_ADMIN emergency override có lý do.',

    RETROACTIVE_INVALID_TARGET_PERIOD:
      'Kỳ nhận truy lĩnh phải cùng chi nhánh, nằm sau kỳ nguồn và chưa được duyệt/chốt.',

    RETROACTIVE_TARGET_MUST_BE_GENERATED_OR_REVIEW:
      'Kỳ nhận phải được tính bảng lương trước khi đưa khoản truy lĩnh vào.',

    RETROACTIVE_TARGET_PAYROLL_HEADER_REQUIRED:
      'Kỳ nhận chưa có bản lương của nhân viên này. Hãy kiểm tra cấu hình nhân viên và tính lại kỳ nhận trước.',

    RETROACTIVE_CURRENCY_MISMATCH:
      'Tiền tệ của truy lĩnh không khớp bản lương kỳ nhận.',

    RETROACTIVE_CHANGED_RELOAD:
      'Dữ liệu đã thay đổi. Hãy tải lại trước khi thao tác.',

    RETROACTIVE_RETARGET_REQUIRES_APPROVED_UNPOSTED:
      'Chỉ hồ sơ truy lĩnh đã duyệt nhưng chưa đưa vào Payroll mới được chuyển kỳ nhận.',

    RETROACTIVE_RETARGET_TARGET_MUST_BE_OPEN:
      'Kỳ nhận mới phải đang ở Bản nháp, Đã tính hoặc Đang kiểm tra.',

    RETROACTIVE_RETARGET_SCOPE_INVALID:
      'Kỳ nhận mới phải cùng chi nhánh và nằm sau kỳ nguồn.',

    RETROACTIVE_RETARGET_SAME_TARGET:
      'Kỳ nhận mới đang trùng với kỳ nhận hiện tại.',
  }

  return map[message] || message
}

export async function retroactiveAction(
  form: FormData
) {
  const action = v(form, 'action')
  const claim = v(form, 'claim')
  const source = v(form, 'source')
  const employee = v(form, 'employee')

  const db = await createClient()

  let result:
    | Awaited<ReturnType<typeof db.rpc>>
    | undefined

  if (
    action === 'create'
    && uuidPattern.test(source)
    && uuidPattern.test(employee)
    && validAmount(v(form, 'amount'))
    && /^[A-Z]{3}$/.test(v(form, 'currency'))
    && v(form, 'reason')
  ) {
    result = await db.rpc(
      'create_payroll_retroactive_claim',
      {
        p_source_period: source,
        p_employee: employee,
        p_amount: v(form, 'amount'),
        p_currency: v(form, 'currency'),
        p_reason: v(form, 'reason'),
      }
    )
  } else if (
    action === 'submit'
    && uuidPattern.test(claim)
    && validVersion(v(form, 'version'))
  ) {
    result = await db.rpc(
      'submit_payroll_retroactive_claim',
      {
        p_claim: claim,
        p_version: Number(v(form, 'version')),
      }
    )
  } else if (
    action === 'approve'
    && uuidPattern.test(claim)
    && validVersion(v(form, 'version'))
    && uuidPattern.test(v(form, 'target'))
    && v(form, 'note')
  ) {
    const emergency =
      v(form, 'override') === 'yes'

    result = await db.rpc(
      'approve_payroll_retroactive_claim',
      {
        p_claim: claim,
        p_version: Number(v(form, 'version')),
        p_target_period: v(form, 'target'),
        p_note: v(form, 'note'),
        p_override_type: emergency
          ? 'MAKER_CHECKER_EMERGENCY'
          : null,
        p_override_reason: emergency
          ? v(form, 'override_reason')
          : null,
      }
    )
  } else if (
    action === 'retarget'
    && uuidPattern.test(claim)
    && validVersion(v(form, 'version'))
    && uuidPattern.test(v(form, 'target'))
    && v(form, 'reason')
  ) {
    result = await db.rpc(
      'retarget_payroll_retroactive_claim',
      {
        p_claim: claim,
        p_version: Number(v(form, 'version')),
        p_target_period: v(form, 'target'),
        p_reason: v(form, 'reason'),
      }
    )
  } else if (
    action === 'post'
    && uuidPattern.test(claim)
    && validVersion(v(form, 'version'))
    && validVersion(v(form, 'period_version'))
    && v(form, 'note')
  ) {
    result = await db.rpc(
      'post_payroll_retroactive_claim',
      {
        p_claim: claim,
        p_version: Number(v(form, 'version')),
        p_period_version:
          Number(v(form, 'period_version')),
        p_reason: v(form, 'note'),
        p_key: randomUUID(),
      }
    )
  } else if (
    action === 'cancel'
    && uuidPattern.test(claim)
    && validVersion(v(form, 'version'))
    && v(form, 'note')
  ) {
    result = await db.rpc(
      'cancel_payroll_retroactive_claim',
      {
        p_claim: claim,
        p_version: Number(v(form, 'version')),
        p_reason: v(form, 'note'),
      }
    )
  } else {
    redirect(
      base +
      '?' +
      new URLSearchParams({
        error:
          'Biểu mẫu truy lĩnh không hợp lệ.',
      })
    )
  }

  const data = result?.data as
    | string
    | {
        claim_id?: string
        status?: string
      }
    | null

  const id =
    typeof data === 'string'
      ? data
      : data?.claim_id || claim

  const query = new URLSearchParams()

  if (id && uuidPattern.test(id)) {
    query.set('claim', id)
  }

  if (result?.error) {
    query.set(
      'error',
      friendly(result.error.message)
    )
  } else {
    query.set(
      'success',
      'Đã lưu thao tác truy lĩnh.'
    )
  }

  revalidatePath(base)
  revalidatePath('/admin/payroll', 'layout')
  revalidatePath('/documents/payslips', 'layout')

  redirect(base + '?' + query.toString())
}
