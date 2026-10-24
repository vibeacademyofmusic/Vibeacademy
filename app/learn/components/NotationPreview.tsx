'use client'
import { useEffect, useRef, useState } from 'react'
import { notationText, parseNotation, type Notation } from '../../../lib/learning/notation'
export default function NotationPreview({score}:{score:Notation}) {
  const target=useRef<HTMLDivElement>(null),[error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    const host=target.current
    async function draw(){
      try {
        const valid=parseNotation(score),VF=await import('vexflow/bravura')
        await document.fonts.ready
        if(cancelled||!host)return
        host.replaceChildren()
        const width=Math.max(600,...valid.measures.map(m=>180+m.events.length*55)),base=valid.clef==='treble'?30:18
        let height=0
        const rows=valid.measures.map(m=>{const pitches=m.events.flatMap(e=>e.pitches.map(p=>p.octave*7+'CDEFGAB'.indexOf(p.step)));const above=Math.max(0,(Math.max(base,...pitches)-base)*5-60),below=Math.max(0,(base-Math.min(base,...pitches))*5-60);const y=height+35+above;height+=200+above+below;return y})
        const renderer=new VF.Renderer(host,VF.Renderer.Backends.SVG);renderer.resize(width,height)
        const context=renderer.getContext(),notesById=new Map<string,InstanceType<typeof VF.StaveNote>>()
        const keys=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#']
        valid.measures.forEach((measure,index)=>{
          const stave=new VF.Stave(10,rows[index],width-20).addClef(valid.clef).addKeySignature(keys[valid.fifths+7]).addTimeSignature(`${valid.time.beats}/${valid.time.unit}`)
          stave.setContext(context).draw()
          const notes=measure.events.map(e=>{
            const note=new VF.StaveNote({clef:valid.clef,keys:e.kind==='REST'?[valid.clef==='treble'?'b/4':'d/3']:e.pitches.map(p=>`${p.step.toLowerCase()}${['bb','b','','#','##'][p.alter+2]}/${p.octave}`),duration:String(e.denominator)+(e.dots?'d'.repeat(e.dots):'')+(e.kind==='REST'?'r':''),autoStem:e.stem==='AUTO',stemDirection:e.stem==='DOWN'?-1:1})
            for(let d=0;d<e.dots;d++)VF.Dot.buildAndAttach([note],{all:true})
            notesById.set(e.id,note);return note
          })
          const tuplets=measure.tuplets.map(t=>new VF.Tuplet(t.ids.map(i=>notesById.get(i)!),{numNotes:t.actual,notesOccupied:t.normal,ratioed:true}))
          const beams=measure.beams.map(ids=>{const group=ids.map(i=>notesById.get(i)!),explicit=measure.events.find(e=>ids.includes(e.id)&&e.stem!=='AUTO')?.stem;if(explicit)group.forEach(n=>n.setStemDirection(explicit==='DOWN'?-1:1));return new VF.Beam(group,!explicit)})
          const voice=new VF.Voice({numBeats:valid.time.beats,beatValue:valid.time.unit}).setMode(VF.Voice.Mode.SOFT).addTickables(notes)
          VF.Accidental.applyAccidentals([voice],keys[valid.fifths+7])
          new VF.Formatter().joinVoices([voice]).format([voice],width-190)
          voice.draw(context,stave);beams.forEach(b=>b.setContext(context).draw());tuplets.forEach(t=>t.setContext(context).draw())
        })
        valid.relations.forEach(r=>{
          const first=notesById.get(r.from)!,last=notesById.get(r.to)!
          const pairs=first.getStave()===last.getStave()?[[first,last]]:[[first,undefined],[undefined,last]]
          pairs.forEach(([a,b])=>{
            if(r.kind==='TIE')new VF.StaveTie({firstNote:a,lastNote:b,firstIndexes:first.getKeys().map((_,i)=>i),lastIndexes:last.getKeys().map((_,i)=>i)}).setContext(context).draw()
            else new VF.Curve(a,b,{}).setContext(context).draw()
          })
        })
        setError('')
      }catch{if(!cancelled)setError('Chưa thể hiển thị ký âm này. Kiểm tra dữ liệu bên dưới; không có điểm tự động được cấp.')}
    }
    void draw();return()=>{cancelled=true;host?.replaceChildren()}
  },[score])
  return <figure className="min-w-0 space-y-2"><div ref={target} role="img" aria-label={notationText(score)} className="max-w-full overflow-x-auto rounded border bg-white text-black"/>{error&&<p role="alert">{error}</p>}<figcaption className="text-sm">{notationText(score)}</figcaption></figure>
}
