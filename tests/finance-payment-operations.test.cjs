/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS tests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, fixture, render } = require('./helpers/finance-operations.cjs')
test('payment create uses Vietnam datetime and normalized currency/method', async () => {
  const h = harness(); await redirected(h.load('payments/actions.ts').createPayment, { idempotency_key: id(90), student_id: id(1), branch_id: id(2), amount: '123.45', currency: 'usd', payment_method: 'card', paid_at: '2026-09-15T07:30', reference: 'ref' })
  assert.deepEqual(h.calls[1], { rpc: 'create_payment_once', args: { p_idempotency_key: id(90), p_student_id: id(1), p_branch_id: id(2), p_amount: '123.45', p_currency: 'USD', p_payment_method: 'CARD', p_paid_at: '2026-09-15T07:30:00+07:00', p_reference: 'ref', p_notes: null } })
})

test('payment partial allocation delegates student/currency/balance authority to RPC', async () => {
  const h = harness(); await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(1), invoice_id: id(2), amount: '50.25' })
  assert.deepEqual(h.calls[1], { rpc: 'allocate_payment_to_invoice', args: { p_payment_id: id(1), p_invoice_id: id(2), p_amount: '50.25' } })
})

test('invalid amounts reject before RPC; wrong currency backend error is translated', async () => {
  for (const amount of ['-1', '0', 'NaN', '1e5', '1.234']) {
    const h = harness(); await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(1), invoice_id: id(2), amount }); assert.equal(h.calls.length, 1)
  }
  const h = harness({}, { message: 'Payment and invoice currencies must match' })
  const url = await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(1), invoice_id: id(2), amount: 10 })
  assert.match(url.searchParams.get('error'), /cùng loại tiền/)
})

test('void payment requires reason and confirmation; valid request calls void RPC', async () => {
  const h = harness(); const action = h.load('payments/actions.ts').voidPayment
  await redirected(action, { payment_id: id(1), reason: 'Điều chỉnh' }); assert.equal(h.calls.length, 1)
  await redirected(action, { idempotency_key: id(80), payment_id: id(1), reason: 'Điều chỉnh', confirm: 'yes' }); assert.equal(h.calls.at(-1).rpc, 'request_financial_action'); assert.equal(h.calls.at(-1).args.p_operation, 'VOID_PAYMENT')
})

test('payment list derives remaining and displays void warning in selected detail', async () => {
  const h = harness(fixture()); const html = await render(h, 'payments', { selected: id(4) })
  assert.match(html, /250\.000/); assert.match(html, /công nợ mở lại/); assert.match(html, /REF-TEST/)
})

test('mutations reject anonymous and non-admin users before financial RPC', async () => {
  for (const [role, signedIn] of [[true, false], [false, true]]) {
    const h = harness({}, null, role, signedIn)
    const url = await redirected(h.load('payments/actions.ts').createPayment, {})
    assert.equal(url.pathname, '/login'); assert.ok(h.calls.every(c => c.rpc === 'has_role'))
  }
})

