'use client'
import { useState } from 'react'

export default function CheckoutLink({ url }: { url: string }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Đã sao chép liên kết payOS.')
    } catch {
      setMessage('Không sao chép được. Hãy chọn và sao chép liên kết bên dưới.')
    }
  }
  return <div className="grid gap-2">
    <div className="flex flex-wrap gap-2">
      <a className="vibe-button vibe-button-primary" href={url}>Mở payOS</a>
      <button className="vibe-button" type="button" onClick={copy}>Sao chép liên kết</button>
    </div>
    <a className="break-all text-sm underline" href={url}>{url}</a>
    <p className="text-sm" role="status">{message}</p>
  </div>
}
