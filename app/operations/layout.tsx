import type { ReactNode } from 'react'
import StaffShell from '@/app/_components/StaffShell'

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>
}
