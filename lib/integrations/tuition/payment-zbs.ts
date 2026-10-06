export const TUITION_PAYMENT_REQUEST = 'TUITION_PAYMENT_REQUEST'
export const TUITION_PAYMENT_CONFIRMATION = 'TUITION_PAYMENT_CONFIRMATION'
export const TUITION_PAYMENT_TEMPLATE_KEY = 'ZALO_TUITION_PAYMENT'
export const TUITION_CONFIRMATION_TEMPLATE_KEY = 'ZALO_TUITION_PAYMENT_CONFIRMATION'
export const TUITION_PAYMENT_REQUEST_STATUS = 'Chờ thanh toán'
export const TUITION_DEPOSIT_STATUS = 'Đã nhận cọc 50%'
export const TUITION_PAID_STATUS = 'Đã thanh toán'
export const FORBIDDEN_PAYMENT_TEMPLATE_IDS = ['643118', '640377'] as const

export const TUITION_PAYMENT_BODY_PARAMETERS = [
  'customer_name',
  'payment_status',
  'student_name',
  'invoice_code',
  'tuition_package',
  'package_amount',
  'payment_type',
  'amount_due',
  'payment_deadline',
] as const

export const TUITION_PAYMENT_CTA_PARAMETER = 'payment_link_id'
const PAYOS_WEB_PREFIX = 'https://pay.payos.vn/web/'

export type TuitionPaymentTemplate = {
  template_key?: string | null
  status?: string | null
  enabled?: boolean | null
  provider_template_id?: string | null
  parameter_schema?: unknown
  payload_schema?: unknown
} | null

export function payosWebCheckoutUrl(paymentLinkId: string) {
  return `${PAYOS_WEB_PREFIX}${paymentLinkId}`
}

export function paymentLinkIdFromCheckout(checkoutUrl: string) {
  if (!checkoutUrl.startsWith(PAYOS_WEB_PREFIX)) return null
  const paymentLinkId = checkoutUrl.slice(PAYOS_WEB_PREFIX.length)
  return /^[A-Za-z0-9]{8,64}$/.test(paymentLinkId) ? paymentLinkId : null
}

export function paymentDeadline(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null
  return `${day}/${month}/${year}`
}

function rawAmount(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? String(value) : null
}

function schemaParameters(template: TuitionPaymentTemplate) {
  return Array.isArray(template?.parameter_schema) ? template.parameter_schema.filter((item): item is string => typeof item === 'string') : []
}

export function tuitionTemplatePurpose(template: TuitionPaymentTemplate) {
  const payload = template?.payload_schema
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const purpose = (payload as { purpose?: unknown }).purpose
  return typeof purpose === 'string' ? purpose : null
}

export const VERIFIED_TUITION_PAYMENT_TEMPLATE_ID = '645028'

function configuredTemplateId(template: TuitionPaymentTemplate) {
  return template?.provider_template_id?.trim() ?? ''
}

export function tuitionPaymentTemplateConfigured(template: TuitionPaymentTemplate, purpose: string) {
  const templateId = configuredTemplateId(template)
  const parameters = schemaParameters(template)
  const approved = template?.status === 'ENABLE' || template?.status === 'APPROVED'
  return Boolean(
    template
    && template.template_key
    && approved
    && templateId
    && !FORBIDDEN_PAYMENT_TEMPLATE_IDS.includes(templateId as typeof FORBIDDEN_PAYMENT_TEMPLATE_IDS[number])
    && tuitionTemplatePurpose(template) === purpose
    && TUITION_PAYMENT_BODY_PARAMETERS.every(key => parameters.includes(key))
    && parameters.includes(TUITION_PAYMENT_CTA_PARAMETER)
  )
}

export function tuitionPaymentTemplateReady(template: TuitionPaymentTemplate, purpose: string) {
  return tuitionPaymentTemplateConfigured(template, purpose) && template?.enabled === true
}

export type TuitionPaymentRequestInput = {
  customerName: string
  studentName: string
  invoiceCode: string
  packageName: string
  packageAmount: number
  paymentType: string
  amountDue: number
  deadline: string
  paymentLinkId: string
  checkoutUrl: string
}

export function buildTuitionPaymentRequest(input: TuitionPaymentRequestInput) {
  const packageAmount = rawAmount(input.packageAmount)
  const amountDue = rawAmount(input.amountDue)
  const deadline = paymentDeadline(input.deadline)
  const paymentLinkId = input.paymentLinkId.trim()
  const reconstructed = payosWebCheckoutUrl(paymentLinkId)
  if (!input.customerName.trim() || !input.studentName.trim() || !input.invoiceCode.trim() || !input.packageName.trim() || !input.paymentType.trim()) {
    return { ok: false as const, code: 'ZBS_PAYLOAD_INVALID' }
  }
  if (!packageAmount || !amountDue || !deadline || !/^[A-Za-z0-9]{8,64}$/.test(paymentLinkId) || paymentLinkId.includes('http') || input.checkoutUrl !== reconstructed) {
    return { ok: false as const, code: 'PAYOS_LINK_MISMATCH' }
  }
  const body = {
    customer_name: input.customerName.trim(),
    payment_status: TUITION_PAYMENT_REQUEST_STATUS,
    student_name: input.studentName.trim(),
    invoice_code: input.invoiceCode.trim(),
    tuition_package: input.packageName.trim(),
    package_amount: packageAmount,
    payment_type: input.paymentType.trim(),
    amount_due: amountDue,
    payment_deadline: deadline,
  }
  return {
    ok: true as const,
    purpose: TUITION_PAYMENT_REQUEST,
    body,
    cta: { payment_link_id: paymentLinkId },
    checkoutUrl: reconstructed,
  }
}

