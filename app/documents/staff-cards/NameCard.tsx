import { cardInitials, type PublicCard } from '@/lib/staff/profile'
import './card.css'

export function NameCard({ card, portraitUrl }: { card: PublicCard; portraitUrl: string | null }) {
  const initials = cardInitials(card.fullName || 'VIBE')
  return (
    <article className="staff-card" aria-label={`Thẻ nhân sự ${card.fullName}`}>
      <header className="staff-card-brand">
        <img src="/vibe-logo.png" alt="VIBE Academy" />
        <p>VIBE Academy</p>
      </header>
      <div className="staff-card-portrait">
        {portraitUrl
          ? <img src={portraitUrl} alt="" />
          : <div className="staff-card-placeholder" aria-hidden="true"><span>{initials}</span><small>VIBE</small></div>}
      </div>
      <h2>{card.fullName || 'Chưa có họ tên'}</h2>
      <p className="staff-card-code">{card.employeeCode}</p>
      <div className="staff-card-badges">
        {card.teachingBadges.map(badge => <span key={badge}>{badge}</span>)}
        {card.positionBadges.map(badge => <span key={badge} data-kind="position">{badge}</span>)}
      </div>
      {card.branchName ? <p className="staff-card-branch">Chi nhánh {card.branchName}</p> : null}
    </article>
  )
}
