const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file) {
  const cache = new Map()
  const read = target => {
    if (cache.has(target)) return cache.get(target)
    const compiled = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(target, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const localRequire = name => {
      if (name === 'server-only') return {}
      if (name.startsWith('@/')) {
        const resolved = path.resolve(__dirname, '..', name.slice(2))
        const filePath = fs.existsSync(resolved + '.ts') ? resolved + '.ts' : fs.existsSync(resolved + '.tsx') ? resolved + '.tsx' : resolved
        return read(filePath)
      }
      if (name.startsWith('.')) {
        const resolved = path.resolve(path.dirname(target), name)
        const filePath = fs.existsSync(resolved + '.ts') ? resolved + '.ts' : fs.existsSync(resolved + '.tsx') ? resolved + '.tsx' : resolved
        return read(filePath)
      }
      return require(name)
    }
    new Function('require', 'module', 'exports', code)(localRequire, compiled, compiled.exports)
    cache.set(target, compiled.exports)
    return compiled.exports
  }
  return read(file)
}

const payment = load(path.join(__dirname, '../lib/integrations/tuition/payment-zbs.ts'))
const renewal = load(path.join(__dirname, '../lib/integrations/tuition/auto-renewal.ts'))
const reminder = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
const parameters = [...payment.TUITION_PAYMENT_BODY_PARAMETERS, payment.TUITION_PAYMENT_CTA_PARAMETER]

function template(enabled) {
  return {
    template_key: 'ZALO_TUITION_PAYMENT', status: 'APPROVED', enabled,
    provider_template_id: '645028', parameter_schema: parameters,
    payload_schema: { purpose: 'TUITION_PAYMENT_REQUEST', cta: 'payment_link_id' },
  }
}

function admin(state) {
  const calls = []
  return {
    calls,
    async rpc(name, args) {
      calls.push(name)
      if (name === 'claim_tuition_renewal_automation') {
        const due = state.queue.filter(row => row.status === 'PENDING' || (row.status === 'PROCESSING' && row.lockedUntil <= Date.now()))
        const picked = due.slice(0, 1)
        for (const row of picked) {
          row.status = 'PROCESSING'
          row.lockedUntil = Date.now() + 120000
          row.attempts += 1
        }
        return { data: picked.map(row => ({ reminder_id: row.reminderId })) }
      }
      if (name === 'finish_tuition_renewal_automation') {
        const row = state.queue.find(item => item.reminderId === args.p_reminder)
        row.status = args.p_error === 'ZBS_SEND_DISABLED' && args.p_status === 'PENDING' ? 'PENDING' : args.p_status
        row.error = args.p_error
        row.lockedUntil = 0
        if (args.p_error === 'ZBS_SEND_DISABLED') row.attempts = Math.max(row.attempts - 1, 0)
        return { data: row.status }
      }
      if (name === 'auto_begin_tuition_renewal') {
        state.begins += 1
        if (!state.case) {
          state.case = { id: 'case-1', reminder_id: reminder, student_id: 'student-1', parent_id: 'parent-1', plan_code: 'VIBE_3_MONTHS', list_price: 5500000, amount_due: 2750000, payment_option: 'DEPOSIT_50', due_on: '2026-11-15', invoice_id: 'invoice-1', zbs_status: 'NONE', zbs_error_code: null, state: 'CHECKOUT_PENDING' }
          state.orders.push({ case_id: 'case-1', state: 'RESERVED', order_code: 101, amount: 2750000, description: 'HP TEST', checkout_url: null, payment_link_id: null })
          state.invoices.push({ id: 'invoice-1', invoice_number: 'INV-SYNTHETIC-645' })
        }
        return { data: { result: state.begins === 1 ? 'created' : 'existing', case_id: 'case-1' } }
      }
      if (name === 'activate_tuition_payos_checkout') {
        const order = state.orders.find(row => row.case_id === args.p_case && row.state === 'RESERVED')
        if (!order || order.order_code !== args.p_order_code) return { error: { message: 'MISMATCH' } }
        order.state = 'PENDING'
        order.payment_link_id = args.p_payment_link_id
        order.checkout_url = args.p_checkout_url
        return { error: null }
      }
      if (name === 'claim_tuition_payment_notice') {
        if (state.notice === 'SENT') return { data: 'ALREADY_ACCEPTED' }
        state.notice = 'QUEUED'
        return { data: 'CLAIMED' }
      }
      if (name === 'finish_tuition_payment_notice') {
        state.notice = args.p_outcome === 'ACCEPTED' ? 'SENT' : 'HELD'
        const row = state.case
        row.zbs_status = state.notice
        return { error: null }
      }
      return { error: { message: 'UNEXPECTED_' + name } }
    },
    from(table) {
      const filters = []
      const api = {
        select() { return api },
        eq(key, value) { filters.push(row => row[key] === value); return api },
        in(key, values) { filters.push(row => values.includes(row[key])); return api },
        limit() { return api },
        maybeSingle() { return api },
        then(resolve, reject) {
          const rows = (state.tables[table] ?? []).filter(row => filters.every(match => match(row)))
          return Promise.resolve({ data: rows[0] ?? null, error: null }).then(resolve, reject)
        },
      }
      return api
    },
  }
}

function state(enabled) {
  const current = {
    begins: 0, notice: 'NONE', case: null, orders: [], invoices: [],
    queue: [{ reminderId: reminder, status: 'PENDING', attempts: 0, lockedUntil: 0 }],
    tables: {
      notification_templates: [template(enabled)],
      tuition_zalo_sends: [{ reminder_id: reminder, parent_id: 'parent-1', send_status: 'SENT' }],
      parents: [{ id: 'parent-1', parent_code: 'PH-TEST', user_id: 'profile-1' }],
      profiles: [{ id: 'profile-1', full_name: 'Phụ huynh thử', phone: '0900000000' }],
      students: [{ id: 'student-1', full_name: 'Học viên thử' }],
    },
  }
  Object.defineProperty(current.tables, 'tuition_renewal_cases', { get: () => current.case ? [current.case] : [] })
  Object.defineProperty(current.tables, 'tuition_payos_orders', { get: () => current.orders })
  Object.defineProperty(current.tables, 'invoices', { get: () => current.invoices })
  return current
}

test('a disabled payment template does not open a renewal or a payOS order', async () => {
  const current = state(false)
  const db = admin(current)
  const opened = []
  const result = await renewal.runTuitionRenewalAutomation(db, 1, {
    openCheckout: async () => { opened.push('open'); return { checkout: null } },
    send: async () => { throw new Error('send must not run') },
  })
  assert.equal(result.results[0].step, 'prepare')
  assert.equal(current.queue[0].error, 'ZBS_SEND_DISABLED')
  assert.equal(current.begins, 0)
  assert.equal(opened.length, 0)
  assert.equal(current.orders.length, 0)
  assert.equal(current.queue[0].status, 'PENDING')
  assert.equal(current.queue[0].attempts, 0)
})

test('a failed checkout retries once and a stored checkout is not opened again', async () => {
  const current = state(true)
  const db = admin(current)
  const opened = []
  const send = async () => ({ outcome: 'ACCEPTED', reason: 'ACCEPTED' })
  const openCheckout = async () => {
    opened.push('open')
    if (opened.length === 1) throw new Error('provider down')
    return { checkout: { orderCode: 101, amount: 2750000, paymentLinkId: 'synthetic01', checkoutUrl: 'https://pay.payos.vn/web/synthetic01', qrCode: '' } }
  }
  const first = await renewal.runTuitionRenewalAutomation(db, 1, { openCheckout, send })
  assert.equal(first.results[0].step, 'exception')
  assert.equal(current.queue[0].error, 'EXCEPTION')
  assert.equal(current.orders.length, 1)
  assert.equal(current.orders[0].state, 'RESERVED')
  current.queue[0].status = 'PENDING'
  current.queue[0].lockedUntil = 0
  const second = await renewal.runTuitionRenewalAutomation(db, 1, { openCheckout, send })
  assert.equal(second.results[0].step, 'payment_request_sent')
  assert.equal(opened.length, 2)
  assert.equal(current.begins, 2)
  assert.equal(current.orders.filter(order => order.state === 'PENDING').length, 1)
  current.queue[0].status = 'PENDING'
  current.queue[0].lockedUntil = 0
  await renewal.runTuitionRenewalAutomation(db, 1, { openCheckout, send })
  assert.equal(opened.length, 2)
  assert.equal(db.calls.filter(name => name === 'claim_tuition_payment_notice').length, 1)
})

test('the webhook resumes a duplicate button event without treating it as a new reply', () => {
  const route = fs.readFileSync(path.join(__dirname, '../app/api/integrations/zalo/webhook/route.ts'), 'utf8')
  assert.match(route, /outcome === 'recorded' \|\| outcome === 'duplicate'/)
  assert.match(route, /runTuitionRenewalAutomation/)
  assert.doesNotMatch(route, /user_received_message' && \(outcome/)
})
