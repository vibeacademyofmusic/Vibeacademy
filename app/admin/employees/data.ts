import type { SupabaseClient } from '@supabase/supabase-js'
import type { Params } from '../finance/operations'

export type Employment = {
  version: number
  effective_on: string
  full_name: string
  unit_code: string
  employee_group: string
  employment_status: string
  end_date: string | null
  pay_type: string
  operational_role_id: string | null
  reason: string
  created_at: string
  created_by: string
}

export type Employee = Partial<Employment> & {
  id: string
  employee_code: string
  home_unit: string
  hire_date: string
  profile_id: string | null
  teacher_id: string | null
  latest_version: number
  latest_effective_on: string
}

export type PrivateProfile = {
  employee_id: string
  email: string
  phone: string
  address: string
  citizen_id_masked: string
  has_citizen_id: boolean
  updated_at: string
}

export async function employeeData(
  db: SupabaseClient,
  params: Params
) {
  const page = Math.max(
    1,
    Math.min(
      10000,
      Number.parseInt(params.page || '1') || 1
    )
  )

  let query = db
    .from('employee_directory')
    .select('*')
    .order('employee_code')
    .range((page - 1) * 25, page * 25)

  if (params.unit) {
    query = query.eq('unit_code', params.unit)
  }

  if (params.status) {
    query = query.eq(
      'employment_status',
      params.status
    )
  }

  const results = await Promise.all([
    query.returns<Employee[]>(),

    db
      .from('organization_units')
      .select('code,name,branch_id')
      .order('code'),

    db
      .from('branches')
      .select('id,name')
      .eq('status', 'ACTIVE')
      .order('name'),

    db
      .from('roles')
      .select('id,code')
      .order('code'),

    params.selected
      ? db
          .from('employee_directory')
          .select('*')
          .eq('id', params.selected)
          .maybeSingle<Employee>()
      : Promise.resolve({
          data: null,
          error: null,
        }),

    params.selected
      ? db
          .from('employee_versions')
          .select('*')
          .eq('employee_id', params.selected)
          .order('version', {
            ascending: false,
          })
          .limit(50)
          .returns<Employment[]>()
      : Promise.resolve({
          data: [],
          error: null,
        }),

    params.selected
      ? db
          .from('employee_audit')
          .select(
            'id,action,reason,actor,created_at'
          )
          .eq('employee_id', params.selected)
          .order('created_at', {
            ascending: false,
          })
          .limit(50)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ])

  if (results.some((r) => r.error)) {
    throw new Error('Could not load employees')
  }

  let privateProfile: PrivateProfile | null = null

  if (params.selected) {
    const privateResult = await db.rpc(
      'employee_private_profile_summary',
      {
        p_employee: params.selected,
      }
    )

    if (!privateResult.error && privateResult.data) {
      privateProfile =
        privateResult.data as PrivateProfile
    }
  }

  return {
    data: (results[0].data || []).slice(0, 25),

    more:
      (results[0].data?.length || 0) > 25,

    page,

    units: results[1].data || [],
    branches: results[2].data || [],
    roles: results[3].data || [],
    employee: results[4].data,
    versions: results[5].data || [],
    audit: results[6].data || [],
    privateProfile,
  }
}
