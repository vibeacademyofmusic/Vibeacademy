import contents from './theory-contents.json'
import lessons from './theory-pilot-lessons.json'
export const theoryContents=contents
export const theoryPilotModules=contents.modules.filter(m=>m.grade===1&&m.sequence<=5).map(m=>({...m,lessons:lessons.filter(l=>l.module_code===m.code)}))
export const theorySections=[['explanation','Giải thích nguyên gốc, thuật ngữ và phạm vi'],['worked','Ví dụ mới: từng bước và lý do'],['misconception','Lỗi thường gặp và cách phân biệt'],['guided','Luyện tập có hướng dẫn: 3–6 câu, gợi ý và phản hồi'],['independent','Luyện tập độc lập: 5–12 câu và hướng dẫn chấm'],['summary','Tóm tắt: 3–6 ý chính và liên kết kiến thức trước']] as const
export function theoryDraftContent(form:FormData){
  const get=(key:string)=>typeof form.get(key)==='string'?String(form.get(key)).trim():''
  const codes=get('module_codes').split(',')
  if(codes.length<1||codes.length>5||new Set(codes).size!==codes.length||codes.some(code=>!theoryPilotModules.some(m=>m.code===code))) throw new Error('Invalid pilot modules')
  return {theory_grade:1,source_sha256:contents.source_sha256,modules:theoryPilotModules.filter(m=>codes.includes(m.code)).map(m=>({code:m.code,title:m.title,source_pages:m.source_pages,lessons:m.lessons.map(l=>({code:l.code,title:l.title,blocks:[{type:'TEXT',text:'Mục tiêu: '+l.objective},...theorySections.map(([key,label])=>{const body=get(l.code+'.'+key);if(!body||body.length>9500)throw new Error('Every lesson section requires original content');return {type:'TEXT',text:label+'\n'+body}})]}))}))}
}
