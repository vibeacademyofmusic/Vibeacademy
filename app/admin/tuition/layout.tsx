import Link from 'next/link'
import type { ReactNode } from 'react'
export default function TuitionLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-6"><nav className="flex flex-wrap gap-4" aria-label="Học phí"><Link prefetch={false} href="/admin/tuition">Kỳ học phí</Link><Link prefetch={false} href="/admin/tuition/reminders">Nhắc học phí</Link></nav>{children}</div>
}
