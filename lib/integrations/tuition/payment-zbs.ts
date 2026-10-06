export const TUITION_PAYMENT_REQUEST = 'TUITION_PAYMENT_REQUEST'
export const TUITION_PAYMENT_CONFIRMATION = 'TUITION_PAYMENT_CONFIRMATION'
export const TUITION_PAYMENT_TEMPLATE_KEY = 'ZALO_TUITION_PAYMENT'
export const TUITION_CONFIRMATION_TEMPLATE_KEY = 'ZALO_TUITION_PAYMENT_CONFIRMATION'
export const TUITION_PAYMENT_REQUEST_STATUS = 'Chờ thanh toán'
export const FORBIDDEN_PAYMENT_TEMPLATE_IDS = ['643118', '640377'] as const
export const VERIFIED_TUITION_PAYMENT_TEMPLATE_ID = '645028'

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

export type TuitionPaymentAttempt = {
  key: string
  outcome: 'HELD' | 'UNKNOWN' | 'SENT'
  invoiceCode: string
  paymentLinkId: string
}

export function payosWebCheckoutUrl(paymentLinkId: string) {
  return `${PAYOS_WEB_PREFIX}${paymentLinkId}`
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

function configuredTemplateId(template: TuitionPaymentTemplate) {
  return template?.provider_template_id?.trim() ?? ''
}

export function tuitionPaymentTemplateConfigured(template: TuitionPaymentTemplate, purpose: string) {
  const templateId = configuredTemplateId(template)
  const parameters = schemaParameters(template)
  const approved = template?.status === 'ENABLE' || template?.status === 'APPROVED'
  return Boolean(
    template
    && template.template_key === TUITION_PAYMENT_TEMPLATE_KEY
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

export function missingPaymentFields(input: TuitionPaymentRequestInput) {
  const missing: string[] = []
  if (!input.customerName.trim()) missing.push('customer_name')
  if (!input.studentName.trim()) missing.push('student_name')
  if (!input.invoiceCode.trim()) missing.push('invoice_code')
  if (!input.packageName.trim()) missing.push('tuition_package')
  if (!rawAmount(input.packageAmount)) missing.push('package_amount')
  if (!input.paymentType.trim()) missing.push('payment_type')
  if (!rawAmount(input.amountDue)) missing.push('amount_due')
  if (!paymentDeadline(input.deadline)) missing.push('payment_deadline')
  const paymentLinkId = input.paymentLinkId.trim()
  if (!/^[A-Za-z0-9]{8,64}$/.test(paymentLinkId) || paymentLinkId.includes('http') || input.checkoutUrl !== payosWebCheckoutUrl(paymentLinkId)) {
    missing.push('payment_link_id')
  }
  return missing
}

export function buildTuitionPaymentRequest(input: TuitionPaymentRequestInput) {
  const missing = missingPaymentFields(input)
  if (missing.length > 0) return { ok: false as const, code: 'MISSING_REQUIRED' as const, missing }
  return {
    ok: true as const,
    purpose: TUITION_PAYMENT_REQUEST,
    body: {
      customer_name: input.customerName.trim(),
      payment_status: TUITION_PAYMENT_REQUEST_STATUS,
      student_name: input.studentName.trim(),
      invoice_code: input.invoiceCode.trim(),
      tuition_package: input.packageName.trim(),
      package_amount: rawAmount(input.packageAmount) as string,
      payment_type: input.paymentType.trim(),
      amount_due: rawAmount(input.amountDue) as string,
      payment_deadline: paymentDeadline(input.deadline) as string,
    },
    cta: { payment_link_id: input.paymentLinkId.trim() },
    checkoutUrl: payosWebCheckoutUrl(input.paymentLinkId.trim()),
  }
}

export function tuitionPaymentDispatch(template: TuitionPaymentTemplate, request: ReturnType<typeof buildTuitionPaymentRequest>) {
  const templateId = configuredTemplateId(template) || null
  if (!tuitionPaymentTemplateConfigured(template, TUITION_PAYMENT_REQUEST)) {
    return { state: 'BLOCKED' as const, code: 'ZBS_TEMPLATE_REQUIRED' as const, templateId, sent: false as const, paid: false as const }
  }
  if (!request.ok) return { state: 'BLOCKED' as const, code: request.code, templateId, sent: false as const, paid: false as const }
  if (!tuitionPaymentTemplateReady(template, TUITION_PAYMENT_REQUEST)) {
    return {
      state: 'HELD' as const,
      code: 'ZBS_SEND_DISABLED' as const,
      templateId,
      sent: false as const,
      paid: false as const,
      templateKey: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY,
    }
  }
  return {
    state: 'ELIGIBLE' as const,
    code: 'ELIGIBLE' as const,
    templateId,
    sent: false as const,
    paid: false as const,
    templateKey: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY,
  }
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
  if (!built.ok) return { ...idle, code: built.code, missing: built.missing }
  if (!tuitionPaymentTemplateConfigured(args.template, TUITION_PAYMENT_REQUEST)) return { ...idle, code: 'ZBS_TEMPLATE_REQUIRED' as const }
  const parameters = { ...built.body, payment_link_id: built.cta.payment_link_id }
  const ready = tuitionPaymentTemplateReady(args.template, TUITION_PAYMENT_REQUEST)
  // A hold is not a consumed send. While sending is off, a repeat adds no job.
  // Turning the template on makes the same hold eligible; it does not call the provider.
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

// Resumes a held request only when a staff retry is authorized and the template is enabled.
// Enabling the template does not call this function.
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
