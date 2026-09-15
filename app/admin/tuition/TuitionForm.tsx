'use client'
import { useActionState, useState, startTransition, type ChangeEvent } from 'react'
import { createTerm, editDiscount, type FormState } from './actions'
const money = (value: number, currency: string) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value))
import { dateText, inputClass } from '../finance/_components/ui'
export default function TuitionForm({ enrollment, plans = [], term }: {
  enrollment?: string; plans?: { id: string; name: string }[];
  term?: { id: string; discount_type: string; discount_value: number; discount_name: string | null }
}) {
  const [state, action, pending] = useActionState(term ? editDiscount : createTerm, {} as FormState)
  const [previewInput, setPreviewInput] = useState('')
  // Dispatch explicitly so preview actions do not trigger native form reset.
  const [values, setValues] = useState({ tuition_plan_id: plans[0]?.id ?? '', starts_on: '', discount_type: term?.discount_type ?? 'NONE', discount_value: String(term?.discount_value ?? 0), discount_name: term?.discount_name ?? '', notes: '' })
  const control = (name: keyof typeof values) => ({ value: values[name], onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues(previous => ({ ...previous, [name]: event.target.value })) })
  return <form onSubmit={event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    form.set('intent', submitter?.value ?? 'preview')
    setPreviewInput(submitter?.value === 'preview' ? JSON.stringify(values) : '')
    startTransition(() => action(form))
  }} className="space-y-3">
    {state.error && <p role="alert" className="text-amber-900">{state.error}</p>}
    <input type="hidden" name={term ? 'tuition_id' : 'enrollment_id'} value={term?.id ?? enrollment} />
    {!term && <div className="grid gap-3 sm:grid-cols-2">
      <label>Gói học phí<select className={inputClass} name="tuition_plan_id" {...control('tuition_plan_id')} required>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Ngày bắt đầu<input className={inputClass} name="starts_on" {...control('starts_on')} type="date" /><span className="text-sm text-gray-600">Để trống: ngày bắt đầu học hoặc ngày sau kỳ hiện tại.</span></label>
    </div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <label>Loại chiết khấu<select className={inputClass} name="discount_type" {...control('discount_type')}><option value="NONE">Không giảm</option><option value="PERCENT">Phần trăm</option><option value="FIXED">Số tiền cố định</option></select></label>
      <label>Mức chiết khấu<input className={inputClass} type="number" min="0" step="0.01" name="discount_value" {...control('discount_value')} /></label>
      <label>Tên / lý do chiết khấu<input className={inputClass} name="discount_name" maxLength={300} {...control('discount_name')} /></label>
    </div>
    {!term && <label className="block">Ghi chú<input className={inputClass} name="notes" {...control('notes')} maxLength={2000} /></label>}
    <button className="rounded border px-4 py-2" name="intent" value="preview" disabled={pending}>Xem trước</button>
    {state.quote && !pending && previewInput === JSON.stringify(values) && <div role="status" className="space-y-2 rounded bg-gray-50 p-3">
      <p>{state.quote.branch_name} • {state.quote.plan_name}</p>
      <p>{dateText(state.quote.starts_on)} → Kết thúc gốc {dateText(state.quote.base_ends_on)}</p>
      <p>Giá niêm yết {money(state.quote.list_price, state.quote.currency)} • Chiết khấu {money(state.quote.discount_amount, state.quote.currency)} • Thành tiền {money(state.quote.amount, state.quote.currency)}</p>
      <p className="text-sm">Giá và ngày sẽ được kiểm tra lại khi lưu.</p>
    </div>}
    <label className="flex gap-2 text-sm"><input name="confirm" value="yes" type="checkbox" />Xác nhận lưu học phí với dữ liệu hiện tại.</label>
    <button className="rounded bg-gray-950 px-4 py-2 text-white disabled:opacity-50" name="intent" value="save" disabled={pending}>{pending ? 'Đang xử lý…' : term ? 'Lưu chiết khấu' : 'Tạo kỳ học phí'}</button>
  </form>
}