export function buildTuitionPaymentConfirmation(status: string) {
  if (status !== TUITION_DEPOSIT_STATUS && status !== TUITION_PAID_STATUS) return { ok: false as const, code: 'ZBS_CONFIRMATION_STATUS_INVALID' }
  return {
    ok: true as const,
    purpose: TUITION_PAYMENT_CONFIRMATION,
    body: { payment_status: status },
  }
}

export function previewVerifiedTuitionPayment(template: TuitionPaymentTemplate, input: TuitionPaymentRequestInput) {
  const templateId = configuredTemplateId(template)
  if (templateId !== VERIFIED_TUITION_PAYMENT_TEMPLATE_ID || (template?.status !== 'APPROVED' && template?.status !== 'ENABLE')) {
    return { ok: false as const, code: 'TEMPLATE_NOT_CONFIGURED', templateId: templateId || null, parameters: null, sent: false as const }
  }
  const expected = [...TUITION_PAYMENT_BODY_PARAMETERS, TUITION_PAYMENT_CTA_PARAMETER]
  const actual = schemaParameters(template)
  const unverified = [...expected.filter(key => !actual.includes(key)), ...actual.filter(key => !expected.includes(key))]
  if (unverified.length > 0 || tuitionTemplatePurpose(template) !== TUITION_PAYMENT_REQUEST) {
    return { ok: false as const, code: 'SCHEMA_UNVERIFIED', templateId, unverified, parameters: null, sent: false as const }
  }
  const built = buildTuitionPaymentRequest(input)
  if (!built.ok) return { ok: false as const, code: built.code, templateId, parameters: null, sent: false as const }
  return {
    ok: true as const,
    code: 'PREVIEW',
    templateId,
    sent: false as const,
    parameters: { ...built.body, payment_link_id: built.cta.payment_link_id },
    button: { title: 'Thanh toán học phí', url: built.checkoutUrl },
  }
}

export type TuitionPaymentAttempt = {
  key: string
  outcome: 'HELD' | 'UNKNOWN' | 'SENT'
  invoiceCode: string
  paymentLinkId: string
}

export function paymentAttemptFromStored(status: string | null | undefined, errorCode: string | null | undefined, key: string, invoiceCode: string, paymentLinkId: string): TuitionPaymentAttempt | null {
  if (errorCode === 'ACCEPTANCE_UNKNOWN') return { key, outcome: 'UNKNOWN', invoiceCode, paymentLinkId }
  if (status === 'SENT') return { key, outcome: 'SENT', invoiceCode, paymentLinkId }
  if (status === 'HELD' || status === 'QUEUED' || status === 'FAILED') return { key, outcome: 'HELD', invoiceCode, paymentLinkId }
  return null
}

export function tuitionPaymentDispatch(template: TuitionPaymentTemplate, request: ReturnType<typeof buildTuitionPaymentRequest>) {
  const templateId = configuredTemplateId(template) || null
  const idle = { templateId, sent: false as const, paid: false as const }
  if (!tuitionPaymentTemplateConfigured(template, TUITION_PAYMENT_REQUEST)) return { ...idle, state: 'BLOCKED' as const, code: 'ZBS_TEMPLATE_REQUIRED' as const }
  if (!request.ok) return { ...idle, state: 'BLOCKED' as const, code: request.code }
  if (!tuitionPaymentTemplateReady(template, TUITION_PAYMENT_REQUEST)) {
    return { ...idle, state: 'HELD' as const, code: 'ZBS_SEND_DISABLED' as const, templateKey: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY }
  }
  return { ...idle, state: 'ELIGIBLE' as const, code: 'ELIGIBLE' as const, templateKey: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY }
}

