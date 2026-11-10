import { describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { parseFitActivity } from '@/lib/activity-import'

function fitRun(sport = 'running') {
  const encoder = new Encoder()
  const start = new Date('2026-11-10T08:00:00.000Z')
  const fileId = {
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'development',
    product: 1,
    timeCreated: start,
  }
  const session = {
    mesgNum: Profile.MesgNum.SESSION,
    event: 'session',
    eventType: 'stop',
    sport,
    startTime: start,
    timestamp: new Date(start.getTime() + 3_590_000),
    totalElapsedTime: 3_600,
    totalTimerTime: 3_590,
    totalDistance: 10_000,
    avgHeartRate: 150,
  }
  const lap = {
    mesgNum: Profile.MesgNum.LAP,
    event: 'lap',
    eventType: 'stop',
    startTime: start,
    timestamp: new Date(start.getTime() + 1_790_000),
    totalElapsedTime: 1_800,
    totalTimerTime: 1_790,
    totalDistance: 5_000,
    avgHeartRate: 145,
  }
  encoder.writeMesg(fileId)
  encoder.writeMesg(session)
  encoder.writeMesg(lap)
  return encoder.close()
}

describe('FIT activity import', () => {
  it('reads the run summary and lap data without exposing route points', () => {
    const result = parseFitActivity(fitRun())

    expect(result).toMatchObject({
      startedAt: '2026-11-10T08:00:00.000Z',
      durationMinutes: 60,
      movingDurationMinutes: 3_590 / 60,
      distanceKm: 10,
      averageHeartRate: 150,
    })
    expect(result.laps).toEqual([{ label: 'Blok 1', durationMinutes: 30, movingDurationMinutes: 1_790 / 60, distanceKm: 5, averageHeartRate: 145 }])
    expect(result).not.toHaveProperty('route')
    expect(result).not.toHaveProperty('coordinates')
  })

  it('rejects a non-running activity', () => {
    expect(() => parseFitActivity(fitRun('cycling'))).toThrow('geen hardloopactiviteit')
  })

  it('rejects invalid and damaged FIT data', () => {
    expect(() => parseFitActivity(new Uint8Array([1, 2, 3]))).toThrow('te klein')

    const damaged = fitRun()
    damaged[damaged.length - 1] ^= 0xff
    expect(() => parseFitActivity(damaged)).toThrow('beschadigd of onvolledig')
  })
})
