'use client'
import { useFormStatus } from 'react-dom'
export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{pending ? 'Đang xử lý…' : children}</button>
}