test('invoice guided payment derives identity and currency server-side then opens allocation step',async()=>{
 const h=harness(fixture())
 const url=await redirected(h.load('payments/actions.ts').createInvoicePayment,{idempotency_key:id(90),invoice_id:id(2),student_id:id(40),branch_id:id(41),currency:'USD',amount:'100000',payment_method:'cash',paid_at:'2026-09-15T08:30',reference:'Desk'})
 assert.equal(url.searchParams.get('selected'),id(99));assert.equal(url.searchParams.get('invoice'),id(2))
 assert.match(url.searchParams.get('success'),/Bước 2/)
 assert.deepEqual(h.calls.find(c=>c.rpc==='create_payment_once').args,{p_idempotency_key:id(90),p_student_id:id(1),p_branch_id:id(3),p_currency:'VND',p_amount:'100000',p_payment_method:'CASH',p_paid_at:'2026-09-15T08:30:00+07:00',p_reference:'Desk',p_notes:null})
 assert.ok(!h.calls.some(c=>c.rpc==='allocate_payment_to_invoice'))
})
test('invoice guided payment rejects invalid amount and non-issued invoice',async()=>{
 for(const [status,amount] of [['DRAFT','100'],['CANCELLED','100'],['ISSUED','900000'],['ISSUED','-1']]) {
  const data=fixture();data.invoice_receivables[0].invoice_status=status;const h=harness(data)
  const url=await redirected(h.load('payments/actions.ts').createInvoicePayment,{idempotency_key:id(90),invoice_id:id(2),amount,payment_method:'CASH',paid_at:'2026-09-15T08:30'})
  assert.ok(url.searchParams.has('error'));assert.ok(!h.calls.some(c=>c.rpc==='create_payment_once'))
 }
})
test('invoice guided payment failure never offers allocation of an unknown payment',async()=>{
 const h=harness(fixture(),{message:'private database info'})
 const url=await redirected(h.load('payments/actions.ts').createInvoicePayment,{idempotency_key:id(90),invoice_id:id(2),amount:'100',payment_method:'CASH',paid_at:'2026-09-15T08:30'})
 assert.ok(url.searchParams.has('error'));assert.equal(url.searchParams.has('selected'),false);assert.doesNotMatch(url.href,/private/)
})
test('invoice payment form and allocation retain the selected invoice',async()=>{
 const data=fixture();const h=harness(data)
 const html=await render(h,'payments',{invoice:id(2)})
 assert.match(html,/Bước 1/);assert.match(html,/Bước 2/);assert.match(html,/name="invoice_id"/);assert.match(html,/value="800000"/)
 const detail=await render(harness(data),'payments',{invoice:id(2),selected:id(4)})
 assert.match(detail,/Quay lại hóa đơn/)
})

function allocationFixture() {
  const data = structuredClone(fixture())
  data.payment_allocations = []
  return data
}
function selectedPanel(html) {
  return html.slice(html.indexOf('<h2 class="text-lg font-semibold">Thanh toán PAY-TEST'), html.indexOf('<h2 class="text-lg font-semibold">Ghi nhận thanh toán mới'))
}
function allocationArea(html) {
  return html.slice(html.indexOf('Phân bổ vào hóa đơn'), html.indexOf('Phân bổ thu nợ mở sổ'))
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => elements(n, predicate))
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate), ...elements(node.props?.rows, predicate)]
}

test('selected POSTED summary uses original allocation reservation, including released credits', async () => {
  const data = structuredClone(fixture())
  data.customer_credits = [{ payment_id: id(4), source_allocation_id: id(5), amount: 100000 }]
  const panel = selectedPanel(await render(harness(data), 'payments', { selected: id(4) }))
  for (const label of ['PAY-TEST', 'Học viên thử nghiệm', 'POSTED', 'Số tiền đã nhận', 'Đã phân bổ', 'Chưa phân bổ']) assert.ok(panel.includes(label))
  assert.match(panel, /Số tiền đã nhận<\/dt><dd[^>]*>500\.000/)
  assert.match(panel, /Đã phân bổ<\/dt><dd[^>]*>250\.000/)
  assert.match(panel, /Chưa phân bổ<\/dt><dd[^>]*>250\.000/)
})

test('eligible invoice query excludes non-issued, settled, other student and currency invoices', async () => {
  const data = allocationFixture(), base = data.invoice_receivables[0]
  data.invoice_receivables.push(...[
    { invoice_status: 'DRAFT' }, { invoice_status: 'CANCELLED' }, { outstanding_balance: 0 },
    { student_id_snapshot: id(71) }, { currency: 'USD' },
  ].map((patch, n) => ({ ...base, ...patch, invoice_id: id(20 + n), invoice_number: `INELIGIBLE-${n}` })))
  const html = allocationArea(await render(harness(data), 'payments', { selected: id(4) }))
  assert.match(html, /INV-TEST/); assert.match(html, /10\/09\/2026/); assert.match(html, /800\.000/)
  assert.ok(html.includes('/admin/finance/invoices?selected=' + id(2)))
  assert.doesNotMatch(html, /INELIGIBLE-/)
})

