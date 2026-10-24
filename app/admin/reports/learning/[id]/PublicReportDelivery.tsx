import { Panel, Confirm, timeText } from '../../../finance/_components/ui'
import SubmitButton from '../../../finance/_components/SubmitButton'
import { manageReportLink } from '../actions'

export type PublicReportLink = { path: string | null; revoked_at: string | null; pdf_state: string; pdf_error: string | null; request_count: number; last_requested_at: string | null }

export default function PublicReportDelivery({ reportId, link, loadError, origin, sendEnabled }: {
  reportId: string; link: PublicReportLink | null; loadError: boolean; origin: string | null; sendEnabled: boolean
}) {
  const form = (action: string, label: string, confirmation?: string) => <form action={manageReportLink} className="space-y-3">
    <input type="hidden" name="id" value={reportId} /><input type="hidden" name="action" value={action} />
    {confirmation && <Confirm text={confirmation} />}<SubmitButton className="vibe-button vibe-button-primary">{label}</SubmitButton>
  </form>
  const href = link?.path ? (origin ?? '') + link.path : null
  return <Panel title="Gửi báo cáo cho phụ huynh">
    <p>Phụ huynh bấm nút trong tin Zalo để mở bản PDF đã duyệt, không cần đăng nhập.</p>
    {loadError ? <p role="alert">Chưa tải được trạng thái đường dẫn. Vui lòng tải lại hoặc kiểm tra migration.</p>
      : !link ? <><p>Báo cáo này chưa có đường dẫn xem ngay.</p>{form('CREATE', 'Tạo đường dẫn PDF', 'Cho phép người có đường dẫn xem báo cáo này')}</>
      : link.revoked_at ? <p>Đã thu hồi đường dẫn lúc {timeText(link.revoked_at)}. Tin đã gửi sẽ không mở được báo cáo này.</p>
      : <>
        <p><strong>{link.pdf_state === 'READY' ? 'PDF sẵn sàng' : link.pdf_state === 'FAILED' ? 'Chưa tạo được PDF' : 'Đang chuẩn bị PDF'}</strong> · Bản nội dung đã khóa khi duyệt.</p>
        {href && link.pdf_state === 'READY' && <div className="flex flex-wrap gap-3">
          <a className="vibe-button" href={href} target="_blank" rel="noreferrer">Xem PDF như phụ huynh</a>
          <a className="vibe-button" href={href + '?download=1'} target="_blank" rel="noreferrer">Tải PDF</a>
        </div>}
        {link.pdf_state !== 'READY' && form('PREPARE', 'Chuẩn bị lại PDF')}
        <p>Ai có đường dẫn đều có thể xem và chuyển tiếp. Không đưa ghi chú quản trị vào PDF.</p>
        <p>Lượt yêu cầu PDF: <strong>{link.request_count}</strong>{link.last_requested_at && ` · Gần nhất: ${timeText(link.last_requested_at)}`}.</p>
        <p className="text-sm">Lượt mở có thể bao gồm xem trước tự động; không xác nhận danh tính hoặc việc phụ huynh đã đọc.</p>
        {form('REVOKE', 'Thu hồi đường dẫn', 'Ngừng cho phép mở PDF từ đường dẫn trong tin đã gửi')}
      </>}
    {!origin && <p>Chưa cấu hình tên miền công khai cho báo cáo. Link mở ở môi trường hiện tại chưa dùng để gửi ZBS.</p>}
    <p>{sendEnabled ? 'Gửi tự động đã bật; từng lượt vẫn phải có PDF sẵn sàng, mẫu đã duyệt và phụ huynh kết nối Zalo hợp lệ.' : 'Gửi ZBS đang tắt. Cần mẫu báo cáo được duyệt, cấu hình tên miền và bật riêng tính năng gửi báo cáo.'}</p>
    <p>Trạng thái phát hành, Zalo nhận yêu cầu gửi và lượt mở PDF được ghi nhận riêng.</p>
  </Panel>
}
