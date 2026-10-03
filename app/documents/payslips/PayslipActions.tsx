'use client'

import { useState } from 'react'

type Props = {
  reference: string
  period: string
}

function cleanFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function PayslipActions({
  reference,
  period,
}: Props) {
  const [status, setStatus] = useState('')

  const filename = cleanFilename(
    `VIBE-PHIEU-LUONG-${period}-${reference.slice(0, 8)}`
  )

  function savePdf() {
    const previousTitle = document.title

    const restoreTitle = () => {
      document.title = previousTitle

      window.removeEventListener(
        'afterprint',
        restoreTitle
      )
    }

    document.title = filename

    window.addEventListener(
      'afterprint',
      restoreTitle
    )

    setStatus(
      'Chọn “Save as PDF” trong hộp thoại in. Khổ giấy đã được cố định A5.'
    )

    requestAnimationFrame(() => {
      window.print()
    })
  }

  async function sendZalo() {
    const url = window.location.href

    const text =
      `VIBE Academy - Phiếu lương kỳ ${period}. ` +
      'Vui lòng xem nội dung phiếu lương tại đường dẫn đính kèm.'

    try {
      if (
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          title: `Phiếu lương VIBE - ${period}`,
          text,
          url,
        })

        setStatus(
          'Đã mở bảng chia sẻ. Chọn Zalo và người nhận.'
        )

        return
      }

      const message = `${text}\n${url}`

      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(
            message
          )
        }
      } catch {
        // Zalo Web vẫn được mở ngay cả khi clipboard
        // không khả dụng.
      }

      window.open(
        'https://chat.zalo.me/',
        '_blank',
        'noopener,noreferrer'
      )

      setStatus(
        'Đã mở Zalo Web. Link phiếu lương đã được sao chép nếu trình duyệt cho phép.'
      )
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        setStatus('Đã hủy chia sẻ.')
        return
      }

      setStatus(
        'Không mở được chia sẻ Zalo trên trình duyệt này.'
      )
    }
  }

  return (
    <div className="print:hidden">
      <div
        className="
          flex
          flex-wrap
          items-center
          justify-end
          gap-2
        "
      >
        <button
          type="button"
          onClick={savePdf}
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
          Lưu PDF A5 / In
        </button>

        <button
          type="button"
          onClick={sendZalo}
          aria-label="Gửi phiếu lương qua Zalo"
          className="
            rounded-lg
            bg-[#0068ff]
            px-4
            py-2
            text-sm
            font-semibold
            text-white
            shadow-sm
            transition
            hover:opacity-90
            focus:outline-none
            focus:ring-2
            focus:ring-[#0068ff]
            focus:ring-offset-2
          "
        >
          Gửi
        </button>
      </div>

      {status && (
        <p
          role="status"
          className="
            mt-2
            text-right
            text-xs
            text-slate-500
          "
        >
          {status}
        </p>
      )}
    </div>
  )
}
