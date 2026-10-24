import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TeachingWorkspace from './workspace'
import type { Workspace } from './model'
export default async function TeacherSession({ params }: { params: Promise<{ id: string }> }) {
  const {id} = await params
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound()
  const db = await createClient(), auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const {data,error} = await db.rpc('teacher_session_workspace',{p_session:id})
  if (error?.message.includes('UNAUTHORIZED') || error?.message.includes('MISSING')) notFound()
  if (error || !data) return <main className="p-6">Không thể tải ca dạy. Vui lòng thử lại.</main>
  return <TeachingWorkspace data={data as Workspace} />
}
