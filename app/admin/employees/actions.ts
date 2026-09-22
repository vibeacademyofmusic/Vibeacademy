'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '../finance/operations'

function get(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}

function optional(form: FormData, key: string) {
  return get(form, key) || null
}

function privateError(message: string, code?: string) {
  if (code === '23505') {
    if (message.includes('employee_private_email_unique')) {
      return 'Email này đã thuộc một nhân viên khác.'
    }

    if (message.includes('employee_private_phone_unique')) {
      return 'Số điện thoại này đã thuộc một nhân viên khác.'
    }

    if (
      message.includes(
        'employee_private_citizen_id_unique'
      )
    ) {
      return 'Số CCCD này đã thuộc một nhân viên khác.'
    }

    return 'Email, số điện thoại hoặc CCCD bị trùng.'
  }

  const map: Record<string, string> = {
    EMPLOYEE_PRIVATE_UNAUTHORIZED:
      'Không có quyền quản lý thông tin riêng tư nhân viên.',

    EMPLOYEE_PRIVATE_EMPLOYEE_NOT_FOUND:
      'Không tìm thấy nhân viên.',

    EMPLOYEE_PRIVATE_INVALID_EMAIL:
      'Email không hợp lệ.',

    EMPLOYEE_PRIVATE_INVALID_PHONE:
      'Số điện thoại không hợp lệ. Nhập dạng 09xxxxxxxx hoặc +849xxxxxxxx.',

    EMPLOYEE_PRIVATE_INVALID_ADDRESS:
      'Địa chỉ phải có từ 5 đến 500 ký tự.',

    EMPLOYEE_PRIVATE_INVALID_CITIZEN_ID:
      'CCCD phải gồm đúng 12 chữ số.',

    EMPLOYEE_PRIVATE_REASON_REQUIRED:
      'Cần nhập lý do / căn cứ cập nhật.',
  }

  return (
    map[message] ||
    'Không thể lưu thông tin liên hệ / định danh.'
  )
}

async function assertSuperAdmin() {
  const db = await createClient()

  const result = await db.rpc('has_role', {
    role_code: 'SUPER_ADMIN',
  })

  if (result.error || result.data !== true) {
    redirect('/login')
  }

  return db
}

async function submit(
  form: FormData,
  operation:
    | 'create'
    | 'version'
    | 'link'
    | 'unit'
) {
  const db = await assertSuperAdmin()

  const reason = get(form, 'reason')

  if (!reason) {
    redirect(
      '/admin/employees?error=' +
        encodeURIComponent('Cần nhập lý do')
    )
  }

  const common = {
    p_full_name: get(form, 'full_name'),
    p_group: get(form, 'employee_group'),
    p_pay_type: get(form, 'pay_type'),
    p_role: optional(
      form,
      'operational_role_id'
    ),
    p_reason: reason,
  }

  const employee = get(form, 'employee_id')

  const result =
    operation === 'create'
      ? await db.rpc(
          'create_employee_with_private_profile',
          {
            ...common,

            p_home: get(form, 'home_unit'),

            p_hire_date: get(
              form,
              'hire_date'
            ),

            p_profile: optional(
              form,
              'profile_id'
            ),

            p_teacher: optional(
              form,
              'teacher_id'
            ),

            p_email: get(form, 'email'),

            p_phone: get(form, 'phone'),

            p_address: get(
              form,
              'address'
            ),

            p_citizen_id: get(
              form,
              'citizen_id'
            ),
          }
        )
      : operation === 'version'
        ? await db.rpc(
            'set_employee_version',
            {
              ...common,

              p_employee: employee,

              p_expected_version:
                Number(
                  get(
                    form,
                    'expected_version'
                  )
                ),

              p_effective_on: get(
                form,
                'effective_on'
              ),

              p_unit: get(
                form,
                'unit_code'
              ),

              p_status: get(
                form,
                'employment_status'
              ),
            }
          )
        : operation === 'link'
          ? await db.rpc(
              'link_employee_identity',
              {
                p_employee: employee,

                p_profile: optional(
                  form,
                  'profile_id'
                ),

                p_teacher: optional(
                  form,
                  'teacher_id'
                ),

                p_reason: reason,
              }
            )
          : await db.rpc(
              'configure_employee_unit',
              {
                p_unit: get(
                  form,
                  'unit_code'
                ),

                p_branch: optional(
                  form,
                  'branch_id'
                ),

                p_reason: reason,
              }
            )

  const selected =
    operation === 'create' && !result.error
      ? String(result.data)
      : employee

  const query = new URLSearchParams(
    selected ? { selected } : {}
  )

  if (result.error) {
    query.set(
      'error',
      operation === 'create'
        ? privateError(
            result.error.message,
            result.error.code
          )
        : result.error.message
    )
  } else {
    revalidatePath('/admin/employees')

    query.set(
      'success',
      operation === 'create'
        ? 'Đã tạo nhân viên cùng thông tin liên hệ và định danh.'
        : 'Đã lưu hồ sơ và lịch sử thay đổi.'
    )
  }

  redirect(
    '/admin/employees?' + query.toString()
  )
}

export async function createEmployee(form: FormData) {
  await submit(form, 'create')
}

export async function updateEmployment(
  form: FormData
) {
  await submit(form, 'version')
}

export async function linkIdentity(form: FormData) {
  await submit(form, 'link')
}

export async function configureUnit(form: FormData) {
  await submit(form, 'unit')
}

export async function updatePrivateProfile(
  form: FormData
) {
  const db = await assertSuperAdmin()

  const employee = get(
    form,
    'employee_id'
  )

  if (!uuidPattern.test(employee)) {
    redirect('/admin/employees')
  }

  const reason = get(
    form,
    'private_reason'
  )

  const query = new URLSearchParams({
    selected: employee,
  })

  if (!reason) {
    query.set(
      'error',
      'Cần nhập lý do / căn cứ cập nhật thông tin.'
    )

    redirect(
      '/admin/employees?' +
        query.toString()
    )
  }

  const result = await db.rpc(
    'update_employee_private_profile',
    {
      p_employee: employee,
      p_email: get(form, 'email'),
      p_phone: get(form, 'phone'),
      p_address: get(form, 'address'),

      // Nếu đã có CCCD và không muốn đổi,
      // để field này trống.
      p_citizen_id:
        get(form, 'citizen_id') || null,

      p_reason: reason,
    }
  )

  if (result.error) {
    query.set(
      'error',
      privateError(
        result.error.message,
        result.error.code
      )
    )
  } else {
    revalidatePath('/admin/employees')

    query.set(
      'success',
      'Đã cập nhật thông tin liên hệ / định danh.'
    )
  }

  redirect(
    '/admin/employees?' + query.toString()
  )
}
