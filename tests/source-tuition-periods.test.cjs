const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const file='app/admin/tuition/source-periods.ts';
const moduleOutput=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const m={exports:{}};
const mocks={
 '../finance/query':{all:async fn=>{const r=await fn(0,999);if(r.error)throw r.error;return r.data;}},
 './data':{daysBetween:(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000},
 '../finance/operations':{validDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v},
};
new Function('require','module','exports',moduleOutput)(name=>{if(!(name in mocks))throw Error('Unexpected dependency '+name);return mocks[name]},m,m.exports);
const {periodTiming,sourcePeriods,periodSourceHash,sourceBatch}=m.exports;
function row(start='2026-10-01',end='2026-10-27',extra={}){
 const r={id:'row1',source_excel_row:7,target_student_id:'student1',disposition:'IMPORT',fee_starts_on:start,source_effective_ends_on:end,is_unlimited:false,...extra};
 r.normalized_payload={tuition_tracking:{version:'SOURCE_PERIOD_V1',source_sha256:periodSourceHash,source_excel_row:r.source_excel_row,student_id:r.target_student_id,starts_on:start,ends_on:end,is_unlimited:r.is_unlimited,money_state:'UNVERIFIED',notifications_eligible:false}};
 return r;
}
test('end date is inclusive; following day expires without changing source dates',()=>{
 const r=row();assert.deepEqual(periodTiming(r,'2026-10-27'),{state:'ACTIVE',days:0});assert.deepEqual(periodTiming(r,'2026-10-28'),{state:'EXPIRED',days:-1});assert.equal(r.source_effective_ends_on,'2026-10-27');
});
test('future periods are not presented as currently active',()=>assert.deepEqual(periodTiming(row('2026-11-01','2027-02-07'),'2026-10-27'),{state:'UPCOMING',days:103}));
test('source end date is authoritative across leap days and extensions',()=>assert.deepEqual(periodTiming(row('2028-01-01','2028-03-02'),'2028-02-28'),{state:'ACTIVE',days:3}));
test('unlimited has no fabricated start, expiry or countdown',()=>assert.deepEqual(periodTiming(row(null,null,{is_unlimited:true}),'2026-10-27'),{state:'UNLIMITED',days:null}));
test('unreviewed rows and stale identity/date/provenance markers stay held',()=>{
 for(const patch of [{normalized_payload:{}},{target_student_id:'other'},{source_excel_row:86},{fee_starts_on:'2026-10-02'},{source_effective_ends_on:'2026-11-01'},{disposition:'HELD'},{target_student_id:null}])assert.equal(periodTiming({...row(),...patch},'2026-10-27').state,'HOLD');
 const r=row();r.normalized_payload.tuition_tracking.source_sha256='old';assert.equal(periodTiming(r,'2026-10-27').state,'HOLD');
});
test('invalid dates and invented monetary or outbound eligibility never become ready',()=>{
 for(const [a,b] of [['2026-10-24','2026-10-24'],['2026-02-30','2026-04-01'],['2026-10-13','13/1/22027']])assert.equal(periodTiming(row(a,b),'2026-10-27').state,'HOLD');
 for(const patch of [{money_state:'PAID'},{notifications_eligible:true}]){const r=row();Object.assign(r.normalized_payload.tuition_tracking,patch);assert.equal(periodTiming(r,'2026-10-27').state,'HOLD');}
});
test('same learner retains separate programme periods',()=>{
 const a=row('2026-10-01','2026-12-01',{source_excel_row:96}),b=row('2026-10-01','2027-01-01',{source_excel_row:97});assert.equal(periodTiming(a,'2026-10-27').days,35);assert.equal(periodTiming(b,'2026-10-27').days,66);
});
test('loader uses the supplied RLS client, correct batch and excludes retired source rows',async()=>{
 const calls=[],data=[row()];const query=new Proxy({},{get:(_,key)=> key==='then'?undefined:(...args)=>{calls.push([key,...args]);return key==='returns'?Promise.resolve({data,error:null}):query;}});
 const db={from:name=>{calls.push(['from',name]);return query;}};
 assert.deepEqual(await sourcePeriods(db),data);assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='import_batch_id'&&c[2]===sourceBatch));assert.ok(calls.some(c=>c[0]==='neq'&&c[1]==='disposition'&&c[2]==='EXCLUDED'));
 assert.ok(calls.every(c=>!['insert','update','rpc','delete','upsert'].includes(c[0])));
});
