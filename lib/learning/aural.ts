// Draft interchange contract, not a delivery authorization or grading engine.
// Private audio must be resolved by an authenticated server adapter; never URLs here.
export const auralModules = [
  ['1A','Pulse & Metre'],['1B','Echo Singing'],['1C','Pitch Change'],['1D','Musical Features'],
  ['2A','Pulse & Metre'],['2B','Echo Singing'],['2C','Pitch/Rhythm Change'],['2D','Musical Features + Tempo'],
  ['3A','Pulse & Metre'],['3B','Echo Singing'],['3C','Pitch/Rhythm Change'],['3D','Musical Features + Tempo + Tonality'],
] as const
export const auralQuestionTypes = ['AURAL_METRE_CHOICE','AURAL_CHANGE_DETECTION','AURAL_FEATURE_CHOICE','AURAL_TONALITY_CHOICE','AURAL_ECHO_RECORDING'] as const
export type AuralQuestionType = typeof auralQuestionTypes[number]
export type AuralAsset = {id:string;sha256:string;mime:'audio/wav'|'audio/mpeg'|'audio/ogg'|'audio/webm';durationMs:number;provenance:string}
export type AuralDraft = {
  schema:1; state:'DRAFT'; module:typeof auralModules[number][0]; type:AuralQuestionType
  prompt:string; maxPlays:number; stimuli:{role:'ORIGINAL'|'COMPARISON';asset:AuralAsset}[]
  response: {kind:'CHOICE';options:string[]} | {kind:'RECORDING';maxDurationMs:number;rubric:string}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected object');return value as Record<string,unknown>}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid text');return value.trim()}
function integer(value:unknown,min:number,max:number):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Invalid limit');return value}
function asset(value:unknown):AuralAsset{
  const a=object(value),id=text(a.id,36),sha256=text(a.sha256,64),mime=text(a.mime,30)
  if(!uuid.test(id)||!/^[0-9a-f]{64}$/.test(sha256)||!['audio/wav','audio/mpeg','audio/ogg','audio/webm'].includes(mime))throw new Error('Invalid audio reference')
  // Reject URLs/paths explicitly: a client-supplied URL must never become a fetch target.
  if(Object.keys(a).some(k=>!['id','sha256','mime','durationMs','provenance'].includes(k)))throw new Error('Unexpected audio metadata')
  return {id,sha256,mime:mime as AuralAsset['mime'],durationMs:integer(a.durationMs,1,600000),provenance:text(a.provenance,2000)}
}
export function parseAuralDraft(input:unknown):AuralDraft{
  const d=object(input)
  if(d.schema!==1||d.state!=='DRAFT')throw new Error('Unapproved draft required')
  if(Object.keys(d).some(k=>!['schema','state','module','type','prompt','maxPlays','stimuli','response'].includes(k)))throw new Error('Unexpected draft field')
  const moduleCode=auralModules.find(([code])=>code===d.module)?.[0]
  if(!moduleCode||!auralQuestionTypes.some(t=>t===d.type))throw new Error('Unsupported Aural scope')
  const type=d.type as AuralQuestionType
  const suffix=type==='AURAL_METRE_CHOICE'?'A':type==='AURAL_ECHO_RECORDING'?'B':type==='AURAL_CHANGE_DETECTION'?'C':'D'
  if(!moduleCode.endsWith(suffix)||(type==='AURAL_TONALITY_CHOICE'&&moduleCode!=='3D'))throw new Error('Question outside module scope')
  if(!Array.isArray(d.stimuli)||d.stimuli.length!==(type==='AURAL_CHANGE_DETECTION'?2:1))throw new Error('Invalid stimulus set')
  const stimuli=d.stimuli.map((value,index)=>{const s=object(value),role=index===0?'ORIGINAL':'COMPARISON';if(s.role!==role||Object.keys(s).some(k=>!['role','asset'].includes(k)))throw new Error('Invalid stimulus role');return {role:role as 'ORIGINAL'|'COMPARISON',asset:asset(s.asset)}})
  const r=object(d.response)
  let response:AuralDraft['response']
  if(type==='AURAL_ECHO_RECORDING'){
    if(r.kind!=='RECORDING'||Object.keys(r).some(k=>!['kind','maxDurationMs','rubric'].includes(k)))throw new Error('Echo requires manual recording review')
    response={kind:'RECORDING',maxDurationMs:integer(r.maxDurationMs,1,600000),rubric:text(r.rubric,10000)}
  }else{
    if(r.kind!=='CHOICE'||!Array.isArray(r.options)||r.options.length<2||r.options.length>30||Object.keys(r).some(k=>!['kind','options'].includes(k)))throw new Error('Invalid structured choices')
    const options=r.options.map(o=>text(o,1000));if(new Set(options).size!==options.length)throw new Error('Duplicate options')
    response={kind:'CHOICE',options}
  }
  // Bounds are technical resource caps, not default exam/replay business policies.
  // Authors must supply policy explicitly; server attempt counters enforce it later.
  return {schema:1,state:'DRAFT',module:moduleCode,type,prompt:text(d.prompt,10000),maxPlays:integer(d.maxPlays,1,100),stimuli,response}
}
