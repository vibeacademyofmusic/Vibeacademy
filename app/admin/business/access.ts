import { operationalAdminOn } from '@/lib/auth/request'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

export type BusinessAccess = {
  reports: boolean
  campaigns: boolean
  returning: boolean
  instruments: boolean
  manageCampaigns: boolean
  manageReturning: boolean
  manageInstruments: boolean
}

export const fullBusinessAccess: BusinessAccess = {
  reports: true,
  campaigns: true,
  returning: true,
  instruments: true,
  manageCampaigns: true,
  manageReturning: true,
  manageInstruments: true,
}

const emptyBusinessAccess: BusinessAccess = {
  reports: false,
  campaigns: false,
  returning: false,
  instruments: false,
  manageCampaigns: false,
  manageReturning: false,
  manageInstruments: false,
}

export async function loadBranchBusinessAccess(db: SupabaseClient): Promise<BusinessAccess> {
  try {
    const response = await db.from('branches').select('id').eq('status', 'ACTIVE')
    const rows = response?.data
    if (!Array.isArray(rows) || rows.length === 0) return emptyBusinessAccess
    const ids = rows.map(row => row.id).filter((id): id is string => typeof id === 'string')
    if (!ids.length) return emptyBusinessAccess
    async function allowed(permission: string) {
      const checks = await Promise.all(ids.map(async id => {
        const result = await db.rpc('has_permission', { p_permission: permission, p_branch: id })
        return result?.data === true
      }))
      return checks.some(Boolean)
    }
    const [reports, campaigns, manageCampaigns, returning, manageReturning, instruments, manageInstruments] = await Promise.all([
      allowed('crm.view'),
      allowed('crm.campaign.view'),
      allowed('crm.campaign.manage'),
      allowed('crm.reactivation.view'),
      allowed('crm.reactivation.manage'),
      allowed('instrument_customer.view'),
      allowed('instrument_customer.manage'),
    ])
    return { reports, campaigns, manageCampaigns, returning, manageReturning, instruments, manageInstruments }
  } catch {
    return emptyBusinessAccess
  }
}

export async function loadBusinessAccess(): Promise<BusinessAccess> {
  const db = await createClient()
  const { data: isSuperAdmin, error } = await operationalAdminOn(db)
  if (!error && isSuperAdmin === true) return fullBusinessAccess
  return loadBranchBusinessAccess(db)
}
