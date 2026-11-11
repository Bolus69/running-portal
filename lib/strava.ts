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

export type StravaActivityCandidate = {
  id: string
  name: string
  startedAt: string
  distanceKm?: number
  durationMinutes: number
  averageHeartRate?: number
  alreadyLinkedToWorkout: boolean
  linkedElsewhere: boolean
  automaticMatchElsewhere: boolean
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

export type StravaWebhookIssue =
  | 'credentials_missing'
  | 'webhook_secret_missing'
  | 'preview_origin_missing'
  | 'callback_protected'
  | 'callback_url_too_long'
  | 'callback_probe_failed'
  | 'callback_redirected'
  | 'callback_response_invalid'
  | 'callback_too_slow'
  | 'strava_auth_rejected'
  | 'subscription_check_failed'
  | 'subscription_conflict'
  | 'callback_rejected'
  | 'registration_rejected'
  | 'registration_unconfirmed'
  | 'network_error'

export class StravaWebhookSetupError extends Error {
  constructor(public readonly code: StravaWebhookIssue, public readonly detail?: string) {
    super(code)
    this.name = 'StravaWebhookSetupError'
  }
}

async function safeStravaErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json() as { errors?: Array<{ field?: unknown; code?: unknown }> }
    const errors = Array.isArray(body.errors) ? body.errors : []
    const detail = errors.slice(0, 3).map((item) => {
      const field = typeof item.field === 'string' ? item.field.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) : ''
      const code = typeof item.code === 'string' ? item.code.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) : ''
      return [field, code].filter(Boolean).join(':')
    }).filter(Boolean)
    return detail.length ? detail.join(', ') : 'HTTP ' + response.status
  } catch {
    return 'HTTP ' + response.status
  }
}

