export function renewalSettings(env: NodeJS.ProcessEnv = process.env) {
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback)
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback
  }
  return {
    intervalSeconds: number('ZALO_RENEWAL_CHECK_SECONDS', 600, 60, 3600),
    windowMs: number('ZALO_RENEWAL_WINDOW_SECONDS', 900, 300, 7200) * 1000,
    skewMs: number('ZALO_RENEWAL_CLOCK_SKEW_SECONDS', 60, 0, 300) * 1000,
  }
}
