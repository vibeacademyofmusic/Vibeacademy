import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoadError } from '../finance/_components/ui'
import ClassOpsWorkspace from '../classes/_ops/Workspace'
import { loadClassOps } from '../classes/_ops/data'

type Props = { searchParams: Promise<Record<string, string | undefined>> }

export default async function RoomsPage({ searchParams }: Props) {
  const params = await searchParams
  const db = await createClient()
  const { data: claims } = await db.auth.getClaims()
  if (!claims?.claims) redirect('/login')
  let data
  try {
    data = await loadClassOps(db, params, 'rooms')
  } catch (error) {
    console.error('loadClassOps rooms failed', error)
    return <LoadError />
  }
  return <ClassOpsWorkspace params={{ ...params, view: 'rooms' }} data={data} view="rooms" />
}
