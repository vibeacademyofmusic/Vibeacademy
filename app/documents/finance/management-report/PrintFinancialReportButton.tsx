'use client'

import { useEffect } from 'react'

export default function PrintFinancialReportButton({ title }: { title: string }) {
  useEffect(() => {
    document.title = title
  }, [title])
  return (
    <button type="button" onClick={() => window.print()}>
      In / Lưu PDF
    </button>
  )
}
