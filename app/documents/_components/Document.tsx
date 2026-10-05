import type { ReactNode } from 'react'
import PrintButton from './PrintButton'
export default function Document({ title, reference, children, actions }: { title: string; reference: string; children: ReactNode; actions?: ReactNode }) {
  return <><div className="document-actions flex flex-wrap gap-4"><PrintButton/>{actions}<p>Dùng chức năng In của trình duyệt để lưu PDF.</p></div><header className="border-b pb-4"><p className="font-bold">VIBE Academy</p><h1 className="text-2xl font-bold">{title}</h1><p>Tham chiếu: {reference}</p></header>{children}</>
}
