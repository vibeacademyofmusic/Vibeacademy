'use client'
import { useId, useState, type ReactNode } from 'react'
import { Modal as BaseModal } from '../../payroll/_ux/Dialog'
export const Modal = BaseModal
export function Drawer(props: Parameters<typeof BaseModal>[0]) { return <BaseModal {...props} drawer/> }
export function Tabs({ items }: { items: { label: string; content: ReactNode }[] }) {
 const [selected, setSelected] = useState(0), id = useId()
 return <><div className="vibe-tabs" role="tablist">{items.map((item, index) => <button key={item.label} id={`${id}-tab-${index}`} role="tab" aria-selected={index === selected} aria-controls={`${id}-panel`} tabIndex={index === selected ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length; setSelected(next); document.getElementById(`${id}-tab-${next}`)?.focus() } }}>{item.label}</button>)}</div><section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`}>{items[selected]?.content}</section></>
}
