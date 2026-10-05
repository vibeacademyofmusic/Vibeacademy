// Versioned musical data; engraving is a consumer, never the scoring authority.
export type Pitch={step:'C'|'D'|'E'|'F'|'G'|'A'|'B';octave:number;alter:number}
export type MusicEvent={id:string;kind:'NOTE'|'REST';pitches:Pitch[];denominator:number;dots:number;stem:'AUTO'|'UP'|'DOWN'}
export type TupletGroup={ids:string[];actual:2|3;normal:2|3}
export type MusicMeasure={events:MusicEvent[];beams:string[][];tuplets:TupletGroup[];partial:boolean}
export type Notation={schema:1;clef:'treble'|'bass';fifths:number;time:{beats:number;unit:number};measures:MusicMeasure[];relations:{kind:'TIE'|'SLUR';from:string;to:string}[]}
export type Rational={n:number;d:number}
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Dữ liệu ký âm phải là đối tượng.');return v as Record<string,unknown>}
const integer=(v:unknown,min:number,max:number)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw Error('Giá trị ký âm ngoài phạm vi hỗ trợ.');return v}
function array(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)throw Error('Danh sách ký âm không hợp lệ.');return v}
function id(v:unknown){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(v))throw Error('Mã nốt không hợp lệ.');return v}
export function fraction(n:number,d:number):Rational {if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||d<=0)throw Error('Phân số không hợp lệ.');let a=Math.abs(n),b=d;while(b){const r=a%b;a=b;b=r}return {n:n/(a||1),d:d/(a||1)}}
export function addDuration(a:Rational,b:Rational){return fraction(a.n*b.d+b.n*a.d,a.d*b.d)}
export function eventDuration(e:MusicEvent,tuplet?:TupletGroup){const dotScale=2**e.dots;return fraction((2*dotScale-1)*(tuplet?.normal??1),e.denominator*dotScale*(tuplet?.actual??1))}
export function measureDuration(m:MusicMeasure){return m.events.reduce((sum,e)=>addDuration(sum,eventDuration(e,m.tuplets.find(t=>t.ids.includes(e.id)))),fraction(0,1))}
export function pitchText(p:Pitch){return p.step+(['bb','b','','#','##'][p.alter+2])+p.octave}
export function parsePitch(value:string):Pitch {const m=/^([A-G])(bb|b|##|#)?([0-8])$/.exec(value.trim());if(!m)throw Error('Dùng cao độ như C4, F#4 hoặc Bb3 (quãng tám 0–8).');return {step:m[1] as Pitch['step'],alter:{bb:-2,b:-1,'':0,'#':1,'##':2}[m[2]||'']!,octave:Number(m[3])}}
export function parseNotation(value:unknown):Notation {
  const root=record(value)
  if(root.schema!==1||!['treble','bass'].includes(String(root.clef)))throw Error('Chỉ hỗ trợ mô hình v1, khóa Sol và khóa Fa.')
  const time=record(root.time),beats=integer(time.beats,1,12),unit=integer(time.unit,2,16)
  if(![2,4,8,16].includes(unit))throw Error('Mẫu số nhịp không hợp lệ.')
  const allIds=new Set<string>(),eventMap=new Map<string,MusicEvent>(),positions=new Map<string,number>()
  let totalEvents=0
  const measures=array(root.measures,8).map(raw=>{
    const m=record(raw)
    if(typeof m.partial!=='boolean')throw Error('Cần xác định ô nhịp đầy đủ hay chưa đầy đủ.')
    const events=array(m.events,32).map(rawEvent=>{
      const e=record(rawEvent),eventId=id(e.id)
      if(allIds.has(eventId))throw Error('Mã nốt bị trùng.')
      allIds.add(eventId);positions.set(eventId,totalEvents++);
      if(!['NOTE','REST'].includes(String(e.kind))||!['AUTO','UP','DOWN'].includes(String(e.stem)))throw Error('Loại ký hiệu hoặc hướng đuôi không hợp lệ.')
      const denominator=integer(e.denominator,1,64)
      if(![1,2,4,8,16,32,64].includes(denominator))throw Error('Trường độ không được hỗ trợ.')
      const pitches=array(e.pitches,6).map(v=>{const p=record(v);if(!['C','D','E','F','G','A','B'].includes(String(p.step)))throw Error('Tên nốt không hợp lệ.');return {step:p.step as Pitch['step'],octave:integer(p.octave,0,8),alter:integer(p.alter,-2,2)}})
      if(e.kind==='REST'?pitches.length!==0:pitches.length===0)throw Error('Nốt cần cao độ; dấu lặng không chứa cao độ.')
      pitches.sort((a,b)=>(a.octave-b.octave)*7+'CDEFGAB'.indexOf(a.step)-'CDEFGAB'.indexOf(b.step)||a.alter-b.alter)
      if(new Set(pitches.map(pitchText)).size!==pitches.length)throw Error('Cao độ trong hợp âm bị trùng.')
      const result:MusicEvent={id:eventId,kind:e.kind as MusicEvent['kind'],pitches,denominator,dots:integer(e.dots,0,2),stem:e.stem as MusicEvent['stem']}
      eventMap.set(eventId,result);return result
    })
    if(!events.length)throw Error('Ô nhịp phải có ít nhất một ký hiệu.')
    const group=(v:unknown,min:number,max:number)=>{const ids=array(v,max).map(id);if(ids.length<min||new Set(ids).size!==ids.length)throw Error('Nhóm ký âm không hợp lệ.');const start=events.findIndex(e=>e.id===ids[0]);if(start<0||ids.some((i,j)=>events[start+j]?.id!==i))throw Error('Nhóm phải gồm các nốt liên tiếp trong cùng ô nhịp.');return ids}
    const beamed=new Set<string>(),tupled=new Set<string>()
    const beams=array(m.beams,16).map(v=>{const ids=group(v,2,16);for(const i of ids){const e=eventMap.get(i)!;if(e.kind!=='NOTE'||e.denominator<8||beamed.has(i))throw Error('Nối cờ chỉ dùng cho nhóm nốt móc không chồng lặp.');beamed.add(i)}if(new Set(ids.map(i=>eventMap.get(i)!.stem).filter(s=>s!=='AUTO')).size>1)throw Error('Nhóm nối cờ không được có hướng đuôi mâu thuẫn.');return ids})
    const tuplets=array(m.tuplets,16).map(v=>{const t=record(v),actual=integer(t.actual,2,3) as 2|3,normal=integer(t.normal,2,3) as 2|3;if(actual===normal)throw Error('Tỷ lệ nhóm liên không hợp lệ.');const ids=group(t.ids,actual,actual);for(const i of ids){if(tupled.has(i))throw Error('Nhóm liên không được chồng lặp.');tupled.add(i)}return {ids,actual,normal}})
    const result:MusicMeasure={events,beams,tuplets,partial:m.partial},duration=measureDuration(result),capacity=fraction(beats,unit)
    if(duration.n*capacity.d>capacity.n*duration.d||(!m.partial&&duration.n*capacity.d!==capacity.n*duration.d))throw Error('Tổng trường độ không khớp ô nhịp; dùng ô nhịp chưa đầy đủ khi đang nhập hoặc lấy đà.')
    return result
  })
  if(!measures.length||totalEvents>128)throw Error('Số ô nhịp hoặc số ký hiệu ngoài giới hạn.')
  const relationIds=new Set<string>()
  const relations=array(root.relations,128).map(raw=>{const r=record(raw),from=id(r.from),to=id(r.to),a=eventMap.get(from),b=eventMap.get(to),key=r.kind+':'+from+':'+to;
    if(!['TIE','SLUR'].includes(String(r.kind))||!a||!b||a.kind!=='NOTE'||b.kind!=='NOTE'||positions.get(from)!>=positions.get(to)!||relationIds.has(key))throw Error('Liên kết ký âm không hợp lệ.')
    if(r.kind==='TIE'&&(positions.get(to)! - positions.get(from)! !== 1||a.pitches.map(pitchText).sort().join()!==b.pitches.map(pitchText).sort().join()))throw Error('Dấu nối phải nối hai nốt/hợp âm cùng cao độ viết, liên tiếp.')
    relationIds.add(key);return {kind:r.kind as 'TIE'|'SLUR',from,to}
  })
  return {schema:1,clef:root.clef as Notation['clef'],fifths:integer(root.fifths,-7,7),time:{beats,unit},measures,relations}
}
export function notationText(score:Notation){return `${score.clef==='treble'?'Khóa Sol':'Khóa Fa'}, nhịp ${score.time.beats}/${score.time.unit}, hóa biểu ${score.fifths}. `+score.measures.map((m,i)=>`Ô ${i+1}: `+m.events.map(e=>`${e.id}: ${e.kind==='REST'?'Lặng':e.pitches.map(pitchText).join('+')}, 1/${e.denominator}${e.dots?`, ${e.dots} chấm dôi`:''}`).join('; ')+m.tuplets.map(t=>`; Nhóm liên ${t.actual}:${t.normal} (${t.ids.join(', ')})`).join('')+m.beams.map(b=>`; Nối cờ ${b.join(', ')}`).join('')).join('. ')+score.relations.map(r=>`; ${r.kind==='TIE'?'Dấu nối':'Dấu luyến'} ${r.from} đến ${r.to}`).join('')}

export const initialNotation:Notation={schema:1,clef:'treble',fifths:0,time:{beats:4,unit:4},measures:[{partial:true,events:[{id:'n1',kind:'NOTE',pitches:[{step:'C',octave:4,alter:0}],denominator:4,dots:0,stem:'AUTO'}],beams:[],tuplets:[]}],relations:[]}
