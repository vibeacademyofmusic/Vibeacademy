import Link from 'next/link'
import { adminClient } from '../../finance/operations'
import NotationEditor from '../../../learn/components/NotationEditor'
export default async function NotationWorkbench(){
  await adminClient()
  return <main className="min-w-0 space-y-5 p-4 sm:p-6"><Link prefetch={false} href="/admin/elearning">Về nội dung học</Link><h1 className="text-2xl font-semibold">Kiểm tra ký âm</h1><p>Không lưu kết quả, không cấp điểm. Dùng để kiểm tra cách nhập và hiển thị trước khi soạn câu hỏi.</p><NotationEditor name="notation_preview"/></main>
}
