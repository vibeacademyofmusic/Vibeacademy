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

export function tuitionPaymentTemplateReady(template: TuitionPaymentTemplate, purpose: string) {
  const templateId = template?.provider_template_id?.trim() ?? ''
  const parameters = schemaParameters(template)
  const approved = template?.status === 'ENABLE' || (template?.status === 'APPROVED' && template.enabled === true)
  return Boolean(
    template
    && template.template_key
    && approved
    && template.enabled === true
    && templateId
    && !FORBIDDEN_PAYMENT_TEMPLATE_IDS.includes(templateId as typeof FORBIDDEN_PAYMENT_TEMPLATE_IDS[number])
    && tuitionTemplatePurpose(template) === purpose
    && TUITION_PAYMENT_BODY_PARAMETERS.every(key => parameters.includes(key))
    && parameters.includes(TUITION_PAYMENT_CTA_PARAMETER)
  )
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

export function tuitionPaymentDispatch(template: TuitionPaymentTemplate, request: ReturnType<typeof buildTuitionPaymentRequest>) {
  if (!tuitionPaymentTemplateReady(template, TUITION_PAYMENT_REQUEST)) return { state: 'BLOCKED' as const, code: 'ZBS_TEMPLATE_REQUIRED' }
  if (!request.ok) return { state: 'BLOCKED' as const, code: request.code }
  return { state: 'HELD' as const, code: 'ZBS_SEND_DISABLED', templateKey: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY }
}
