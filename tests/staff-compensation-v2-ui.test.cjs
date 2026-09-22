/* Isolated contract tests. No connection to Supabase; no payroll data is written.
 * Uses the project's existing TypeScript dev dependency for TS/TSX transpilation.
 * These tests do not replace a Next.js build or database/RLS integration tests.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const actionPath = path.join(root, 'app/admin/employees/[id]/compensation/actions.ts')
const pagePath = path.join(root, 'app/admin/employees/[id]/compensation/page.tsx')
const EMP = '00000000-0000-4000-8000-000000000001'
const BRANCH = '00000000-0000-4000-8000-000000000002'
const CONFIG = '00000000-0000-4000-8000-000000000003'
const PERIOD = '00000000-0000-4000-8000-000000000004'
const TEACHER = '00000000-0000-4000-8000-000000000005'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const catalog = [
  ['SOCIAL_LABOR_INSURANCE', 'BHXH+BHLĐ', 'DEDUCTION', 'FIXED_AMOUNT', true, 'ACTIVE'],
  ['BASE_SALARY', 'Lương tháng', 'EARNING', 'FIXED_AMOUNT', true, 'ACTIVE'],
  ['FIXED_PAY', 'Lương cố định', 'EARNING', 'FIXED_AMOUNT', false, 'INACTIVE'],
  ['POSITION_PAY', 'Lương vị trí', 'EARNING', 'FIXED_AMOUNT', true, 'ACTIVE'],
  ['BUSINESS_TRIP_ALLOWANCE', 'Trợ cấp công tác', 'EARNING', 'FIXED_AMOUNT', true, 'ACTIVE'],
  ['SOCIAL_INSURANCE', 'Bảo hiểm xã hội', 'DEDUCTION', 'FIXED_AMOUNT', false, 'ACTIVE'],
  ['LABOR_INSURANCE', 'Bảo hiểm lao động', 'DEDUCTION', 'FIXED_AMOUNT', false, 'ACTIVE'],
  ['TEACHING_PER_SESSION', 'Lương theo buổi', 'EARNING', 'PER_SESSION', true, 'ACTIVE'],
  ['BONUS', 'Thưởng', 'EARNING', 'EVENT', false, 'ACTIVE'],
  ['TRAVEL_EXPENSE', 'Công tác phí', 'REIMBURSEMENT', 'EVENT', false, 'ACTIVE'],
].map(([code, name, category, default_calculation_method, recurring_configurable, status]) =>
  ({code, name, category, default_calculation_method, recurring_configurable, status}))

function compile(file) {
  const source = fs.readFileSync(file, 'utf8')
  const result = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  })
  assert.deepEqual((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), [])
  return {source, output: result.outputText}
}
const compiledAction = compile(actionPath)
const compiledPage = compile(pagePath)

function makeDB(options = {}) {
  const trace = {queries: [], calls: [], revalidated: []}
  const baseConfig = {id: CONFIG, employee_id: EMP, branch_id: BRANCH, component_code:'BASE_SALARY',
    calculation_method:'FIXED_AMOUNT', amount:'4200000.00', rate:null, percentage:null, currency:'VND',
    basis_component_code:null, class_type:null, effective_from:'2026-09-01', effective_to:null,
    status:'ACTIVE', reason:'Test fixture only', created_by:EMP, created_at:'2026-09-01T00:00:00Z'}
  const sessionConfig = {...baseConfig, id:TEACHER, component_code:'TEACHING_PER_SESSION',
    calculation_method:'PER_SESSION', amount:null, rate:'90000.00'}
  const fixture = {
    employee_directory: {id:EMP, employee_code:'MOCK-001',full_name:'Mock Staff',home_unit:'HQ',
      unit_code:'HQ',employment_status:'ACTIVE',teacher_id:TEACHER,hire_date:'2026-09-01'},
    staff_compensation_components:[baseConfig, sessionConfig],
    payroll_component_catalog:catalog,
    teacher_compensation_rules:[],
    teacher_payrolls:[{id:CONFIG,period_id:PERIOD,teacher_name:'Mock Staff',pay_type:'MONTHLY',
      currency:'VND',gross_amount:'999.00',v2_net_amount:'4700000.00',calculation_version:'PAYROLL_V2_1',
      payroll_periods:{starts_on:'2026-09-01',status:'REVIEW'}}],
    ...options.fixture,
  }
  const db = {
    from(table) {
      const q = {table, filters:[], single:false, selected:''}
      trace.queries.push(q)
      const api = {
        select(columns) {q.selected = columns; return api},
        eq(key, value) {q.filters.push(['eq',key,value]); return api},
        or(value) {q.filters.push(['or',value]); return api},
        order() {return api}, range() {return api}, limit() {return api}, returns() {return api},
        maybeSingle() {q.single = true; return api},
        then(resolve, reject) {
          let data = fixture[table]
          let error = null
          if (table === 'payroll_component_catalog' && q.single) {
            data = options.catalogRow || catalog.find(c => c.code === q.filters.find(f=>f[1]==='code')?.[2]) || null
            if (options.catalogError) error = options.catalogError
          }
          return Promise.resolve({data,error}).then(resolve,reject)
        },
      }
      return api
    },
    async rpc(name, args) {
      trace.calls.push({name,args})
      if (name === 'has_role') return {data:options.roleAllowed !== false,error:options.roleError || null}
      if (options.rpcThrow) throw new Error('Mock transport failure')
      if (options.rpcError) return {data:null,error:options.rpcError}
      const data = options.rpcData !== undefined ? options.rpcData : {
        status:'CONFIGURED',component_id:CONFIG,employee_id:args.p_employee,
        branch_id:args.p_branch,component_code:args.p_component_code,
      }
      return {data,error:null}
    },
  }
  return {db, trace, fixture}
}
function load(fileOutput, env, page = false) {
  const redirect = url => { const error = new Error('REDIRECT');error.redirect = url;throw error }
  const module = {exports:{}}
  const requireMock = name => {
    if (name === 'next/navigation') return {redirect, notFound:()=>{throw new Error('NOT_FOUND')}}
    if (name === 'next/cache') return {revalidatePath:(...args)=>env.trace.revalidated.push(args)}
    if (name.endsWith('/finance/operations')) return {
      adminClient:async()=>{if(env.authRedirect)redirect('/login');return env.db}, uuidPattern,
      validDate:value=>Number.isFinite(Date.parse(value+'T00:00:00Z')),
      vietnamDateTime:()=> '2026-09-19T10:00',
    }
    if (name === 'react/jsx-runtime') return {jsx:(type,props,key)=>({type,props,key}), jsxs:(type,props,key)=>({type,props,key}),Fragment:'Fragment'}
    if (name.endsWith('/_components/vibe')) return { EmployeeSections:'EmployeeSections' }
    if (name === 'next/link') return 'Link'
    if (name.endsWith('/finance/query')) return {
      rows:async q=>{const r=await q;if(r.error)throw r.error;return r.data},
      all:async factory=>{const r=await factory(0,999);if(r.error)throw r.error;return r.data},
      branches:async()=>[{id:BRANCH,name:'Mock Branch'}],
    }
    if (name.endsWith('/finance/_components/ui')) return {
      Panel:'Panel',Table:'Table',Notice:'Notice',LoadError:'LoadError',
      dateText:value=>value,timeText:value=>value,
    }
    if (name.endsWith('/finance/_components/SubmitButton')) return 'SubmitButton'
    if (name.endsWith('/payroll/data')) return {money:(value,currency)=>`${value} ${currency}`}
    if (name === './actions' && page) return {configureStaffCompensation: function NEW_V2_ACTION(){}}
    throw new Error('Unexpected import: '+name)
  }
  vm.runInNewContext(fileOutput, {module,exports:module.exports,require:requireMock,
    console:{error:()=>{}},URLSearchParams,Date,Number,FormData}, {filename: page ? pagePath : actionPath})
  return module.exports
}
function form(patch = {}) {
  const values = {employee:EMP,branch:BRANCH,component_code:'SOCIAL_LABOR_INSURANCE',value:'100000',
    currency:'VND',from:'2026-09-01',to:'',reason:'Mock test, not a real insurance rate',...patch}
  const result = new FormData()
  for (const [key,value] of Object.entries(values)) if(value !== undefined) result.set(key,value)
  return result
}
async function submit(patch = {}, options = {}) {
  const env = makeDB(options)
  env.authRedirect = options.authRedirect
  const exports = load(compiledAction.output, env)
  let target
  try {await exports.configureStaffCompensation(form(patch))} catch(error) {
    if (!error.redirect) throw error
    target = new URL(error.redirect, 'http://localhost')
  }
  assert.ok(target, 'Action must redirect after completing')
  return {...env, target, error:target.searchParams.get('error'), success:target.searchParams.get('success')}
}
function newWrites(run) {return run.trace.calls.filter(call=>call.name==='configure_staff_compensation_component')}

for(const code of ['BASE_SALARY','POSITION_PAY','BUSINESS_TRIP_ALLOWANCE','SOCIAL_LABOR_INSURANCE']) {
  test(`fixed component ${code} uses guarded V2 RPC, correct positive shape`, async()=>{
    const run = await submit({component_code:code})
    assert.equal(run.error,null);assert.ok(run.success)
    const writes = newWrites(run);assert.equal(writes.length,1)
    assert.deepEqual(JSON.parse(JSON.stringify(writes[0].args)), {
      p_employee:EMP,p_component_code:code,p_branch:BRANCH,p_amount:'100000',p_rate:null,
      p_percentage:null,p_basis_component_code:null,p_currency:'VND',p_class_type:null,
      p_effective_from:'2026-09-01',p_effective_to:null,p_reason:'Mock test, not a real insurance rate',
    })
    assert.ok(!run.trace.calls.some(call=>/generate|configure_employee_compensation/.test(call.name)))
  })
}
for(const class_type of ['', 'ONE_ON_ONE','GROUP']) {
  test(`session shape with class_type ${class_type || 'all'}`, async()=>{
    const run = await submit({component_code:'TEACHING_PER_SESSION',value:'90000',class_type})
    assert.equal(run.error,null)
    const args = newWrites(run)[0].args
    assert.equal(args.p_rate,'90000');assert.equal(args.p_amount,null)
    assert.equal(args.p_class_type,class_type || null)
  })
}
for(const value of ['', '0','-100000','100.000','100,000','1e5','100000 VND','1.234','1000000000000','NaN']) {
  test(`invalid amount rejected without write: ${JSON.stringify(value)}`, async()=>{
    const run=await submit({value});assert.ok(run.error);assert.equal(newWrites(run).length,0)
  })
}
for(const [label,patch] of [
  ['invalid employee',{employee:'bad'}],['invalid branch',{branch:'bad'}],
  ['missing reason',{reason:''}],['oversized reason',{reason:'x'.repeat(2001)}],
  ['invalid date',{from:'2026-02-30'}],['reversed dates',{to:'2026-08-31'}],
  ['invalid currency',{currency:'VNDX'}],['fixed class type',{class_type:'GROUP'}],
  ['invalid session class',{component_code:'TEACHING_PER_SESSION',class_type:'UNKNOWN'}],
]) {
  test(`validation: ${label}`, async()=>{
    const run=await submit(patch);assert.equal(newWrites(run).length,0)
    assert.ok(run.error || run.target.pathname==='/admin/employees')
  })
}
for(const code of ['FIXED_PAY','BONUS','TRAVEL_EXPENSE']) {
  test(`forbidden recurring code ${code}`, async()=>{
    const run=await submit({component_code:code});assert.ok(run.error);assert.equal(newWrites(run).length,0)
  })
}
for(const change of [{status:'INACTIVE'},{recurring_configurable:false},
  {default_calculation_method:'PERCENTAGE'},{default_calculation_method:'PER_HOUR'},
  {category:'REIMBURSEMENT'}]) {
  test(`catalog is authoritative: ${JSON.stringify(change)}`, async()=>{
    const run=await submit({}, {catalogRow:{...catalog.find(c=>c.code==='SOCIAL_INSURANCE'),...change}})
    assert.ok(run.error);assert.equal(newWrites(run).length,0)
  })
}
test('catalog read failure does not write', async()=>{
  const run=await submit({}, {catalogError:{code:'x',message:'read failed'}})
  assert.ok(run.error);assert.equal(newWrites(run).length,0)
})
test('RPC overlap remains error, not success', async()=>{
  const run=await submit({}, {rpcError:{code:'P0001',message:'STAFF_COMPENSATION_OVERLAP'}})
  assert.match(run.error,/trùng hiệu lực/);assert.equal(run.success,null)
})
test('RPC unauthorized remains error; no privilege bypass', async()=>{
  const run=await submit({}, {rpcError:{code:'P0001',message:'STAFF_COMPENSATION_UNAUTHORIZED'}})
  assert.match(run.error,/SUPER_ADMIN/);assert.equal(run.success,null)
})
test('ALREADY_CONFIGURED response reports no new row', async()=>{
  const run=await submit({}, {rpcData:{status:'ALREADY_CONFIGURED',component_id:CONFIG,
    employee_id:EMP,branch_id:BRANCH,component_code:'SOCIAL_LABOR_INSURANCE'}})
  assert.equal(run.error,null);assert.match(run.success,/không tạo thêm/)
})
test('invalid or mismatched RPC response is not success', async()=>{
  for(const rpcData of [null,{}, {status:'CONFIGURED',component_id:CONFIG,employee_id:BRANCH,
    branch_id:BRANCH,component_code:'SOCIAL_INSURANCE'}]) {
    const run=await submit({}, {rpcData});assert.ok(run.error);assert.equal(run.success,null)
  }
})
test('transport failure reports uncertain result', async()=>{
  const run=await submit({}, {rpcThrow:true});assert.match(run.error,/Chưa xác nhận/)
})
test('auth redirect is not swallowed', async()=>{
  const run=await submit({}, {authRedirect:true});assert.equal(run.target.pathname,'/login')
  assert.equal(newWrites(run).length,0)
})
test('views revalidated but payroll generator never called', async()=>{
  const run=await submit()
  assert.ok(run.trace.revalidated.some(([p])=>p===`/admin/employees/${EMP}/compensation`))
  assert.ok(run.trace.revalidated.some(([p,type])=>p==='/admin/payroll'&&type==='layout'))
  assert.ok(!run.trace.calls.some(c=>c.name==='generate_staff_payroll_v2'))
})

function flatten(node, out=[]) {
  if(node===null || node===undefined || typeof node==='boolean') return out
  if(Array.isArray(node)) {for(const item of node)flatten(item,out);return out}
  if(typeof node!=='object') {out.push(node);return out}
  if(typeof node.type==='function') return flatten(node.type(node.props),out)
  out.push(node)
  if(node.props) {
    flatten(node.props.children,out)
    if(node.type==='Table') flatten(node.props.rows,out)
  }
  return out
}
async function render(options={}) {
  const env=makeDB(options)
  const page=load(compiledPage.output,env,true).default
  const tree=await page({params:Promise.resolve({id:EMP}),searchParams:Promise.resolve({})})
  return {...env, nodes:flatten(tree), tree}
}
test('Staff page queries V2 configs for employee and shows stored values', async()=>{
  const run=await render()
  const q=run.trace.queries.find(q=>q.table==='staff_compensation_components')
  assert.ok(q.filters.some(f=>f[0]==='eq'&&f[1]==='employee_id'&&f[2]===EMP))
  assert.ok(run.nodes.includes('4200000.00 VND'))
  assert.ok(run.nodes.includes('90000.00 VND / buổi'))
})
test('only current supported catalog codes appear as component options', async()=>{
  const run=await render()
  const options=run.nodes.filter(n=>n.type==='select'&&n.props.name==='component_code')
  assert.equal(options.length,1)
  const values=flatten(options[0]).filter(n=>n.type==='option').map(n=>n.props.value)
  for(const code of ['BASE_SALARY','SOCIAL_LABOR_INSURANCE','BUSINESS_TRIP_ALLOWANCE']) assert.ok(values.includes(code))
  for(const code of ['FIXED_PAY','BONUS','TRAVEL_EXPENSE','TEACHING_PER_SESSION','SOCIAL_INSURANCE','LABOR_INSURANCE']) assert.ok(!values.includes(code))
})
test('form field names match new action; legacy form is absent', async()=>{
  const run=await render()
  const forms=run.nodes.filter(n=>n.type==='form')
  assert.equal(forms.length,2)
  for(const f of forms) {
    assert.equal(f.props.action.name,'NEW_V2_ACTION')
    const fields=flatten(f).filter(n=>['input','select','textarea'].includes(n.type)).map(n=>n.props.name)
    for(const name of ['employee','branch','component_code','value','currency','from','to','reason']) assert.ok(fields.includes(name), name)
  }
})
test('non-admin sees data but no write form', async()=>{
  const run=await render({roleAllowed:false})
  assert.equal(run.nodes.filter(n=>n.type==='form').length,0)
  assert.ok(run.nodes.includes('4200000.00 VND'))
})
test('failed role check does not expose form', async()=>{
  const run=await render({roleError:{message:'mock role read error'}})
  assert.equal(run.nodes.filter(n=>n.type==='form').length,0)
})
test('V2 payroll summary uses v2_net_amount not legacy gross_amount', async()=>{
  const run=await render();assert.ok(run.nodes.includes('4700000.00 VND'))
  assert.ok(!run.nodes.includes('999.00 VND'))
})
test('missing teacher profile hides session form only', async()=>{
  const db=makeDB();const staff={...db.fixture.employee_directory,teacher_id:null}
  const run=await render({fixture:{employee_directory:staff}})
  assert.equal(run.nodes.filter(n=>n.type==='form').length,1)
})
test('no Staff config insert/update/delete or automatic generation in source', ()=>{
  const newAction=compiledAction.source.slice(compiledAction.source.indexOf('export async function configureStaffCompensation'))
  assert.doesNotMatch(newAction,/\.insert\(|\.update\(|\.delete\(/)
  assert.doesNotMatch(newAction,/\.rpc\(['"]generate_staff_payroll_v2/)
  assert.doesNotMatch(newAction,/service_role|serviceRole/)
  assert.doesNotMatch(compiledPage.source,/action=\{configureCompensation\}/)
})

for (const code of ['SOCIAL_INSURANCE','LABOR_INSURANCE']) test('historical insurance rejected for new config: '+code, async()=>{const run=await submit({component_code:code});assert.ok(run.error);assert.equal(newWrites(run).length,0)})
