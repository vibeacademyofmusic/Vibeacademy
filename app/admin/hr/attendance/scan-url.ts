export function attendanceScanUrl(
  token: string,
  configuredBase?: string,
  browserOrigin?: string,
) {
  const base = (configuredBase || browserOrigin || '').replace(/\/$/, '')
  return `${base}/attendance/scan?t=${encodeURIComponent(token)}`
}
