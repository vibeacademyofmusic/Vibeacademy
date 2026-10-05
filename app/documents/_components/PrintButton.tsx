'use client'
export default function PrintButton() {
  return <button type="button" className="rounded border px-4 py-2" onClick={() => window.print()}>In / Lưu PDF</button>
}
