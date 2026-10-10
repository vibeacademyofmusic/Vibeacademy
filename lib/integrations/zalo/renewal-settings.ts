export function renewalSettings(env: NodeJS.ProcessEnv = process.env) {
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback)
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback
  }
  return {
    // Upper bound is one day so a Vercel Hobby cron, which can run only once
    // per day, still falls inside the refresh window of a 25-hour OA token.
    intervalSeconds: number('ZALO_RENEWAL_CHECK_SECONDS', 600, 60, 86400),
    windowMs: number('ZALO_RENEWAL_WINDOW_SECONDS', 900, 300, 86400) * 1000,
    skewMs: number('ZALO_RENEWAL_CLOCK_SKEW_SECONDS', 60, 0, 300) * 1000,
  }
}
