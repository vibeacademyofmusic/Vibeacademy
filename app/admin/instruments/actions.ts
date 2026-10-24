'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '../finance/operations'
export async function instrumentAction(form: FormData) {
  const db = await adminClient(), get = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : ''
  const text = (v: string, max: number) => v.length > 0 && v.length <= max
  const money = (v: string) => /^\d{1,13}(\.\d{1,2})?$/.test(v) && Number(v) <= 1000000000000
  const action = get('action'), request = get('request'), model = get('model'), unit = get('unit')
  const target = new URLSearchParams()
  if (uuidPattern.test(model)) target.set('model', model)
  if (uuidPattern.test(unit)) target.set('unit', unit)
  let result
  if (action === 'MODEL') {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(get('code')) || !text(get('name'),200) || !text(get('category'),100) || !text(get('brand'),100) || !text(get('model_name'),100)) redirect('/admin/instruments?error=invalid')
    result = await db.rpc('create_instrument_model', { p_code:get('code'),p_name:get('name'),p_category:get('category'),p_brand:get('brand'),p_model:get('model_name') })
    if (!result.error && typeof result.data === 'string') target.set('model', result.data)
  } else if (action === 'RECEIVE') {
    if (![request,model,get('branch')].every(id => uuidPattern.test(id)) || !text(get('serial'),150) || !text(get('supplier'),200) || !money(get('cost')) || !money(get('price')) || !/^[A-Z]{3}$/.test(get('currency')) || !text(get('reason'),2000)) redirect('/admin/instruments?error=invalid')
    result = await db.rpc('receive_instrument', { p_request:request,p_item:model,p_serial:get('serial'),p_branch:get('branch'),p_supplier:get('supplier'),p_cost:get('cost'),p_price:get('price'),p_currency:get('currency'),p_reason:get('reason') })
    if (!result.error && typeof result.data === 'string') target.set('unit', result.data)
  } else if (action === 'TRANSFER' || action === 'SALE') {
    if (![request,unit].every(id => uuidPattern.test(id)) || !text(get('reason'),2000) || (action === 'TRANSFER' && !uuidPattern.test(get('destination'))) || (action === 'SALE' && (!money(get('price')) || !/^[A-Z]{3}$/.test(get('currency')) || (get('warranty') && !validDate(get('warranty')))))) redirect('/admin/instruments?error=invalid')
    result = await db.rpc('move_instrument', { p_request:request,p_unit:unit,p_kind:action,p_destination:action === 'TRANSFER' ? get('destination') : null,p_sale_price:action === 'SALE' ? get('price') : null,p_currency:action === 'SALE' ? get('currency') : null,p_warranty_until:action === 'SALE' ? get('warranty') || null : null,p_reason:get('reason') })
  } else redirect('/admin/instruments?error=invalid')
  if (result.error) { target.set('error','failed'); redirect('/admin/instruments?' + target) }
  revalidatePath('/admin/instruments'); revalidatePath('/admin/inventory')
  target.set('success','1'); redirect('/admin/instruments?' + target)
}
