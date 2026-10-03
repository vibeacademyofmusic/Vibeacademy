'use client'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import styles from './payroll.module.css'

export function Modal({ open, onClose, title, subtitle, drawer = false, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; drawer?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    const previous = document.activeElement as HTMLElement | null
    if (!dialog.open) dialog.showModal()
    const beforeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { if (dialog.open) dialog.close(); document.body.style.overflow = beforeOverflow; previous?.focus() }
  }, [open])
  return <dialog ref={ref} aria-labelledby={id} className={`${styles.root} ${styles.dialog} ${drawer ? styles.drawer : ''}`} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose() } }}>
    <div className={styles.modalHead}><div><h2 id={id}>{title}</h2>{subtitle && <p className={styles.sub}>{subtitle}</p>}</div><button type="button" className={styles.close} aria-label="Đóng cửa sổ" onClick={onClose}>×</button></div>
    <div className={styles.modalBody}>{open ? children : null}</div>
  </dialog>
}
export function PayrollSubmit({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={disabled || pending} className={`${styles.btn} ${styles.primary}`}>{pending ? 'Đang xử lý…' : children}</button>
}
