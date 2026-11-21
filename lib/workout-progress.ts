import type { PlannedWorkout } from './training-plan'

export function workoutProgress(workouts: Pick<PlannedWorkout, 'optional' | 'status'>[]) {
  const required = workouts.filter((workout) => !workout.optional)
  return {
    required: required.length,
    completed: required.filter((workout) => workout.status === 'completed').length,
    optionalCompleted: workouts.filter((workout) => workout.optional && workout.status === 'completed').length,
  }
}
