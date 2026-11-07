import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

type StravaSummaryActivity = {
  id: number
  name: string
  type?: string
  sport_type?: string
  start_date?: string
  start_date_local?: string
  elapsed_time?: number
  moving_time?: number
  distance?: number
  average_speed?: number
  average_heartrate?: number
  average_cadence?: number
  total_elevation_gain?: number
  workout_type?: number
}

type StravaLap = {
  id?: number
  lap_index?: number
  name?: string
  elapsed_time?: number
  distance?: number
  average_speed?: number
  average_heartrate?: number
}

type Row = Record<string, unknown>
type AdminClient = SupabaseClient

function tokenKey(): Buffer {
  const value = process.env.STRAVA_TOKEN_ENCRYPTION_KEY
  if (!value) throw new Error('Token-encryption key is not configured.')
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64')
  if (key.byteLength !== 32) throw new Error('Token-encryption key must contain 32 bytes.')
  return key
}

export function encryptStravaToken(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decryptStravaToken(value: string): string {
  const [ivHex, tagHex, ciphertextHex] = value.split(':')
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error('Encrypted token is invalid.')
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8')
}

export function stravaOAuthConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET && process.env.STRAVA_TOKEN_ENCRYPTION_KEY)
}

function stravaClientCredentials() {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Strava OAuth is not configured.')
  return { clientId, clientSecret }
}

export async function ensureStravaWebhookSubscription(callbackOrigin: string): Promise<void> {
  const { clientId, clientSecret } = stravaClientCredentials()
  const verifyToken = process.env.STRAVA_WEBHOOK_SECRET
  if (!verifyToken) throw new Error('Strava webhook verification is not configured.')

  const credentials = new URLSearchParams({ client_id: clientId, client_secret: clientSecret })
  const listResponse = await fetch('https://www.strava.com/api/v3/push_subscriptions?' + credentials.toString(), { cache: 'no-store' })
  if (!listResponse.ok) throw new Error('Existing Strava webhook subscriptions could not be checked.')
  const existing = await listResponse.json() as Array<{ id?: number; callback_url?: string }>
  const callback = new URL('/api/strava/webhook', callbackOrigin)
  callback.searchParams.set('token', verifyToken)
  const callbackUrl = callback.toString()

  if (Array.isArray(existing) && existing.some((item) => item.callback_url === callbackUrl)) return
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error('A Strava webhook subscription already uses a different callback URL.')
  }

  const createResponse = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
    cache: 'no-store',
  })
  if (!createResponse.ok) throw new Error('Strava webhook registration was not accepted.')
  const subscription = await createResponse.json() as { id?: number }
  if (!subscription.id) throw new Error('Strava did not confirm the webhook subscription.')
}

