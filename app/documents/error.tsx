'use client'
export default function DocumentError({ reset }: { reset: () => void }) {
  return <div role="alert"><p>Không tải được chứng từ. Chưa thể xác nhận số liệu.</p><button type="button" onClick={reset}>Thử lại</button></div>
}
