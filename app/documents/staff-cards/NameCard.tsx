import QRCode from 'qrcode'
import { headers } from 'next/headers'
import { cardInitials, STAFF_POSITIONS, type PublicCard } from '@/lib/staff/profile'
import './card.css'

export async function NameCard({ card, portraitUrl, employeeId }: { card: PublicCard; portraitUrl: string | null; employeeId: string }) {
  const requestHeaders = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL || `http://${requestHeaders.get('host') || 'localhost:3000'}`
  const destination = new URL(`/admin/employees?selected=${encodeURIComponent(employeeId)}`, origin).toString()
  const qr = await QRCode.toDataURL(destination, { errorCorrectionLevel: 'M', margin: 4, width: 512, color: { dark: '#192c42', light: '#ffffff' } })
  const roles = [...card.positionBadges, ...card.teachingBadges]
  const englishRole = (role: string) => (STAFF_POSITIONS.find(position => position.vi === role)?.en || role)
    .replace(/^Giáo viên /, 'Teacher · ').replace(/^Trợ giảng /, 'Teaching assistant · ')
    .replace('Thanh nhạc', 'Vocals').replace('Trống', 'Drums').replace('Đàn phím', 'Keyboard')
  return (
    <div className="staff-card-set">
      {(['vi', 'en'] as const).map(language => {
        const english = language === 'en'
        const labels = roles.map(role => english ? englishRole(role) : role)
        return <article key={language} lang={language} className="staff-card staff-card-bilingual" aria-label={english ? `Staff card ${card.fullName} — English` : `Thẻ nhân sự ${card.fullName} — Tiếng Việt`}>
          <div className="staff-card-frame" aria-hidden="true"><span>❦</span><span>❦</span></div>
          <header className="staff-card-brand">
            <img src="/vibe-logo.png" alt="VIBE Academy" />
            <div>{english ? 'ACADEMY OF MUSIC & CINEMA' : 'HỌC VIỆN ÂM NHẠC & ĐIỆN ẢNH'}<small>{english ? 'STAFF IDENTIFICATION CARD' : 'THẺ NHÂN SỰ'}</small></div>
          </header>
          <div className="staff-card-body">
            <div className="staff-card-portrait">
              {portraitUrl ? <img src={portraitUrl} alt="" /> : <div className="staff-card-placeholder">{cardInitials(card.fullName || 'VIBE')}</div>}
            </div>
            <div className="staff-card-identity">
              <p className="staff-card-role">{labels.slice(0, 2).join(' · ') || (english ? 'VIBE staff' : 'Nhân sự VIBE')}{labels.length > 2 ? ` · +${labels.length - 2}` : ''}</p>
              <h2>{card.fullName || (english ? 'Name not provided' : 'Chưa có họ tên')}</h2>
              <p className="staff-card-code">{card.employeeCode}</p>
              {card.branchName && <p className="staff-card-branch">{card.branchName}</p>}
            </div>
          </div>
          <div className="staff-card-lookup">
            <a href={destination} aria-label={english ? `Open staff profile: ${card.fullName}` : `Mở hồ sơ nhân sự ${card.fullName}`}><img className="staff-card-qr" src={qr} alt={english ? 'Staff profile QR code' : 'Mã QR hồ sơ nhân sự'} /></a>
            <div><strong>{english ? 'STAFF PROFILE' : 'HỒ SƠ NHÂN SỰ'}</strong><p>{english ? 'Scan to look up' : 'Quét mã để tra cứu'}</p><small>{english ? 'Authorized access only' : 'Cần quyền truy cập'}</small></div>
          </div>
          <footer className="staff-card-footer"><span>{english ? 'MUSIC · CINEMA · EDUCATION' : 'ÂM NHẠC · ĐIỆN ẢNH · GIÁO DỤC'}</span></footer>
        </article>
      })}
      <p className="staff-card-print-note document-actions">Hai mặt cùng thông tin · Tiếng Việt / English · 53,98 × 85,60 mm. In ở tỷ lệ 100%, tắt đầu/chân trang. QR dùng địa chỉ hệ thống hiện tại; trước khi in thẻ chính thức, cần dùng tên miền truy cập lâu dài.</p>
    </div>
  )
}
