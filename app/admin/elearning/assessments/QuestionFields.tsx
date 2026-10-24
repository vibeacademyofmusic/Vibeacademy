'use client'
import { useRef, useState } from 'react'
import { questionTypes } from '../../../../lib/learning/question-types'
const input='block w-full rounded border p-2'
export default function QuestionFields(){
  const [ids,setIds]=useState([1]),next=useRef(2)
  return <div className="space-y-4 sm:col-span-2">
    <input type="hidden" name="question_ids" value={ids.join(',')}/>
    <p>Mỗi đề có 1–100 câu. Điểm được tính theo trọng số từng câu; câu ký âm cần chấm tay hoặc kết hợp. Đề đã tạo giữ nguyên để người khác duyệt.</p>
    {ids.map((id,index)=><fieldset key={id} className="min-w-0 space-y-3 rounded border p-3"><legend className="font-semibold">Câu {index+1} — Q{id}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Loại câu Q{id}<select className={input} name={`q.${id}.type`}>{questionTypes.map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Cách chấm Q{id}<select className={input} name={`q.${id}.mode`}><option value="AUTO">Tự động — lựa chọn/đúng sai</option><option value="HYBRID">Kết hợp, cần người duyệt</option><option value="MANUAL">Chấm tay</option></select></label>
        <label className="sm:col-span-2">Đề bài Q{id}<textarea className={input} name={`q.${id}.prompt`} required maxLength={10000}/></label>
        <label>Điểm tối đa Q{id}<input className={input} name={`q.${id}.points`} type="number" min="0.01" max="1000" step="0.01" required/></label>
        <label>Phương án Q{id}, mỗi dòng một phương án<textarea className={input} name={`q.${id}.options`} maxLength={10000}/></label>
        <label>Đáp án riêng Q{id} (đúng/sai: true hoặc false; nhiều lựa chọn: mỗi dòng một đáp án)<textarea className={input} name={`q.${id}.key`} maxLength={10000}/></label>
        <label>Hướng dẫn chấm tay Q{id}<textarea className={input} name={`q.${id}.rubric`} maxLength={10000}/></label>
      </div>
      {ids.length>1&&<button type="button" className="rounded border px-3 py-2" onClick={()=>setIds(current=>current.filter(value=>value!==id))}>Bỏ câu Q{id}</button>}
    </fieldset>)}
    <button type="button" disabled={ids.length>=100} className="rounded border px-3 py-2 disabled:opacity-50" onClick={()=>{const id=next.current++;setIds(current=>current.length<100?[...current,id]:current)}}>Thêm câu hỏi</button>
  </div>
}
