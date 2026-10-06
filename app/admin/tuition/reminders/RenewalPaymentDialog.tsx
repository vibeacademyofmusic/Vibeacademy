'use client'

import { useRef, type ReactNode } from 'react'

export function RenewalPaymentDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <div>
      <button type="button" className="rounded border px-3 py-2" onClick={() => dialog.current?.showModal()}>Tạo gia hạn học phí</button>
      <dialog ref={dialog} className="w-[min(40rem,92vw)] rounded border p-4">
        <h2 className="text-xl font-semibold">Tạo gia hạn học phí</h2>
        {children}
        <form method="dialog"><button className="mt-3 rounded border px-3 py-2" type="submit">Đóng</button></form>
      </dialog>
    </div>
  )
}
