import { after } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getStravaId, processStravaWebhook, type StravaWebhookPayload } from '@/lib/strava'

export const maxDuration = 30

function webhookSecret(): string {
  return process.env.STRAVA_WEBHOOK_SECRET ?? ''
}

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate)
  const expectedBuffer = Buffer.from(expected)
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
}

async function readBodyWithinLimit(request: Request, maxBytes: number): Promise<string | null> {
  const contentLength = request.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return '\u0000'
  }
}

function skipWhitespace(text: string, start: number): number {
  let index = start
  while (index < text.length && /\s/.test(text[index])) index += 1
  return index
}

function readStringEnd(text: string, start: number): number | null {
  if (text[start] !== '"') return null
  let escaped = false
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) escaped = false
    else if (character === '\\') escaped = true
    else if (character === '"') return index + 1
  }
  return null
}

function readJsonValueEnd(text: string, start: number): number | null {
  if (text[start] === '"') return readStringEnd(text, start)
  if (text[start] === '{' || text[start] === '[') {
    const closers: string[] = [text[start] === '{' ? '}' : ']']
    let inString = false
    let escaped = false
    for (let index = start + 1; index < text.length; index += 1) {
      const character = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') inString = true
      else if (character === '{') closers.push('}')
      else if (character === '[') closers.push(']')
      else if (character === '}' || character === ']') {
        if (closers.pop() !== character) return null
        if (!closers.length) return index + 1
      }
    }
    return null
  }
  let index = start
  while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1
  return index > start ? index : null
}

function rawTopLevelStravaId(text: string, field: 'object_id' | 'owner_id'): string | null {
  let index = skipWhitespace(text, 0)
  if (text[index] !== '{') return null
  index += 1
  let found: string | null = null
  let seen = false

  while (index < text.length) {
    index = skipWhitespace(text, index)
    if (text[index] === '}') return found
    const keyEnd = readStringEnd(text, index)
    if (keyEnd === null) return null
    let key: unknown
    try { key = JSON.parse(text.slice(index, keyEnd)) } catch { return null }
    index = skipWhitespace(text, keyEnd)
    if (text[index] !== ':') return null
    index = skipWhitespace(text, index + 1)
    const valueEnd = readJsonValueEnd(text, index)
    if (valueEnd === null) return null

    if (key === field) {
      if (seen) return null
      seen = true
      const rawValue = text.slice(index, valueEnd)
      let candidate: unknown = rawValue
      if (rawValue.startsWith('"')) {
        try { candidate = JSON.parse(rawValue) } catch { return null }
      } else if (!/^\d+$/.test(rawValue)) {
        return null
      }
      if (typeof candidate !== 'string') return null
      found = getStravaId({ id_str: candidate })
      if (!found) return null
    }

    index = skipWhitespace(text, valueEnd)
    if (text[index] === ',') index += 1
    else if (text[index] === '}') return found
    else return null
  }
  return null
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
  const rawBody = await readBodyWithinLimit(request, 64 * 1024)
  if (rawBody === null) return Response.json({ error: 'Invalid event' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
  let parsedPayload: unknown
  try { parsedPayload = JSON.parse(rawBody) } catch { return Response.json({ error: 'Invalid event' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }) }
  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    return Response.json({ error: 'Invalid event' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const objectId = rawTopLevelStravaId(rawBody, 'object_id')
  const ownerId = rawTopLevelStravaId(rawBody, 'owner_id')
  if (!objectId || !ownerId) return Response.json({ error: 'Invalid event' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const payload = { ...(parsedPayload as Record<string, unknown>), object_id: objectId, owner_id: ownerId } as StravaWebhookPayload
  const validEventNumber = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (
    !payload ||
    !['activity', 'athlete'].includes(payload.object_type) ||
    !['create', 'update', 'delete'].includes(payload.aspect_type) ||
    !validEventNumber(payload.subscription_id) ||
    !validEventNumber(payload.event_time) ||
    Number(payload.event_time) > nowSeconds + 300 ||
    (payload.updates !== undefined && (!payload.updates || typeof payload.updates !== 'object' || Array.isArray(payload.updates)))
  ) return Response.json({ error: 'Invalid event' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const admin = createAdminSupabaseClient()
  const eventKey = [payload.subscription_id ?? 0, payload.event_time ?? 0, payload.object_id, payload.aspect_type].join(':')
  const { error } = await admin.from('strava_webhook_events').upsert({
    event_key: eventKey,
    strava_athlete_id: payload.owner_id,
    event_payload: payload,
    processing_state: 'queued',
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (error) return Response.json({ error: 'Event could not be queued' }, { status: 503 })

  after(async () => {
    const { data: event } = await admin.from('strava_webhook_events').select('id,processing_state').eq('event_key', eventKey).maybeSingle()
    if (!event || event.processing_state !== 'queued') return
    try {
      await processStravaWebhook(admin, payload)
      await admin.from('strava_webhook_events').update({ processing_state: 'processed', processed_at: new Date().toISOString(), error_summary: null }).eq('id', event.id)
    } catch {
      await admin.from('strava_webhook_events').update({ processing_state: 'failed', error_summary: 'Activity could not be synchronized.' }).eq('id', event.id)
    }
  })
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
