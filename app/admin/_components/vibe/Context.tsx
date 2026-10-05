'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
export default function HRContext() {
 const path = usePathname()
 if (!['/admin/hr', '/admin/employees', '/admin/teachers', '/admin/payroll', '/admin/session-teachers'].some(root => path === root || path.startsWith(root + '/'))) return null
 return <div className="vibe-context"><Link href="/admin/hr" prefetch={false}>HR</Link><span>/</span><span>Nhân sự · Công & lương</span></div>
}
