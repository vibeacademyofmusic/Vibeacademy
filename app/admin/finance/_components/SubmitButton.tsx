'use client'
import { useFormStatus } from 'react-dom'
export default function SubmitButton({ children, className = 'rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus()
  return <button disabled={pending} className={className}>{pending ? 'Đang xử lý…' : children}</button>
}
