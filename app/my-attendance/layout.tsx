import type { ReactNode } from 'react'
import StaffShell from '@/app/_components/StaffShell'

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>
}
