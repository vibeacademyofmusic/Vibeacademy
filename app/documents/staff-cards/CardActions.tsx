'use client'

export function CardActions({ backHref }: { backHref: string }) {
  return (
    <div className="document-actions flex flex-wrap gap-3">
      <button type="button" className="vibe-button vibe-button-primary" onClick={() => window.print()}>In / Tải PDF</button>
      <a className="vibe-button" href={backHref}>Về hồ sơ nhân sự</a>
    </div>
  )
}
