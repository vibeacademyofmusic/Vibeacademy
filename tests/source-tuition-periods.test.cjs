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
const {matchesPeriodFilter,periodTiming,sourcePeriods,periodSourceHash,sourceBatch}=m.exports;
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

test('near-due filter includes days 0 through 35 and excludes expired, future and held periods',()=>{
 for(const [end,expected] of [['2026-10-26',false],['2026-10-27',true],['2026-10-28',true],['2026-12-01',true],['2026-12-02',false]]) {
  const timing=periodTiming(row('2026-10-01',end),'2026-10-27');
  assert.equal(matchesPeriodFilter(timing,'DUE_SOON'),expected,end);
  assert.equal(matchesPeriodFilter(timing,''),true);
  assert.equal(matchesPeriodFilter(timing,'ACTIVE'),timing.state==='ACTIVE');
 }
 for(const r of [row('2026-11-01','2026-11-15'),row(null,null,{is_unlimited:true}),{...row(),normalized_payload:{}}])
  assert.equal(matchesPeriodFilter(periodTiming(r,'2026-10-27'),'DUE_SOON'),false);
});
const exportModule={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/admin/tuition/source-periods-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{assert.equal(name,'./source-periods');return m.exports},exportModule,exportModule.exports);
const {sourcePeriodsCsv}=exportModule.exports;
test('CSV exports every filtered row beyond the first page with Vietnamese text and sequential numbers',()=>{
 const rows=Array.from({length:30},(_,i)=>({...row('2026-10-01','2026-11-01'),students:{full_name:'Nguyễn An',student_code:'VIBE-'+i}}));
 const csv=sourcePeriodsCsv(rows,'2026-10-27',{period_state:'DUE_SOON'});
 assert.ok(csv.startsWith('\uFEFF'));assert.equal(csv.trim().split('\r\n').length,31);assert.ok(csv.includes('"30","Nguyễn An"'));assert.ok(csv.includes('"Còn 5 ngày"'));
 assert.equal(sourcePeriodsCsv(rows,'2026-10-27',{period_state:'EXPIRED'}).trim().split('\r\n').length,1);
 assert.equal(sourcePeriodsCsv(rows,'2026-10-27',{period_student:'VIBE-29'}).trim().split('\r\n').length,2);
});
test('CSV safely escapes formulas, commas, quotes and line breaks, and hides held dates',()=>{
 const r={...row(),students:{full_name:' =HYPERLINK("x")\n,',student_code:'@formula'}};
 const csv=sourcePeriodsCsv([r],'2026-10-27',{});
 assert.ok(csv.includes('"\' =HYPERLINK(""x"")\n,"'));assert.ok(csv.includes('"\'@formula"'));
 const held=sourcePeriodsCsv([{...r,normalized_payload:{}}],'2026-10-27',{});
 assert.ok(held.includes('"Chờ xác nhận","Chờ xác nhận","Chờ xác nhận","Chưa tính"'));
});
test('export route requires admin authorization before querying and never caches private files',async()=>{
 const route={exports:{}};let authorized=false,queried=false;
 const code=ts.transpileModule(fs.readFileSync('app/admin/tuition/export/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const deps={'../../finance/operations':{adminClient:async()=>{if(!authorized)throw Error('LOGIN');return{}},vietnamDateTime:()=> '2026-10-27T10:00'},'../source-periods':{sourcePeriods:async()=>{queried=true;return[row()]}},'../source-periods-export':{sourcePeriodsCsv}};
 new Function('require','module','exports',code)(name=>deps[name],route,route.exports);
 await assert.rejects(route.exports.GET(new Request('https://example.test/admin/tuition/export')),/LOGIN/);assert.equal(queried,false);
 authorized=true;const response=await route.exports.GET(new Request('https://example.test/admin/tuition/export?period_state=DUE_SOON'));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-disposition'),/attachment.*\.csv/);assert.ok((await response.text()).includes('Hết hạn hôm nay'));
});

const reminderModule={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/admin/tuition/reminders/source-reminder-periods.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(()=>m.exports,reminderModule,reminderModule.exports);
const {trackedSourceReminders}=reminderModule.exports;
function trackedRow(){const r=row();r.normalized_payload.tuition_reminder_tracking={version:'SOURCE_REMINDER_V1',state:'TRACKING',student_id:r.target_student_id,starts_on:r.fee_starts_on,ends_on:r.source_effective_ends_on,notifications_eligible:false};return r;}
test('only explicitly tracked source periods enter reminder follow-up',()=>{assert.equal(trackedSourceReminders([row(),trackedRow()],'2026-10-27').length,1)});
test('tracked period remains visible after expiry without enabling outbound messages',()=>{const r=trackedRow();const out=trackedSourceReminders([r],'2026-10-28');assert.equal(out[0].state,'EXPIRED');assert.equal(out[0].needsReview,false);assert.equal(r.normalized_payload.tuition_reminder_tracking.notifications_eligible,false)});
test('changed period requires reconciliation instead of displaying an obsolete reminder window',()=>{const r=trackedRow();r.source_effective_ends_on='2026-11-30';assert.equal(trackedSourceReminders([r],'2026-10-27')[0].needsReview,true)});
