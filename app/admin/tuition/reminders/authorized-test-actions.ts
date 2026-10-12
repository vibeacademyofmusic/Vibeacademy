'use server'
import { adminClient,uuidPattern } from '../../finance/operations'
import { dispatchAuthorizedFixtureTest } from '@/lib/integrations/zalo/authorized-fixture-test'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { reminderActionHref } from './dialog-context'
export async function sendAuthorizedFixtureTest(form:FormData) {
 const db=await adminClient()
 const id=String(form.get('test_id') || '')
 if(!uuidPattern.test(id)) throw new Error('INVALID_TEST_ID')
 const result=await dispatchAuthorizedFixtureTest(db,id)
 const accepted=result.state==='ACCEPTED'
 revalidatePath('/admin/tuition/reminders')
 redirect(reminderActionHref(form,accepted?'Zalo đã tiếp nhận một tin kiểm thử. Chưa xác nhận phát tới máy.':result.state==='ALREADY_CLAIMED'?'Đợt thử này đã gửi hoặc đang đối soát. Không gửi trùng.':'Chưa xác nhận gửi kiểm thử. Giữ lịch sử để đối soát, không gửi lại tự động.',accepted?'success':'error',{key:'zalo',id:String(form.get('reminder_id') || '')}))
}
