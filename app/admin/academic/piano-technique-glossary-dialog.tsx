'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from '@/app/admin/payroll/_ux/Dialog'

export function PianoTechniqueGlossaryDialog({ children, quickAccess = false }: { children: ReactNode; quickAccess?: boolean }) {
  const [open, setOpen] = useState(false)

  return <>
    <div className={quickAccess ? '' : 'vibe-card flex flex-wrap items-center justify-between gap-3'}>
      {!quickAccess && <div>
        <h2 className="font-semibold">Chú giải kỹ thuật</h2>
        <p className="mt-1 text-sm text-[var(--vibe-muted)]">Tra cứu ký hiệu, tên nốt và cách thực hiện khi cần.</p>
      </div>}
      <button type="button" className="vibe-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {quickAccess ? 'Chú giải kỹ thuật' : 'Mở chú giải'}
      </button>
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title="Chú giải kỹ thuật" subtitle="Piano · Grade 1–8">
      {children}
    </Modal>
  </>
}