export async function ensureStravaWebhookSubscription(callbackOrigin: string): Promise<void> {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new StravaWebhookSetupError('credentials_missing')
  const verifyToken = process.env.STRAVA_WEBHOOK_SECRET
  if (!verifyToken) throw new StravaWebhookSetupError('webhook_secret_missing')

  const isPreview = process.env.VERCEL_ENV === 'preview'
  if (isPreview && !process.env.STRAVA_WEBHOOK_CALLBACK_ORIGIN) throw new StravaWebhookSetupError('preview_origin_missing')
  const stableOrigin = isPreview ? String(process.env.STRAVA_WEBHOOK_CALLBACK_ORIGIN) : callbackOrigin
  let callback: URL
  try {
    callback = new URL('/api/strava/webhook', stableOrigin)
  } catch {
    throw new StravaWebhookSetupError('preview_origin_missing')
  }
  callback.searchParams.set('token', verifyToken)
  const callbackUrl = callback.toString()
  if (callbackUrl.length > 255) throw new StravaWebhookSetupError('callback_url_too_long', String(callbackUrl.length))

  const credentials = new URLSearchParams({ client_id: clientId, client_secret: clientSecret })
  let listResponse: Response
  try {
    listResponse = await fetch('https://www.strava.com/api/v3/push_subscriptions?' + credentials.toString(), { cache: 'no-store' })
  } catch {
    throw new StravaWebhookSetupError('network_error')
  }
  if (!listResponse.ok) {
    throw new StravaWebhookSetupError(listResponse.status === 401 || listResponse.status === 403 ? 'strava_auth_rejected' : 'subscription_check_failed', 'HTTP ' + listResponse.status)
  }
  let existing: Array<{ id?: number; callback_url?: string }>
  try {
    const body: unknown = await listResponse.json()
    if (!Array.isArray(body)) throw new Error('invalid response')
    existing = body as Array<{ id?: number; callback_url?: string }>
  } catch {
    throw new StravaWebhookSetupError('subscription_check_failed')
  }

  if (existing.some((item) => item.callback_url === callbackUrl)) return
  if (existing.length > 0) throw new StravaWebhookSetupError('subscription_conflict')

  if (isPreview) {
    const challenge = 'mc-' + randomBytes(12).toString('hex')
    const probeUrl = new URL(callbackUrl)
    probeUrl.searchParams.set('hub.mode', 'subscribe')
    probeUrl.searchParams.set('hub.verify_token', verifyToken)
    probeUrl.searchParams.set('hub.challenge', challenge)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)
    const startedAt = Date.now()
    let probeResponse: Response
    try {
      probeResponse = await fetch(probeUrl, { cache: 'no-store', signal: controller.signal, redirect: 'manual' })
    } catch {
      throw new StravaWebhookSetupError('callback_probe_failed', 'timeout')
    } finally {
      clearTimeout(timeout)
    }
    if (probeResponse.status >= 300 && probeResponse.status < 400) {
      throw new StravaWebhookSetupError('callback_redirected', 'HTTP ' + probeResponse.status)
    }
    if (probeResponse.status === 401 || probeResponse.status === 403) {
      throw new StravaWebhookSetupError('callback_protected', 'HTTP ' + probeResponse.status)
    }
    if (!probeResponse.ok) throw new StravaWebhookSetupError('callback_probe_failed', 'HTTP ' + probeResponse.status)
    let probeBody: { 'hub.challenge'?: unknown }
    try {
      probeBody = await probeResponse.json() as { 'hub.challenge'?: unknown }
    } catch {
      throw new StravaWebhookSetupError('callback_response_invalid')
    }
    if (probeBody['hub.challenge'] !== challenge) throw new StravaWebhookSetupError('callback_response_invalid')
    if (Date.now() - startedAt > 2000) throw new StravaWebhookSetupError('callback_too_slow', String(Date.now() - startedAt) + 'ms')
  }

  let createResponse: Response
  try {
    createResponse = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
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
  } catch {
    throw new StravaWebhookSetupError('network_error')
  }
  if (!createResponse.ok) {
    const detail = await safeStravaErrorDetail(createResponse)
    if (createResponse.status === 401 || createResponse.status === 403) throw new StravaWebhookSetupError('strava_auth_rejected', detail)
    if (createResponse.status === 400) throw new StravaWebhookSetupError('callback_rejected', detail)
    if (createResponse.status === 409) throw new StravaWebhookSetupError('subscription_conflict', detail)
    throw new StravaWebhookSetupError('registration_rejected', detail)
  }
  let subscription: { id?: number }
  try {
    subscription = await createResponse.json() as { id?: number }
  } catch {
    throw new StravaWebhookSetupError('registration_unconfirmed')
  }
  if (!subscription.id) throw new StravaWebhookSetupError('registration_unconfirmed')
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

function dateOffset(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function isDateAroundWorkout(activity: StravaSummaryActivity, workoutDate: string): boolean {
  const activityDate = activity.start_date_local?.slice(0, 10) ?? activity.start_date?.slice(0, 10)
  return Boolean(activityDate && activityDate >= dateOffset(workoutDate, -1) && activityDate <= dateOffset(workoutDate, 1))
}

async function activitiesAroundWorkout(admin: AdminClient, athleteId: string, workoutDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workoutDate) || Number.isNaN(new Date(workoutDate + 'T00:00:00.000Z').getTime())) {
    throw new Error('De datum van de training is ongeldig.')
  }
  const { token } = await getConnection(admin, athleteId)
  const after = Math.floor(new Date(dateOffset(workoutDate, -1) + 'T00:00:00.000Z').getTime() / 1000)
  const before = Math.floor(new Date(dateOffset(workoutDate, 2) + 'T00:00:00.000Z').getTime() / 1000)
  const activities = await stravaGet<StravaSummaryActivity[]>(`/athlete/activities?after=${after}&before=${before}&page=1&per_page=100`, token)
  return { token, activities: (Array.isArray(activities) ? activities : []).filter((activity) => isRun(activity) && isDateAroundWorkout(activity, workoutDate)) }
}

