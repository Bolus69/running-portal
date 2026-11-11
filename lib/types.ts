import type { PlanLength, PlanWeek, PlannedWorkout, WorkoutStatus } from '@/lib/training-plan'

export type AppRole = 'athlete' | 'coach'

export type ActivityLap = {
  id: string
  label: string
  durationMinutes?: number
  distanceKm?: number
  pace?: string
  averageHeartRate?: number
}

export type RunActivity = {
  id: string
  name: string
  startedAt: string
  activityType: string
  durationMinutes: number
  distanceKm?: number
  pace?: string
  averageHeartRate?: number
  source: 'strava' | 'manual' | 'upload'
  plannedWorkoutId?: string
  note?: string
  effort?: 'easier' | 'as_expected' | 'harder' | 'not_good'
  laps?: ActivityLap[]
}

export type CoachNote = { id: string; note: string; createdAt: string }

export type AthleteSummary = {
  id: string
  name: string
  marathonDate: string
  goalTime: string
  planLength: PlanLength
  currentWeek: number
  phase: string
  plannedThisWeek: number
  completedThisWeek: number
  lastActivity?: string
  lastFeedback?: string
  lastLongRun?: string
  risk: 'green' | 'orange' | 'red'
  recentWeeklyKm?: number
  recentLongestRunKm?: number
  reason?: string
  activities?: RunActivity[]
  wellness?: WellnessEntry[]
  coachNotes?: CoachNote[]
  planWeeks?: PlanWeek[]
}

export type CoachSuggestion = {
  id: string
  athleteId: string
  athleteName: string
  title: string
  reason: string
  replacement?: string
  status: 'pending' | 'accepted' | 'modified' | 'rejected'
  createdAt: string
}

export type WellnessEntry = {
  id: string
  date: string
  sleepHours?: number
  restingHeartRate?: number
  recoveryScore?: number
  note?: string
  visibleToCoach: boolean
}

export type DashboardData = {
  profile: { id: string; name: string; role: AppRole }
  stravaConnected?: boolean
  plan: {
    length: PlanLength
    marathonDate: string
    goalTime: string
    currentWeek: number
    weeks: PlanWeek[]
    trainingDays: number[]
    includeOptionalFourth: boolean
    optionalTrainingDay: number
    recentWeeklyKm?: number
    recentLongestRunKm?: number
  } | null
  activities: RunActivity[]
  wellness: WellnessEntry[]
  athletes: AthleteSummary[]
  suggestions: CoachSuggestion[]
}

export type ApiPlanInput = {
  athleteId?: string
  marathonDate: string
  planLength: PlanLength
  goalTime: string
  trainingDays: number[]
  includeOptionalFourth: boolean
  optionalTrainingDay?: number
  recentRaceDistanceKm?: number
  recentRaceTimeSeconds?: number
  recentWeeklyKm?: number
  recentLongestRunKm?: number
}

export type WorkoutUpdate = { id: string; status: WorkoutStatus }

export function asPlannedWorkout(value: Record<string, unknown>): PlannedWorkout {
  return value as unknown as PlannedWorkout
}
