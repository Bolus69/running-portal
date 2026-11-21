import { expect, it } from 'vitest'
import { workoutProgress } from '@/lib/workout-progress'

it('keeps a fourth optional run separate from the three fixed runs', () => {
  expect(workoutProgress([
    { optional: false, status: 'completed' }, { optional: false, status: 'completed' },
    { optional: false, status: 'completed' }, { optional: true, status: 'completed' },
  ])).toEqual({ required: 3, completed: 3, optionalCompleted: 1 })
})
it('does not count skipped, planned or adjusted runs as completed', () => {
  expect(workoutProgress([
    { optional: false, status: 'skipped' }, { optional: false, status: 'adjusted' },
    { optional: false, status: 'planned' }, { optional: true, status: 'completed' },
  ])).toEqual({ required: 3, completed: 0, optionalCompleted: 1 })
  expect(workoutProgress([])).toEqual({ required: 0, completed: 0, optionalCompleted: 0 })
})
