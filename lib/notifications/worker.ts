export type Job = { id: string; channel: 'EMAIL' | 'ZALO' | 'IN_APP'; delivery_mode: 'LIVE' | 'MOCK'; idempotency_key: string; lease_token: string; recipient_id: string; payload: { title: string; href: string } }
export type Receipt = { confirmed: true; receipt: string }
export interface Provider { send(job: Job): Promise<Receipt> }
export interface Queue {
  claim(id: string): Promise<Job | null>
  complete(id: string, lease: string, receipt: string | null, error: string | null): Promise<void>
}
// Test-only adapter: receipts are stable across retries. Never accepts live jobs.
export function mockProvider(fail = false): Provider {
  return { async send(job) {
    if (job.delivery_mode !== 'MOCK' || fail) throw new Error('PROVIDER_REJECTED')
    return { confirmed: true, receipt: `mock:${job.idempotency_key}` }
  } }
}
export async function dispatch(queue: Queue, id: string, providers: Partial<Record<Job['channel'], Provider>>) {
  const job = await queue.claim(id)
  if (!job) return 'NOT_CLAIMED'
  if (job.channel === 'ZALO') {
    await queue.complete(job.id, job.lease_token, null, 'PROVIDER_NOT_CONFIGURED')
    return 'FAILED'
  }
  const provider = providers[job.channel]
  if (!provider) { await queue.complete(job.id, job.lease_token, null, 'PROVIDER_NOT_CONFIGURED'); return 'FAILED' }
  let receipt: Receipt
  try {
    receipt = await provider.send(job)
    if (receipt?.confirmed !== true || !receipt.receipt?.trim()) throw new Error('PROVIDER_REJECTED')
  } catch {
    // Never persist raw provider errors, addresses, secrets, or response bodies.
    await queue.complete(job.id, job.lease_token, null, 'PROVIDER_REJECTED')
    return 'FAILED'
  }
  // A lost acknowledgement must be retried with the SAME provider idempotency key.
  // Do not turn a database acknowledgement failure into a second provider send.
  await queue.complete(job.id, job.lease_token, receipt.receipt, null)
  return 'SENT'
}