test('single invoice prefills and caps amount at the smaller of outstanding and unallocated', async () => {
  for (const [outstanding, received, expected] of [[800000, 500000, 500000], [200000, 500000, 200000]]) {
    const data = allocationFixture()
    data.invoice_receivables[0].outstanding_balance = outstanding; data.payments[0].amount = received
    const html = allocationArea(await render(harness(data), 'payments', { selected: id(4) }))
    assert.match(html, new RegExp(`<input(?=[^>]*name="amount")(?=[^>]*max="${expected}")(?=[^>]*value="${expected}")[^>]*>`))
    assert.match(html, /min="0.01"/)
  }
})

test('equal balances expose explicit full allocation using the existing action and preserve selection', async () => {
  const data = allocationFixture(); data.invoice_receivables[0].outstanding_balance = 500000
  const h = harness(data)
  const tree = await h.load('payments/page.tsx').default({ searchParams: Promise.resolve({ selected: id(4) }) })
  const forms = elements(tree, n => n.type === 'form' && n.props.action?.name === 'allocatePayment')
  assert.equal(forms.length, 2)
  const values = Object.fromEntries(elements(forms[1], n => n.type === 'input').map(n => [n.props.name, n.props.value]))
  assert.equal(values.amount, '500000')
  assert.ok(elements(forms[1], n => n.props?.children === 'Phân bổ toàn bộ').length)
  assert.ok(!h.calls.some(c => c.rpc === 'allocate_payment_to_invoice'), 'render never allocates')
  const url = await redirected(forms[1].props.action, values)
  assert.deepEqual(h.calls.at(-1), { rpc: 'allocate_payment_to_invoice', args: { p_payment_id: id(4), p_invoice_id: id(2), p_amount: '500000' } })
  assert.equal(url.pathname, '/admin/finance/invoices'); assert.equal(url.searchParams.get('selected'), id(2))
  assert.ok(h.invalidated.includes('/admin/finance/invoices')); assert.ok(h.invalidated.includes('/admin/finance/payments'))
})

test('backend balance rejection is surfaced without losing selected payment', async () => {
  for (const message of ['Allocation exceeds the remaining payment amount', 'Allocation exceeds the remaining invoice balance']) {
    const h = harness({}, { message })
    const url = await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(4), selected: id(4), invoice_id: id(2), amount: '900000' })
    assert.ok(url.searchParams.has('error')); assert.ok(!url.searchParams.has('success'))
    assert.equal(url.searchParams.get('selected'), id(4))
  }
})

test('no eligible invoices has useful empty state; exhausted payment has no allocation form', async () => {
  const data = allocationFixture(); data.invoice_receivables = []
  let html = await render(harness(data), 'payments', { selected: id(4) })
  assert.match(html, /Không có hóa đơn ISSUED còn công nợ phù hợp với học viên và loại tiền của khoản thanh toán này/)
  const exhausted = allocationFixture()
  exhausted.payment_allocations = [{ id: id(61), payment_id: id(4), invoice_id: id(62), amount: 500000, invoices: { invoice_number: 'INV-OTHER' } }]
  html = allocationArea(await render(harness(exhausted), 'payments', { selected: id(4) }))
  assert.match(html, /đã được phân bổ hết/); assert.doesNotMatch(html, /name="amount"/)
})

test('repeated partial allocation remains blocked and original history is visible', async () => {
  const html = selectedPanel(await render(harness(structuredClone(fixture())), 'payments', { selected: id(4) }))
  assert.match(allocationArea(html), /không cho phân bổ lần hai/)
  assert.doesNotMatch(allocationArea(html), /name="amount"/)
  assert.match(html, /Lịch sử phân bổ/); assert.match(html, /Số tiền phân bổ gốc/)
  const history = html.slice(html.indexOf('Lịch sử phân bổ'))
  assert.match(history, /INV-TEST/); assert.match(history, /250\.000/)
})

