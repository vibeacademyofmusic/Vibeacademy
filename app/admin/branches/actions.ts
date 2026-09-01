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

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc(
    'has_role',
    {
      role_code: 'SUPER_ADMIN',
    }
  )

  if (roleError || !isSuperAdmin) {
    redirect('/login?error=Unauthorized')
  }

  return supabase
}

export async function createBranch(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()

  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()

  if (!code || !name) {
    redirect(
      '/admin/branches?error=Branch%20code%20and%20name%20are%20required'
    )
  }

  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
    redirect(
      '/admin/branches?error=Branch%20code%20must%20contain%20only%20letters%2C%20numbers%2C%20_%20or%20-'
    )
  }

  const { error } = await supabase.from('branches').insert({
    code,
    name,
    address: address || null,
    phone: phone || null,
    status: 'ACTIVE',
  })

  if (error) {
    if (error.code === '23505') {
      redirect(
        '/admin/branches?error=This%20branch%20code%20already%20exists'
      )
    }

    redirect('/admin/branches?error=Could%20not%20create%20branch')
  }

  revalidatePath('/admin')
  revalidatePath('/admin/branches')

  redirect('/admin/branches?success=Branch%20created%20successfully')
}

export async function updateBranch(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '')
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()

  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()

  if (!id || !code || !name) {
    redirect('/admin/branches?error=Invalid%20branch%20data')
  }

  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
    redirect(
      `/admin/branches/${id}?error=Invalid%20branch%20code`
    )
  }

  const { error } = await supabase
    .from('branches')
    .update({
      code,
      name,
      address: address || null,
      phone: phone || null,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      redirect(
        `/admin/branches/${id}?error=This%20branch%20code%20already%20exists`
      )
    }

    redirect(
      `/admin/branches/${id}?error=Could%20not%20update%20branch`
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/branches')
  revalidatePath(`/admin/branches/${id}`)

  redirect('/admin/branches?success=Branch%20updated%20successfully')
}

export async function setBranchStatus(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')

  if (
    !id ||
    !['ACTIVE', 'INACTIVE'].includes(status)
  ) {
    redirect('/admin/branches?error=Invalid%20branch%20status')
  }

  const { error } = await supabase
    .from('branches')
    .update({ status })
    .eq('id', id)

  if (error) {
    redirect(
      '/admin/branches?error=Could%20not%20change%20branch%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/branches')
}
