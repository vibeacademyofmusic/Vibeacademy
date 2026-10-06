'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { Modal } from '../../_components/vibe'

/** Same accessible, scroll-locked dialog used by student video links. */
export default function ReminderDialog({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter()
  return <Modal open title={title} onClose={() => router.replace(closeHref, { scroll: false })}>{children}</Modal>
}
