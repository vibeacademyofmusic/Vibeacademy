'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../finance/operations'

export async function inventoryAction(form: FormData) {
  const db = await adminClient()
  const value = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : ''
  const action = value('action')
  let result
  if (action === 'CREATE') {
    const code = value('code').toUpperCase(), name = value('name'), category = value('category'), unit = value('unit')
    if (!/^[A-Z0-9][A-Z0-9_-]{0,49}$/.test(code) || !name || name.length > 200 || !category || category.length > 100 || !unit || unit.length > 40) redirect('/admin/inventory?error=invalid')
    result = await db.rpc('create_inventory_item', { p_code: code, p_name: name, p_category: category, p_unit: unit })
  } else if (action === 'POST') {
    const request = value('request'), item = value('item'), branch = value('branch'), destination = value('destination'), kind = value('kind'), quantity = value('quantity'), reason = value('reason')
    if (![request, item, branch].every(id => uuidPattern.test(id)) || !['RECEIPT', 'OUTBOUND', 'TRANSFER', 'ADJUSTMENT'].includes(kind) || !/^-?\d{1,10}(\.\d{1,3})?$/.test(quantity) || Number(quantity) === 0 || Math.abs(Number(quantity)) > 1000000000 || (kind !== 'ADJUSTMENT' && Number(quantity) < 0) || !reason || reason.length > 2000 || (kind === 'TRANSFER' && (!uuidPattern.test(destination) || destination === branch))) redirect('/admin/inventory?error=invalid')
    result = await db.rpc('post_inventory_movement', { p_request: request, p_item: item, p_branch: branch, p_destination: kind === 'TRANSFER' ? destination : null, p_kind: kind, p_quantity: quantity, p_reason: reason })
  } else redirect('/admin/inventory?error=invalid')
  const target = new URLSearchParams()
  if (action === 'POST') { target.set('branch', value('branch')); target.set('item', value('item')) }
  if (result.error) {
    target.set('error', result.error.message === 'Insufficient inventory' ? 'stock' : 'failed')
    redirect('/admin/inventory?' + target)
  }
  revalidatePath('/admin/inventory')
  target.set('success', '1')
  redirect('/admin/inventory?' + target)
}
