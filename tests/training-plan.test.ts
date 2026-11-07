import { describe, expect, it } from 'vitest'
import { calculateTrainingPaces, formatPace, generatePlan, parseDurationToSeconds } from '@/lib/training-plan'

describe('marathon training plans', () => {
  it.each([12, 16, 20] as const)('creates a %i-week plan with the expected weekly structure', (length) => {
    const weeks = generatePlan({
      marathonDate: '2027-04-18',
      length,
      trainingDays: [2, 4, 0],
      includeOptionalFourth: true,
    })

    expect(weeks).toHaveLength(length)
    expect(weeks.every((week) => week.workouts.filter((workout) => !workout.optional).length === 3)).toBe(true)
    expect(weeks.every((week) => week.workouts.filter((workout) => workout.optional).length === 1)).toBe(true)
    expect(weeks[length - 1].workouts.some((workout) => workout.type === 'race' && workout.date === '2027-04-18')).toBe(true)
  })

  it('keeps planned recovery weeks and avoids treating the extra session as mandatory', () => {
    const weeks = generatePlan({ marathonDate: '2027-04-18', length: 16 })
    expect(weeks[3].isRecoveryWeek).toBe(true)
    expect(weeks[7].isRecoveryWeek).toBe(true)
    expect(weeks.flatMap((week) => week.workouts).filter((workout) => workout.optional).every((workout) => workout.status === 'planned')).toBe(true)
  })

  it('rejects an invalid set of fixed training days', () => {
    expect(() => generatePlan({ marathonDate: '2027-04-18', length: 16, trainingDays: [2, 2, 0] })).toThrow('Kies drie verschillende')
  })
})

describe('running pace helpers', () => {
  it('formats pace and parses common race time formats', () => {
    expect(formatPace(330)).toBe('5:30')
    expect(parseDurationToSeconds('41:10')).toBe(2470)
    expect(parseDurationToSeconds('1:45:30')).toBe(6330)
  })

  it('returns a useful set of training paces from a recent race', () => {
    const paces = calculateTrainingPaces(10, 50 * 60, 4 * 3600)
    expect(paces).not.toBeNull()
    expect(paces?.vdot).toBeGreaterThan(0)
    expect(paces?.easy[0]).toBeLessThan(paces?.easy[1] ?? 0)
    expect(paces?.marathon).toBeGreaterThan(0)
  })
})
