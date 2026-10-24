import type { ReactNode } from 'react'
export default function TuitionLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-6">{children}</div>
}