export async function getStravaActivityCandidates(admin: AdminClient, athleteId: string, plannedWorkoutId: string, workoutDate: string): Promise<StravaActivityCandidate[]> {
  const { activities } = await activitiesAroundWorkout(admin, athleteId, workoutDate)
  if (!activities.length) return []

  const externalIds = activities.map((activity) => String(activity.id))
  const { data: savedActivities, error: activityError } = await admin.from('activities')
    .select('id,external_activity_id')
    .eq('athlete_id', athleteId)
    .eq('source', 'strava')
    .in('external_activity_id', externalIds)
  if (activityError) throw new Error('De Strava-activiteiten konden niet worden gecontroleerd.')

  const savedRows = (savedActivities ?? []) as Array<{ id: string; external_activity_id: string }>
  const savedIds = savedRows.map((row) => String(row.id))
  const { data: links, error: linkError } = savedIds.length
    ? await admin.from('activity_workout_links').select('activity_id,planned_workout_id,match_method').in('activity_id', savedIds)
    : { data: [], error: null }
  if (linkError) throw new Error('De bestaande trainingskoppelingen konden niet worden gecontroleerd.')

  const activityIdByExternal = new Map(savedRows.map((row) => [String(row.external_activity_id), String(row.id)]))
  const linkMap = new Map<string, Array<{ workoutId: string; method: string }>>()
  for (const link of (links ?? []) as Array<{ activity_id: string; planned_workout_id: string; match_method: string }>) {
    linkMap.set(String(link.activity_id), [...(linkMap.get(String(link.activity_id)) ?? []), { workoutId: String(link.planned_workout_id), method: String(link.match_method) }])
  }

  return activities.map((activity) => {
    const activityLinks = linkMap.get(activityIdByExternal.get(String(activity.id)) ?? '') ?? []
    const linkedWorkoutIds = activityLinks.map((link) => link.workoutId)
    const startedAt = activity.start_date_local ?? activity.start_date ?? new Date().toISOString()
    return {
      id: String(activity.id),
      name: String(activity.name || 'Hardlooptraining').slice(0, 120),
      startedAt,
      distanceKm: typeof activity.distance === 'number' ? Math.round(activity.distance / 10) / 100 : undefined,
      durationMinutes: Math.round((activity.moving_time ?? activity.elapsed_time ?? 0) / 60),
      averageHeartRate: activity.average_heartrate,
      alreadyLinkedToWorkout: linkedWorkoutIds.includes(plannedWorkoutId),
      linkedElsewhere: activityLinks.some((link) => link.workoutId !== plannedWorkoutId && link.method !== 'date_match'),
      automaticMatchElsewhere: activityLinks.some((link) => link.workoutId !== plannedWorkoutId && link.method === 'date_match'),
    }
  }).sort((a, b) => {
    const aLinked = a.alreadyLinkedToWorkout ? 1 : 0
    const bLinked = b.alreadyLinkedToWorkout ? 1 : 0
    return bLinked - aLinked || b.startedAt.localeCompare(a.startedAt)
  })
}

