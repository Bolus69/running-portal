/** Canonical deployment origin for invitation and recovery links. No Strava dependency. */
export function appOrigin(requestUrl: string): string {
  const fallback = new URL(requestUrl).origin
  const configured = process.env.APP_ORIGIN
  if (!configured) return fallback
  try {
    const url = new URL(configured)
    return url.protocol === 'https:' ? url.origin : fallback
  } catch {
    return fallback
  }
}
