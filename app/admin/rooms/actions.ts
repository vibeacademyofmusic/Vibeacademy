'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

async function requireSuperAdmin() {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data: isSuperAdmin, error: roleError } =
    await supabase.rpc('has_role', {
      role_code: 'SUPER_ADMIN',
    })

  if (roleError || !isSuperAdmin) {
    redirect('/login?error=Unauthorized')
  }

  return supabase
}

export async function createRoom(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const branchId = String(
    formData.get('branch_id') ?? ''
  ).trim()

  const code = String(
    formData.get('code') ?? ''
  )
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()

  const name = String(
    formData.get('name') ?? ''
  ).trim()

  const capacityRaw = String(
    formData.get('capacity') ?? ''
  ).trim()

  const notes = String(
    formData.get('notes') ?? ''
  ).trim()

  if (!branchId || !code || !name) {
    redirect(
      '/admin/rooms?error=Branch%2C%20room%20code%20and%20name%20are%20required'
    )
  }

  let capacity: number | null = null

  if (capacityRaw) {
    capacity = Number(capacityRaw)

    if (!Number.isInteger(capacity) || capacity <= 0) {
      redirect(
        '/admin/rooms?error=Room%20capacity%20must%20be%20a%20positive%20integer'
      )
    }
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('id, status')
    .eq('id', branchId)
    .maybeSingle()

  if (!branch || branch.status !== 'ACTIVE') {
    redirect(
      '/admin/rooms?error=Branch%20is%20not%20active'
    )
  }

  const { error } = await supabase
    .from('rooms')
    .insert({
      branch_id: branchId,
      code,
      name,
      capacity,
      notes: notes || null,
      status: 'ACTIVE',
    })

  if (error) {
    console.error('Create room error:', error)

    if (error.code === '23505') {
      redirect(
        '/admin/rooms?error=This%20room%20code%20already%20exists%20in%20the%20selected%20branch'
      )
    }

    redirect(
      '/admin/rooms?error=Could%20not%20create%20room'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/rooms')

  redirect(
    '/admin/rooms?success=Room%20created%20successfully'
  )
}

export async function setRoomStatus(
  formData: FormData
) {
  const supabase = await requireSuperAdmin()

  const id = String(
    formData.get('id') ?? ''
  ).trim()

  const status = String(
    formData.get('status') ?? ''
  ).trim()

  if (
    !id ||
    !['ACTIVE', 'INACTIVE'].includes(status)
  ) {
    redirect(
      '/admin/rooms?error=Invalid%20room%20status'
    )
  }

  const { error } = await supabase
    .from('rooms')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('Room status error:', error)

    redirect(
      '/admin/rooms?error=Could%20not%20change%20room%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/rooms')

  redirect(
    '/admin/rooms?success=Room%20status%20updated'
  )
}