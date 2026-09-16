'use client'
import { useState } from 'react'
import { theoryPilotModules, theorySections } from '../../../../lib/learning/theory-authoring'
export default function PilotFields(){
  const [selected,setSelected]=useState<string[]>([])
  return <div className="space-y-3 sm:col-span-2"><input type="hidden" name="module_codes" value={theoryPilotModules.filter(m=>selected.includes(m.code)).map(m=>m.code).join(',')}/>
    {theoryPilotModules.map(m=><section key={m.code} className="space-y-3 rounded border p-3"><label className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(m.code)} onChange={e=>setSelected(previous=>e.target.checked?[...previous,m.code]:previous.filter(code=>code!==m.code))}/><span>{m.code} — {m.title} · {m.source_pages}</span></label>
      {selected.includes(m.code)&&m.lessons.map(l=><details key={l.code} className="rounded border p-3" open><summary className="cursor-pointer font-medium">{l.code} — {l.title}</summary><p>Mục tiêu: {l.objective}</p>{theorySections.map(([key,label])=><label key={key} className="my-3 block">{label} — {l.code}<textarea name={l.code+'.'+key} className="block w-full rounded border p-2" rows={3} maxLength={9500} required/></label>)}</details>)}
    </section>)}
    {!selected.length&&<p>Chọn ít nhất một module trong pilot MT1.01–MT1.05 để biên soạn.</p>}
  </div>
}
