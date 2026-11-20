import { timingSafeEqual } from 'node:crypto'

function webhookSecret(): string {
  return process.env.STRAVA_WEBHOOK_SECRET ?? ''
}

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate)
  const expectedBuffer = Buffer.from(expected)
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const verifyToken = url.searchParams.get('hub.verify_token') ?? ''
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')
  if (!webhookSecret() || mode !== 'subscribe' || !matchesSecret(verifyToken, webhookSecret()) || !challenge || challenge.length > 200) {
    return Response.json({ error: 'Verification failed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json({ 'hub.challenge': challenge }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (!webhookSecret() || !matchesSecret(url.searchParams.get('token') ?? '', webhookSecret())) {
    return Response.json({ error: 'Not authorised' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  // Older Strava webhooks may still send events. Acknowledge them without
  // storing, importing, or fetching any activity data.
  return Response.json({ ok: true, ignored: true }, { headers: { 'Cache-Control': 'no-store' } })
}
