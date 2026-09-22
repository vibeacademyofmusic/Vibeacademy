import { SectionCard, DataTable } from '../../_components/vibe'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Params } from '../operations'
export const inputClass = 'w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2'
export function Field({ name, label, type = 'text', value, required = true, max }: { name: string; label: string; type?: string; value?: string; required?: boolean; max?: number }) {
  return <label className="block min-w-0 space-y-1 text-sm"><span>{label}</span><input className={inputClass} name={name} type={type} defaultValue={value} required={required} max={max} maxLength={2000} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0.01' : undefined} /></label>
}
export function Select({ name, label, options, value, required = false, emptyLabel = 'Tất cả' }: { name: string; label: string; options: { id: string; name: string }[]; value?: string; required?: boolean; emptyLabel?: string }) {
  return <label className="block min-w-0 space-y-1 text-sm"><span>{label}</span><select className={inputClass} name={name} defaultValue={value ?? ''} required={required}><option value="">{required ? 'Chọn…' : emptyLabel}</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
}
export function Confirm({ text }: { text: string }) {
  return <label className="flex items-start gap-2 text-sm text-amber-900"><input className="mt-1" type="checkbox" name="confirm" value="yes" required /><span>{text}</span></label>
}
export function Notice({ params }: { params: Params }) {
  return <>{params.error && <p role="alert" className="rounded bg-amber-50 p-4 text-amber-900">{params.error}</p>}{params.success && <p role="status" className="rounded bg-green-50 p-4 text-green-900">{params.success}</p>}</>
}
export function LoadError() { return <p role="alert" className="rounded bg-amber-50 p-4">Không tải được dữ liệu. Vui lòng thử lại.</p> }
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <SectionCard title={title}>{children}</SectionCard> }
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <DataTable headers={headers} rows={rows}/> }
export function Pager({ path, params, page, more, keyName = 'page' }: { path: string; params: Params; page: number; more: boolean; keyName?: string }) {
  const href = (n: number) => {
    const q = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value && !['error', 'success'].includes(key)) q.set(key, value)
    q.set(keyName, String(n)); return `${path}?${q}`
  }
  return <nav aria-label="Phân trang" className="flex flex-wrap gap-4 text-sm">{page > 1 && <Link prefetch={false} href={href(page - 1)}>Trang trước</Link>}<span>Trang {page}</span>{more && <Link prefetch={false} href={href(page + 1)}>Trang tiếp</Link>}</nav>
}
export const dateText = (value: string | null) => value ? value.split('-').reverse().join('/') : '—'
export const timeText = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
