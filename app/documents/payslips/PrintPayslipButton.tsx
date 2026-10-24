'use client'

export default function PrintPayslipButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="
        rounded-lg
        border
        border-slate-300
        bg-white
        px-4
        py-2
        text-sm
        font-semibold
        text-slate-800
        shadow-sm
        transition
        hover:bg-slate-50
        focus:outline-none
        focus:ring-2
        focus:ring-amber-400
        focus:ring-offset-2
      "
    >
      In / Lưu PDF
    </button>
  )
}
