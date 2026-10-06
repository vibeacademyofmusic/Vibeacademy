'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
export async function postLearningMessage(form: FormData) {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (!auth.data?.claims) redirect('/login')
  const kind = String(form.get('kind')), id = String(form.get('id'))
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!['REPORT','FEEDBACK'].includes(kind) || !uuid.test(id)) redirect('/my-learning')
  const path = `/my-learning/conversations/${kind.toLowerCase()}/${id}`
  const result = await db.rpc('learning_conversation_write', {
    p_kind: kind, p_entity: id, p_request: String(form.get('request')),
    p_version: Number(form.get('version')), p_body: String(form.get('body') ?? '').trim(),
    p_internal: form.get('internal') === 'yes', p_resolve: form.get('resolve') === 'yes',
    p_assignee: form.get('claim') === 'yes' ? auth.data.claims.sub : null,
  })
  revalidatePath(path)
  redirect(path + (result.error ? '?error=1' : '?saved=1'))
}
