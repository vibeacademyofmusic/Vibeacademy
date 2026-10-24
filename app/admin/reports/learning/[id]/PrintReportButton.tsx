'use client'
export default function PrintReportButton() {
  return <button type="button" className="rounded border px-4 py-2" onClick={() => window.print()}>PRINT / PDF</button>
}