test('opening balance allocation and void forms remain usable and no manual invoice status control exists', async () => {
  const data = allocationFixture()
  data.opening_receivable_balances = [{ id: id(63), student_id: id(1), branch_id: id(3), currency: 'VND', reversed: false, opening_as_of_date: '2026-01-01', outstanding_balance: 100000 }]
  const html = selectedPanel(await render(harness(data), 'payments', { selected: id(4) }))
  assert.match(html, /Phân bổ thu nợ mở sổ/); assert.match(html, /name="opening_receivable_id"/)
  assert.match(html, /Lý do vô hiệu thanh toán/); assert.match(html, /Gửi yêu cầu vô hiệu thanh toán/)
  assert.doesNotMatch(html, /<select|name="(?:status|payment_status|invoice_status)"/)
})

test('fresh ledger data renders updated summary and history after allocation', async () => {
  const data = allocationFixture()
  const before = selectedPanel(await render(harness(data), 'payments', { selected: id(4) }))
  assert.match(before, /Chưa phân bổ<\/dt><dd[^>]*>500\.000/)
  data.payment_allocations = [{ id: id(64), payment_id: id(4), invoice_id: id(2), amount: 200000, invoices: { invoice_number: 'INV-TEST' } }]
  data.invoice_receivables[0].outstanding_balance = 600000
  const after = selectedPanel(await render(harness(data), 'payments', { selected: id(4) }))
  assert.match(after, /Chưa phân bổ<\/dt><dd[^>]*>300\.000/)
  assert.match(after, /Đã phân bổ<\/dt><dd[^>]*>200\.000/)
  assert.match(after, /600\.000/); assert.match(after, /Lịch sử phân bổ/)
})

 test('payment entry errors retain request key and missing key cannot create cash', async () => {
 const values={idempotency_key:id(90),student_id:id(1),branch_id:id(3),amount:'100',currency:'VND',payment_method:'CASH',paid_at:'2026-09-15T08:30'}
 const h=harness({}, {message:'timeout'});const url=await redirected(h.load('payments/actions.ts').createPayment,values)
 assert.equal(url.searchParams.get('entry'),id(90))
 const missing=harness();delete values.idempotency_key;await redirected(missing.load('payments/actions.ts').createPayment,values)
 assert.ok(!missing.calls.some(c=>c.rpc==='create_payment_once'))
 })
 test('invoice entry offers existing money without creating another payment', async()=>{
 const data=structuredClone(fixture());data.payment_allocations=[];const h=harness(data);const html=await render(h,'payments',{invoice:id(2),entry:id(90)})
 assert.match(html,/Phân bổ khoản tiền đã thu/);assert.match(html,/PAY-TEST/);assert.match(html,/name="idempotency_key" value="a0000000-0000-0000-0000-000000000090"/)
 assert.ok(!h.calls.some(c=>c.rpc==='create_payment_once'))
 })

test('invoice receipt choice submits allocation directly and returns to updated invoice', async()=>{
 const data=allocationFixture(),h=harness(data)
 const tree=await h.load('payments/page.tsx').default({searchParams:Promise.resolve({invoice:id(2)})})
 const forms=elements(tree,n=>n.type==='form'&&n.props.action?.name==='allocatePayment')
 assert.equal(forms.length,1)
 const values=Object.fromEntries(elements(forms[0],n=>n.type==='input').map(n=>[n.props.name,n.props.value]))
 const amount=elements(forms[0],n=>n.props?.name==='amount')[0];values.amount=amount.props.value
 assert.equal(values.payment_id,id(4));assert.equal(values.invoice_id,id(2));assert.equal(values.amount,'500000')
 const url=await redirected(forms[0].props.action,values)
 assert.equal(url.pathname,'/admin/finance/invoices');assert.equal(url.searchParams.get('selected'),id(2))
 assert.equal(h.calls.filter(c=>c.rpc==='allocate_payment_to_invoice').length,1)
 assert.ok(!h.calls.some(c=>c.rpc?.includes('create_payment')))
})
test('invoice receipt candidates exclude already allocated pair',async()=>{
 const h=harness(structuredClone(fixture()))
 const tree=await h.load('payments/page.tsx').default({searchParams:Promise.resolve({invoice:id(2)})})
 assert.equal(elements(tree,n=>n.type==='form'&&n.props.action?.name==='allocatePayment').length,0)
})
