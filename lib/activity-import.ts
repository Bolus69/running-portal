import { Decoder, Stream, type LapMesg, type RecordMesg } from '@garmin/fitsdk'

export type ImportedActivityLap = {
  label: string
  durationMinutes?: number
  movingDurationMinutes?: number
  distanceKm?: number
  averageHeartRate?: number
}

export type ImportedActivity = {
  startedAt: string
  durationMinutes: number
  movingDurationMinutes: number
  distanceKm?: number
  averageHeartRate?: number
  laps: ImportedActivityLap[]
}

function validNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function validDate(value: unknown): Date | undefined {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return undefined
  return value
}

function summarizeLap(lap: LapMesg, index: number): ImportedActivityLap | undefined {
  const durationSeconds = validNumber(lap.totalElapsedTime) ?? validNumber(lap.totalTimerTime)
  const movingSeconds = validNumber(lap.totalTimerTime) ?? durationSeconds
  const distanceMeters = validNumber(lap.totalDistance)
  const averageHeartRate = validNumber(lap.avgHeartRate)
  if (!durationSeconds && !distanceMeters && !averageHeartRate) return undefined
  return {
    label: 'Blok ' + (index + 1),
    durationMinutes: durationSeconds ? durationSeconds / 60 : undefined,
    movingDurationMinutes: movingSeconds ? movingSeconds / 60 : undefined,
    distanceKm: distanceMeters ? distanceMeters / 1000 : undefined,
    averageHeartRate,
  }
}

export function parseFitActivity(bytes: Uint8Array): ImportedActivity {
  if (bytes.byteLength < 16) throw new Error('Dit bestand is te klein om een training te bevatten.')

  const stream = Stream.fromByteArray(bytes)
  if (!Decoder.isFIT(stream)) throw new Error('Dit is geen geldig FIT-trainingsbestand.')

  const decoder = new Decoder(Stream.fromByteArray(bytes))
  if (!decoder.checkIntegrity()) throw new Error('Het trainingsbestand is beschadigd of onvolledig.')

  const { messages } = decoder.read()
  const sessions = messages.sessionMesgs ?? []
  const session = sessions.find((item) => item.sport === 'running') ?? sessions[0]
  if (session?.sport && session.sport !== 'running') {
    throw new Error('Dit bestand bevat geen hardloopactiviteit.')
  }

  const records = messages.recordMesgs ?? []
  const firstRecord = records.find((item) => validDate(item.timestamp))
  const lastRecord = [...records].reverse().find((item) => validDate(item.timestamp))
  const startedAt = validDate(session?.startTime)
    ?? validDate(firstRecord?.timestamp)
    ?? validDate(messages.activityMesgs?.[0]?.localTimestamp)
    ?? validDate(messages.activityMesgs?.[0]?.timestamp)
  const durationSeconds = validNumber(session?.totalElapsedTime)
    ?? validNumber(session?.totalTimerTime)
    ?? elapsedSeconds(firstRecord, lastRecord)
  const movingDurationSeconds = validNumber(session?.totalTimerTime)
    ?? validNumber(session?.totalElapsedTime)
    ?? elapsedSeconds(firstRecord, lastRecord)
  const distanceMeters = validNumber(session?.totalDistance)
    ?? latestRecordDistance(records)
  const averageHeartRate = validNumber(session?.avgHeartRate)
    ?? recordAverageHeartRate(records)

  if (!startedAt || !durationSeconds || !movingDurationSeconds) {
    throw new Error('De starttijd of duur ontbreekt in dit trainingsbestand.')
  }

  const laps = (messages.lapMesgs ?? [])
    .slice(0, 20)
    .map(summarizeLap)
    .filter((lap): lap is ImportedActivityLap => Boolean(lap))

  return {
    startedAt: startedAt.toISOString(),
    durationMinutes: durationSeconds / 60,
    movingDurationMinutes: movingDurationSeconds / 60,
    distanceKm: distanceMeters ? distanceMeters / 1000 : undefined,
    averageHeartRate,
    laps,
  }
}

function elapsedSeconds(first?: RecordMesg, last?: RecordMesg): number | undefined {
  const start = validDate(first?.timestamp)?.getTime()
  const end = validDate(last?.timestamp)?.getTime()
  if (start === undefined || end === undefined || end <= start) return undefined
  return (end - start) / 1000
}

function latestRecordDistance(records: RecordMesg[]): number | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const distance = validNumber(records[index].distance)
    if (distance) return distance
  }
  return undefined
}

function recordAverageHeartRate(records: RecordMesg[]): number | undefined {
  const values = records.map((item) => validNumber(item.heartRate)).filter((value): value is number => value !== undefined)
  if (!values.length) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