async function refreshAccessToken(admin: AdminClient, athleteId: string, connection: Row): Promise<string> {
  const expiry = new Date(String(connection.expires_at)).getTime()
  const accessToken = decryptStravaToken(String(connection.access_token_enc))
  if (expiry > Date.now() + 60 * 60 * 1000) return accessToken
  const refreshToken = decryptStravaToken(String(connection.refresh_token_enc))
  const { clientId, clientSecret } = stravaClientCredentials()
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Strava access could not be refreshed.')
  const token = await response.json() as { access_token: string; refresh_token: string; expires_at: number }
  const { error } = await admin.from('strava_connections').update({
    access_token_enc: encryptStravaToken(token.access_token),
    refresh_token_enc: encryptStravaToken(token.refresh_token),
    expires_at: new Date(token.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('athlete_id', athleteId)
  if (error) throw new Error('The refreshed Strava connection could not be saved.')
  return token.access_token
}

async function getConnection(admin: AdminClient, athleteId: string): Promise<{ connection: Row; token: string }> {
  const { data, error } = await admin.from('strava_connections').select('*').eq('athlete_id', athleteId).eq('is_active', true).maybeSingle()
  if (error || !data) throw new Error('No active Strava connection was found.')
  const connection = data as unknown as Row
  return { connection, token: await refreshAccessToken(admin, athleteId, connection) }
}

async function stravaGet<T>(path: string, accessToken: string, allowMissing = false): Promise<T | null> {
  const response = await fetch('https://www.strava.com/api/v3' + path, {
    headers: { Authorization: 'Bearer ' + accessToken },
    cache: 'no-store',
  })
  if (allowMissing && (response.status === 403 || response.status === 404)) return null
  if (!response.ok) throw new Error('Strava data could not be loaded.')
  return await response.json() as T
}

function isRun(activity: StravaSummaryActivity): boolean {
  const type = activity.sport_type || activity.type || ''
  return type === 'Run' || type === 'TrailRun' || type === 'VirtualRun'
}

function activityRow(athleteId: string, activity: StravaSummaryActivity) {
  const startedAt = activity.start_date ? new Date(activity.start_date).toISOString() : new Date().toISOString()
  return {
    athlete_id: athleteId,
    source: 'strava' as const,
    external_activity_id: String(activity.id),
    name: String(activity.name || 'Hardlooptraining').slice(0, 120),
    activity_type: String(activity.sport_type || activity.type || 'Run').slice(0, 50),
    started_at: startedAt,
    elapsed_seconds: activity.elapsed_time ?? null,
    moving_seconds: activity.moving_time ?? null,
    distance_meters: activity.distance ?? null,
    average_speed_mps: activity.average_speed ?? null,
    average_heart_rate: activity.average_heartrate ?? null,
    average_cadence: activity.average_cadence ?? null,
    total_elevation_meters: activity.total_elevation_gain ?? null,
    raw_summary: {
      start_date_local: activity.start_date_local ?? null,
      workout_type: activity.workout_type ?? null,
    },
  }
}

async function storeLaps(admin: AdminClient, activityId: string, laps: StravaLap[]) {
  if (!laps.length) return
  const rows = laps.map((lap, index) => ({
    activity_id: activityId,
    lap_order: Number(lap.lap_index) > 0 ? Number(lap.lap_index) : index + 1,
    label: String(lap.name || 'Lap ' + (index + 1)).slice(0, 50),
    elapsed_seconds: lap.elapsed_time ?? null,
    distance_meters: lap.distance ?? null,
    average_speed_mps: lap.average_speed ?? null,
    average_heart_rate: lap.average_heartrate ?? null,
    raw_data: { strava_lap_id: lap.id ?? null },
  }))
  await admin.from('activity_laps').upsert(rows, { onConflict: 'activity_id,lap_order' })
}

async function matchToPlannedWorkout(admin: AdminClient, athleteId: string, activityId: string, activity: StravaSummaryActivity) {
  const { data: existing } = await admin.from('activity_workout_links').select('id').eq('activity_id', activityId).limit(1)
  if (existing?.length) return
  const localDate = activity.start_date_local?.slice(0, 10) ?? activity.start_date?.slice(0, 10)
  if (!localDate) return
  const base = new Date(localDate + 'T12:00:00Z')
  const start = new Date(base)
  const end = new Date(base)
  start.setUTCDate(start.getUTCDate() - 1)
  end.setUTCDate(end.getUTCDate() + 1)
  const { data: candidates } = await admin.from('planned_workouts').select('id,workout_date').eq('athlete_id', athleteId).in('state', ['planned', 'adjusted']).gte('workout_date', start.toISOString().slice(0, 10)).lte('workout_date', end.toISOString().slice(0, 10)).limit(12)
  if (!candidates?.length) return
  const closest = candidates.map((item) => ({ item, gap: Math.abs(new Date(String(item.workout_date) + 'T12:00:00Z').getTime() - base.getTime()) })).sort((a, b) => a.gap - b.gap)[0]
  if (closest.gap > 86400000) return
  await admin.from('activity_workout_links').insert({ activity_id: activityId, planned_workout_id: String(closest.item.id), match_method: 'date_match', confidence: closest.gap === 0 ? 0.9 : 0.65 })
}

async function saveActivity(admin: AdminClient, athleteId: string, activity: StravaSummaryActivity, accessToken: string, allowLapImport: boolean) {
  if (!activity.id || !isRun(activity)) return
  const { data, error } = await admin.from('activities').upsert(activityRow(athleteId, activity), { onConflict: 'source,external_activity_id' }).select('id').single()
  if (error || !data) throw new Error('Imported activity could not be saved.')
  const activityId = String(data.id)
  if (allowLapImport) {
    const { data: existingLaps } = await admin.from('activity_laps').select('id').eq('activity_id', activityId).limit(1)
    if (!existingLaps?.length) {
      const laps = await stravaGet<StravaLap[]>('/activities/' + activity.id + '/laps', accessToken, true)
      if (Array.isArray(laps) && laps.length > 0) await storeLaps(admin, activityId, laps)
    }
  }
  await matchToPlannedWorkout(admin, athleteId, activityId, activity)
}

export async function syncStravaActivities(admin: AdminClient, athleteId: string): Promise<number> {
  const { connection, token } = await getConnection(admin, athleteId)
  const lastSyncedAt = typeof connection.last_synced_at === 'string' ? new Date(connection.last_synced_at).getTime() : null
  const afterSeconds = Math.floor(((lastSyncedAt ? lastSyncedAt - 2 * 86400000 : Date.now() - 30 * 86400000)) / 1000)
  let page = 1
  let detailBudget = 12
  let saved = 0
  while (page <= 5) {
    const items = await stravaGet<StravaSummaryActivity[]>('/athlete/activities?after=' + afterSeconds + '&page=' + page + '&per_page=100', token)
    if (!Array.isArray(items) || items.length === 0) break
    for (const activity of items) {
      if (!isRun(activity)) continue
      await saveActivity(admin, athleteId, activity, token, detailBudget > 0)
      if (detailBudget > 0) detailBudget -= 1
      saved += 1
    }
    if (items.length < 100) break
    page += 1
  }
  await admin.from('strava_connections').update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('athlete_id', athleteId)
  return saved
}

export type StravaWebhookPayload = {
  object_type: 'activity' | 'athlete'
  aspect_type: 'create' | 'update' | 'delete'
  object_id: number
  owner_id: number
  event_time?: number
  subscription_id?: number
  updates?: Record<string, string | boolean>
}

export async function processStravaWebhook(admin: AdminClient, payload: StravaWebhookPayload) {
  const { data: connectionData } = await admin.from('strava_connections').select('athlete_id,is_active').eq('strava_athlete_id', payload.owner_id).maybeSingle()
  if (!connectionData) return
  const athleteId = String(connectionData.athlete_id)
  if (payload.object_type === 'athlete' && payload.aspect_type === 'update' && payload.updates?.authorized === 'false') {
    await admin.from('strava_connections').update({ access_token_enc: '', refresh_token_enc: '', is_active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('athlete_id', athleteId)
    return
  }
  if (!connectionData.is_active || payload.object_type !== 'activity') return
  const externalId = String(payload.object_id)
  if (payload.aspect_type === 'delete') {
    await admin.from('activities').delete().eq('athlete_id', athleteId).eq('source', 'strava').eq('external_activity_id', externalId)
    return
  }
  const { token } = await getConnection(admin, athleteId)
  const activity = await stravaGet<StravaSummaryActivity>('/activities/' + encodeURIComponent(externalId), token, true)
  if (activity) await saveActivity(admin, athleteId, activity, token, true)
}