async function linkActivityToWorkout(admin: AdminClient, athleteId: string, activityId: string, plannedWorkoutId: string) {
  const { data: existingActivityLinks, error: activityLinkError } = await admin.from('activity_workout_links')
    .select('id,planned_workout_id,match_method')
    .eq('activity_id', activityId)
  if (activityLinkError) throw new Error('De bestaande activiteitskoppeling kon niet worden gecontroleerd.')
  const activityLinks = (existingActivityLinks ?? []) as Array<{ id: string; planned_workout_id: string; match_method: string }>
  if (activityLinks.some((link) => link.planned_workout_id === plannedWorkoutId)) {
    await admin.from('workout_feedback').update({ activity_id: activityId, updated_at: new Date().toISOString() })
      .eq('planned_workout_id', plannedWorkoutId).eq('athlete_id', athleteId)
    return
  }
  if (activityLinks.some((link) => link.match_method !== 'date_match')) throw new Error('Deze Strava-activiteit is al aan een andere training gekoppeld.')

  const { data: targetLinks, error: targetLinkError } = await admin.from('activity_workout_links')
    .select('id,activity_id,match_method')
    .eq('planned_workout_id', plannedWorkoutId)
  if (targetLinkError) throw new Error('De bestaande trainingskoppeling kon niet worden gecontroleerd.')
  const conflictingTargetLinks = (targetLinks ?? []) as Array<{ id: string; activity_id: string; match_method: string }>
  if (conflictingTargetLinks.some((link) => link.match_method !== 'date_match')) throw new Error('Er is al een andere activiteit aan deze training gekoppeld.')

  if (activityLinks.length) {
    const { error } = await admin.from('activity_workout_links').delete().eq('activity_id', activityId).eq('match_method', 'date_match')
    if (error) throw new Error('De bestaande automatische Strava-koppeling kon niet worden aangepast.')
  }
  if (conflictingTargetLinks.length) {
    const { error } = await admin.from('activity_workout_links').delete().eq('planned_workout_id', plannedWorkoutId).eq('match_method', 'date_match')
    if (error) throw new Error('De bestaande automatische trainingskoppeling kon niet worden aangepast.')
  }

  const { error: insertError } = await admin.from('activity_workout_links').insert({
    activity_id: activityId,
    planned_workout_id: plannedWorkoutId,
    match_method: 'manual',
    confidence: 1,
  })
  if (insertError) throw new Error('De Strava-activiteit kon niet aan deze training worden gekoppeld.')
  const { error: feedbackError } = await admin.from('workout_feedback').update({ activity_id: activityId, updated_at: new Date().toISOString() })
    .eq('planned_workout_id', plannedWorkoutId).eq('athlete_id', athleteId)
  if (feedbackError) throw new Error('De activiteit is gekoppeld, maar de feedbackkoppeling kon niet worden bijgewerkt.')
}

async function saveActivity(admin: AdminClient, athleteId: string, activity: StravaSummaryActivity, accessToken: string, allowLapImport: boolean, plannedWorkoutId?: string) {
  if (!activity.id || !isRun(activity)) return null
  const { data: existingActivity, error: existingError } = await admin.from('activities').select('id,athlete_id')
    .eq('source', 'strava').eq('external_activity_id', String(activity.id)).maybeSingle()
  if (existingError) throw new Error('The existing Strava activity could not be checked.')
  if (existingActivity && String(existingActivity.athlete_id) !== athleteId) throw new Error('This Strava activity belongs to another account.')
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
  if (plannedWorkoutId) await linkActivityToWorkout(admin, athleteId, activityId, plannedWorkoutId)
  else await matchToPlannedWorkout(admin, athleteId, activityId, activity)
  return activityId
}

export async function attachStravaActivityToWorkout(admin: AdminClient, athleteId: string, plannedWorkoutId: string, workoutDate: string, externalActivityId: string): Promise<void> {
  if (!/^\d{1,20}$/.test(externalActivityId)) throw new Error('De gekozen Strava-activiteit is ongeldig.')
  const { token, activities } = await activitiesAroundWorkout(admin, athleteId, workoutDate)
  const candidate = activities.find((activity) => String(activity.id) === externalActivityId)
  if (!candidate || !isDateAroundWorkout(candidate, workoutDate)) throw new Error('De gekozen activiteit is niet meer beschikbaar rond de datum van deze training.')
  const detail = await stravaGet<StravaSummaryActivity>('/activities/' + encodeURIComponent(externalActivityId), token)
  if (!detail || !isRun(detail) || !isDateAroundWorkout(detail, workoutDate)) throw new Error('De gekozen Strava-activiteit past niet bij deze training.')
  const saved = await saveActivity(admin, athleteId, detail, token, true, plannedWorkoutId)
  if (!saved) throw new Error('De gekozen Strava-activiteit kon niet worden opgeslagen.')
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
