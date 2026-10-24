// Visually reconciled against printed pp. 13–14, 23/26/29/32/35/38/41/44.
const SOURCE='https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20%26%202026%20Prac%20syllabus%2020240524_access.pdf'
const names={C:'Đô',D:'Rê',E:'Mi',F:'Fa',G:'Sol',A:'La',B:'Si'}
const note=n=>n.split('/').map(v=>names[v[0]]+(v.slice(1)==='#'?' thăng':v.slice(1)==='b'?' giáng':'')).join(' / ')
const kinds={scales:['Âm giai cùng chiều','Similar-motion scales'],staccato:['Âm giai ngắt tiếng','Staccato scales'],apart3:['Âm giai hai tay cách quãng 3','Scales a third apart'],apart6:['Âm giai hai tay cách quãng 6','Scales a sixth apart'],contrary:['Âm giai ngược chiều','Contrary-motion scales'],thirds:['Âm giai quãng 3 kép','Scales in thirds'],sixths:['Âm giai quãng 6 kép','Scales in sixths'],chromatic:['Âm giai bán cung','Chromatic scale'],chromaticContrary:['Âm giai bán cung ngược chiều','Chromatic contrary-motion scale'],chromatic6:['Âm giai bán cung hai tay cách quãng 6 trưởng','Chromatic scale a major sixth apart'],whole:['Âm giai toàn cung cùng chiều','Whole-tone scales'],arpeggio:['Hợp âm rải','Arpeggios'],dominant:['Hợp âm bảy át rải','Dominant sevenths'],diminished:['Hợp âm bảy giảm rải','Diminished sevenths']}
const order={scales:2,staccato:3,apart3:4,apart6:4,contrary:5,thirds:6,sixths:6,chromatic:7,chromaticContrary:7,chromatic6:7,whole:8,arpeggio:9,dominant:10,diminished:11}
function buildPlan(){
 const out=[]
 for(let grade=1;grade<=8;grade++){
  const rows=[],page=20+3*grade
  const add=(kind,keys,mode,hand,octaves,forms=[''],arts=['Legato'],extra={})=>{
   for(const key of keys.split(' ')) for(const form of forms) for(const art of arts) for(const h of hand==='HS'?['LH','RH']:[hand]) {
    const candidate=form.includes('/')
    const base={grade,kind,key,mode,form,hand:h,octaves,articulation:art,source:SOURCE,page,pdfPage:page+1,groupOrder:order[kind],candidateChoice:candidate,examinerChoice:arts.length>1||forms.length>1,inversion:kind==='arpeggio'?(grade===7?'Đảo 1':grade===8?'Đảo 2':'Thể gốc'):kind==='dominant'?'Thể gốc':'Không áp dụng',resolve:kind==='dominant',...extra}
    const keyText=mode==='major'?`${note(key)} trưởng`:mode==='minor'?`${note(key)} thứ`: `Nốt xuất phát ${note(key)}`
    const formText={H:'Thứ hòa thanh',Mel:'Thứ giai điệu','N/H/Mel':'Thí sinh chọn thứ tự nhiên, hòa thanh hoặc giai điệu','H/Mel':'Thí sinh chọn thứ hòa thanh hoặc giai điệu'}[form]||''
    const handText=h==='HT'?'HT — Hai tay cùng chơi':`HS · ${h} — ${h==='LH'?'Tay trái':'Tay phải'} riêng`
    const start=extra.start|| (kind.includes('Contrary')||kind==='contrary'?`LH: ${note(key)}; RH: ${note(key)} — bắt đầu cùng một phím, chơi ngược chiều`:kind==='apart3'?`LH bắt đầu chủ âm ${note(key)}; RH ở bậc 3 phía trên; hai tay cách quãng 3`:kind==='apart6'?`RH bắt đầu chủ âm ${note(key)}; LH ở bậc 3 phía dưới; hai tay cách quãng 6`:kind==='thirds'?`Mỗi tay chơi quãng 3 kép; chủ âm ${note(key)} là nốt dưới`:kind==='sixths'?`Mỗi tay chơi quãng 6 kép; chủ âm ${note(key)} là nốt trên`:kind==='arpeggio'&&grade>=7?`Bắt đầu ở bậc ${grade===7?3:5} của hợp âm (${grade===7?'đảo 1':'đảo 2'}); HT: hai tay cách một quãng tám`:kind==='dominant'?`Bắt đầu ở âm gốc hợp âm V7 trong giọng ${note(key)}; hai tay cách một quãng tám; kết thúc giải về chủ âm ${note(key)}`:h==='HT'?`Hai tay cách một quãng tám; bắt đầu ở ${note(key)}`:`${h==='LH'?'Tay trái':'Tay phải'} bắt đầu ở ${note(key)}`)
    const code=`PT${grade}_${kind.toUpperCase()}_${key.replaceAll('#','S').replaceAll('b','F').replaceAll('/','-')}_${mode==='major'?'MAJ':mode==='minor'?'MIN':'NOTE'}_${form.replaceAll('/','-')||'NA'}_${h}_${art==='Legato'?'LEG':'STA'}`.toUpperCase()
    rows.push({...base,code,name:`${keyText} — ${kinds[kind][0]}${form&&!candidate?' · '+formText:''} · ${h==='HT'?'Hai tay':h==='LH'?'Tay trái':'Tay phải'} · ${art==='Legato'?'Liền tiếng':'Ngắt tiếng'}`,technique:`${kinds[kind][0]} — ${kinds[kind][1]}`,formText:formText||'Không áp dụng',handText,start,choice:[candidate?'Dạng thứ: thí sinh lựa chọn':forms.length>1?'Dạng thứ: chuẩn bị cả H và Mel; giám khảo chỉ định':'Dạng thứ: cố định / không áp dụng',arts.length>1?'Cách chơi: chuẩn bị cả legato và staccato; giám khảo lựa chọn':'Cách chơi: cố định theo syllabus',hand==='HS'?'HS: chuẩn bị cả hai tay; giám khảo chọn tay trong kỳ thi':''].filter(Boolean).join('. ')})
   }
  }
  if(grade===1){add('scales','C','major','HT',1);add('scales','G F','major','HS',2);add('scales','A D','minor','HS',2,['N/H/Mel']);add('contrary','C','major','HT',1);add('arpeggio','G','major','HS',1);add('arpeggio','A','minor','HS',1)}
  if(grade===2){add('scales','G F','major','HT',2);add('scales','A D','minor','HT',2,['N/H/Mel']);add('scales','D A','major','HS',2);add('scales','E G','minor','HS',2,['N/H/Mel']);add('contrary','C','major','HT',2);add('chromatic','D','note','HS',1);add('arpeggio','D A','major','HS',2);add('arpeggio','E G','minor','HS',2)}
  if(grade===3){add('scales','D A','major','HT',2);add('scales','E G','minor','HT',2,['H/Mel']);add('scales','Bb Eb','major','HS',2);add('scales','B C','minor','HS',2,['H/Mel']);add('contrary','E','major','HT',2);add('chromaticContrary','D','note','HT',1);add('arpeggio','D A','major','HT',2);add('arpeggio','E G','minor','HT',2);add('arpeggio','Bb Eb','major','HS',2);add('arpeggio','B C','minor','HS',2)}
  if(grade===4){add('scales','Bb Eb','major','HT',2);add('scales','B C','minor','HT',2,['H/Mel']);add('scales','B F# Ab','major','HS',2);add('scales','F# F','minor','HS',2,['H/Mel']);add('contrary','Eb','major','HT',2);add('contrary','C','minor','HT',2,['H']);add('chromatic','F#','note','HT',2);add('arpeggio','Bb Eb','major','HT',2);add('arpeggio','B C','minor','HT',2);add('arpeggio','B F# Ab','major','HS',2);add('arpeggio','F# F','minor','HS',2)}
  if(grade===5){add('scales','A E B F# Db','major','HT',2);add('scales','F# C# G# Eb Bb','minor','HT',2,['H/Mel']);add('staccato','Ab','major','HS',2,[''],['Staccato']);add('staccato','F','minor','HS',2,['H/Mel'],['Staccato']);add('contrary','Db','major','HT',2);add('contrary','C#','minor','HT',2,['H']);add('chromaticContrary','F#/A#','note','HT',2,[''],['Legato'],{start:'LH: Fa thăng (F♯); RH: La thăng (A♯) — cách quãng 3 trưởng, chơi ngược chiều'});add('arpeggio','A E B F# Ab Db','major','HT',2);add('arpeggio','F# C# G# Eb F Bb','minor','HT',2);add('diminished','B','note','HS',2)}
  if(grade>=6){
   const major=grade===6?'D F Ab B':grade===7?'Db E G Bb':'C Eb F# A'; const minor=grade===6?'D F G# B':grade===7?'C# E G Bb':'C Eb F# A';const arts=['Legato','Staccato']
   add('scales',major,'major','HT',4,[''],arts);add('scales',minor,'minor','HT',4,['H','Mel'],arts)
   if(grade>=7){add(grade===7?'apart3':'apart6',major,'major','HT',4,[''],arts);add(grade===7?'apart3':'apart6',minor,'minor','HT',4,['H'],arts)}
   add('contrary',major,'major','HT',2,[''],grade===6?['Legato']:arts);add('contrary',minor,'minor','HT',2,['H'],grade===6?['Legato']:arts)
   if(grade===7){add('thirds','G','major','HS',2);add('thirds','G','major','HS',2,[''],['Staccato'])}
   if(grade===8){add('thirds','Eb','major','HS',2);add('sixths','C','major','HS',2,[''],['Staccato'])}
   if(grade===6)add('chromatic','G# B','note','HT',4,[''],arts)
   if(grade===7)add('chromaticContrary','C#/E','note','HT',2,[''],arts,{start:'LH: Đô thăng (C♯); RH: Mi (E) — cách quãng 3 thứ, chơi ngược chiều'})
   if(grade===8){add('chromatic6','Eb/C','note','HT',4,[''],arts,{start:'LH: Mi giáng (E♭); RH: Đô (C) phía trên — cách quãng 6 trưởng, chơi cùng chiều'});add('whole','Eb C','note','HT',4,[''],arts)}
   add('arpeggio',major,'major','HT',4);add('arpeggio',minor,'minor','HT',4);add('dominant',major,'major','HT',4);add('diminished',grade===6?'G# B':grade===7?'Bb F':'Eb C','note','HT',4)
  }
  rows.sort((a,b)=>a.groupOrder-b.groupOrder)
  const extra=(code,name,groupOrder)=>({grade,code:`PT${grade}_${code}`,name,kind:code.toLowerCase(),groupOrder,page,pdfPage:page+1,source:SOURCE,official:false})
  out.push({grade,page,lessons:[extra('INTRO','Hướng dẫn kỹ thuật và quy định thực hiện — Technical guidance',1),...rows,extra('REVIEW','Ôn tập và kiểm tra tổng hợp — Technical review',12)].map((r,i)=>({...r,official:r.official??true,sortOrder:i+1}))})
 }
 return out
}
module.exports={buildPlan,SOURCE}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- The standalone CLI is CommonJS and loads Node builtins synchronously.
if(require.main===module){const fs=require('node:fs');fs.writeFileSync(require('node:path').join(__dirname,'piano-technique-2025-2026.json'),JSON.stringify(buildPlan(),null,2)+'\n');console.log(buildPlan().map(g=>({grade:g.grade,lessons:g.lessons.length})))}
