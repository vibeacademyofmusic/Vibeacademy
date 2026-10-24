export type PilotFailureRecord = {
  failure: string
  environment: string
  timestamp: string
  correlationId: string
}

const SAFE_FAILURE = /[^A-Za-z0-9_:-]/g

export function pilotFailureRecord(input: {
  failure: string
  correlationId: string
}, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): PilotFailureRecord {
  const environment = env.VERCEL_ENV || env.NODE_ENV || 'local'
  return {
    failure: input.failure.replace(SAFE_FAILURE, '_').slice(0, 80),
    environment: environment.replace(SAFE_FAILURE, '_').slice(0, 32),
    timestamp: now.toISOString(),
    correlationId: input.correlationId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
  }
}

export function writePilotFailure(
  input: { failure: string; correlationId: string },
  env: NodeJS.ProcessEnv = process.env,
  sink: (line: string) => void = console.error,
  now?: Date,
) {
  const record = pilotFailureRecord(input, env, now)
  sink(JSON.stringify({ source: 'pilot-failure', ...record }))
  return record
}

export function correlationFromError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && error.digest.trim()) {
    return error.digest
  }
  return crypto.randomUUID()
}