export function prepareTuitionPaymentRequest(args: {
  template: TuitionPaymentTemplate
  input: TuitionPaymentRequestInput
  linkInvoiceCode: string
  attempt?: TuitionPaymentAttempt | null
  continuationReply?: string | null
}) {
  const templateId = configuredTemplateId(args.template) || null
  const idle = { sent: false as const, paid: false as const, templateId, parameters: null as Record<string, string> | null }
  if (args.continuationReply) return { ...idle, code: 'CONTINUATION_IGNORED' as const }
  if (args.attempt?.outcome === 'UNKNOWN') return { ...idle, code: 'UNKNOWN_NOT_RETRIED' as const }
  if (args.attempt?.outcome === 'SENT') return { ...idle, code: 'ALREADY_RECORDED' as const }
  if (args.linkInvoiceCode !== args.input.invoiceCode) return { ...idle, code: 'LINK_INVOICE_MISMATCH' as const }
  const built = buildTuitionPaymentRequest(args.input)
  if (!built.ok) return { ...idle, code: built.code }
  if (!tuitionPaymentTemplateConfigured(args.template, TUITION_PAYMENT_REQUEST)) return { ...idle, code: 'ZBS_TEMPLATE_REQUIRED' as const }
  const parameters = { ...built.body, payment_link_id: built.cta.payment_link_id }
  const ready = tuitionPaymentTemplateReady(args.template, TUITION_PAYMENT_REQUEST)
  // A hold is not a consumed send. Enabling the template does not call Zalo.
  if (args.attempt?.outcome === 'HELD') {
    return ready
      ? { ...idle, code: 'ELIGIBLE' as const, templateId, parameters }
      : { ...idle, code: 'DUPLICATE_HELD' as const, templateId, parameters }
  }
  return ready
    ? { ...idle, code: 'ELIGIBLE' as const, templateId, parameters }
    : { ...idle, code: 'ZBS_SEND_DISABLED' as const, templateId, parameters }
}

export type PaymentProviderResult = 'ACCEPTED' | 'UNKNOWN' | 'REJECTED'

export type PaymentProvider = {
  send(input: { templateId: string; idempotencyKey: string; parameters: Record<string, string> }): Promise<PaymentProviderResult>
}

type PaymentSlot = 'OPEN' | 'CLAIMED' | 'SENT' | 'UNKNOWN'

export function createTuitionPaymentLedger() {
  const slots = new Map<string, PaymentSlot>()
  const chains = new Map<string, Promise<void>>()
  return {
    async claim(key: string): Promise<'CLAIMED' | 'NOT_CLAIMED' | 'ALREADY_ACCEPTED' | 'UNKNOWN_NOT_RETRIED'> {
      const previous = chains.get(key) ?? Promise.resolve()
      const current = previous.then((): 'CLAIMED' | 'NOT_CLAIMED' | 'ALREADY_ACCEPTED' | 'UNKNOWN_NOT_RETRIED' => {
        const slot = slots.get(key) ?? 'OPEN'
        if (slot === 'SENT') return 'ALREADY_ACCEPTED'
        if (slot === 'UNKNOWN') return 'UNKNOWN_NOT_RETRIED'
        if (slot === 'CLAIMED') return 'NOT_CLAIMED'
        slots.set(key, 'CLAIMED')
        return 'CLAIMED'
      })
      chains.set(key, current.then(() => undefined, () => undefined))
      return current
    },
    complete(key: string, outcome: 'SENT' | 'UNKNOWN') {
      slots.set(key, outcome)
    },
    release(key: string) {
      if (slots.get(key) === 'CLAIMED') slots.set(key, 'OPEN')
    },
  }
}

// Staff retry only. Enabling the template does not call this function.
export async function dispatchAuthorizedTuitionPayment(args: {
  template: TuitionPaymentTemplate
  input: TuitionPaymentRequestInput
  linkInvoiceCode: string
  attempt?: TuitionPaymentAttempt | null
  authorized: boolean
  provider: PaymentProvider
  ledger: ReturnType<typeof createTuitionPaymentLedger>
}) {
  const idle = { sent: false as const, paid: false as const, providerCalls: 0 }
  if (!args.authorized) return { ...idle, code: 'UNAUTHORIZED' as const }
  const prepared = prepareTuitionPaymentRequest({
    template: args.template,
    input: args.input,
    linkInvoiceCode: args.linkInvoiceCode,
    attempt: args.attempt,
  })
  if (prepared.code !== 'ELIGIBLE' || !prepared.parameters || !prepared.templateId) {
    return { ...idle, code: prepared.code, templateId: prepared.templateId }
  }
  const key = args.attempt?.key || args.input.invoiceCode
  const claim = await args.ledger.claim(key)
  if (claim !== 'CLAIMED') return { ...idle, code: claim, templateId: prepared.templateId }
  let outcome: PaymentProviderResult
  try {
    outcome = await args.provider.send({ templateId: prepared.templateId, idempotencyKey: key, parameters: prepared.parameters })
  } catch {
    args.ledger.complete(key, 'UNKNOWN')
    return { sent: false as const, paid: false as const, providerCalls: 1, code: 'ACCEPTANCE_UNKNOWN' as const, templateId: prepared.templateId }
  }
  if (outcome === 'ACCEPTED') {
    args.ledger.complete(key, 'SENT')
    return { sent: true as const, paid: false as const, providerCalls: 1, code: 'ACCEPTED' as const, templateId: prepared.templateId }
  }
  if (outcome === 'UNKNOWN') {
    args.ledger.complete(key, 'UNKNOWN')
    return { sent: false as const, paid: false as const, providerCalls: 1, code: 'ACCEPTANCE_UNKNOWN' as const, templateId: prepared.templateId }
  }
  args.ledger.release(key)
  return { ...idle, providerCalls: 1, code: 'REJECTED' as const, templateId: prepared.templateId }
}
