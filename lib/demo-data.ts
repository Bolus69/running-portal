import { currentWeekNumber, generatePlan, phaseLabel } from '@/lib/training-plan'
import { todayDateISO } from '@/lib/dates'
import type { DashboardData, RunActivity } from '@/lib/types'

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dateString(date: Date): string {
  return todayDateISO(date)
}

function paceLabel(durationMinutes: number, distanceKm: number): string {
  const seconds = Math.round((durationMinutes * 60) / distanceKm)
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

export function createDemoData(now = new Date()): DashboardData {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const marathonDate = dateString(addDays(today, 112))
  const noorMarathonDate = dateString(addDays(today, 140))
  const weeks = generatePlan({
    marathonDate,
    length: 16,
    trainingDays: [2, 4, 0],
    includeOptionalFourth: true,
    optionalTrainingDay: 6,
    goalTimeSeconds: 4 * 3600,
  })
  const currentWeek = currentWeekNumber(weeks, today)
  const activeWeek = weeks.find((week) => week.weekNumber === currentWeek) ?? weeks[0]
  activeWeek.workouts.forEach((workout) => {
    if (workout.date < dateString(today) && !workout.optional) workout.status = 'completed'
  })
  const fourDaysAgo = addDays(today, -4)
  const nineDaysAgo = addDays(today, -9)
  const activities: RunActivity[] = [
    {
      id: 'demo-strava-1',
      name: 'Rustige duurloop met blokken',
      startedAt: dateString(fourDaysAgo) + 'T08:12:00',
      activityType: 'Run',
      durationMinutes: 52,
      distanceKm: 9.8,
      pace: '5:18',
      averageHeartRate: 143,
      source: 'strava',
      plannedWorkoutId: activeWeek.workouts[0]?.id,
      effort: 'as_expected',
      laps: [
        { id: 'lap-1', label: 'Blok 1', durationMinutes: 10, distanceKm: 1.9, pace: '5:16', averageHeartRate: 148 },
        { id: 'lap-2', label: 'Blok 2', durationMinutes: 10, distanceKm: 1.92, pace: '5:13', averageHeartRate: 151 },
        { id: 'lap-3', label: 'Blok 3', durationMinutes: 10, distanceKm: 1.87, pace: '5:21', averageHeartRate: 154 },
      ],
    },
    {
      id: 'demo-manual-1',
      name: 'Herstelduurloop',
      startedAt: dateString(nineDaysAgo) + 'T17:38:00',
      activityType: 'Run',
      durationMinutes: 38,
      distanceKm: 6.4,
      pace: paceLabel(38, 6.4),
      source: 'manual',
      effort: 'easier',
      note: 'Ontspannen gelopen na een drukke werkdag.',
    },
  ]

  const currentWeekLabel = phaseLabel(activeWeek.phase)
  const coachPlans = {
    demo: weeks,
    joris: generatePlan({ marathonDate, length: 16, trainingDays: [2, 4, 0], includeOptionalFourth: true, goalTimeSeconds: 3 * 3600 + 45 * 60 }),
    noor: generatePlan({ marathonDate: noorMarathonDate, length: 20, trainingDays: [2, 4, 0], includeOptionalFourth: true, optionalTrainingDay: 6, goalTimeSeconds: 4 * 3600 + 20 * 60 }),
  }
  return {
    profile: { id: 'demo-athlete', name: 'Demo-atleet', role: 'athlete' },
    stravaConnected: true,
    plan: {
      length: 16,
      marathonDate,
      goalTime: '04:00:00',
      currentWeek,
      weeks,
      trainingDays: [2, 4, 0],
      includeOptionalFourth: true,
      optionalTrainingDay: 6,
    },
    activities,
    wellness: [],
    athletes: [
      {
        id: 'athlete-1',
        name: 'Demo-atleet',
        marathonDate,
        goalTime: '04:00:00',
        planLength: 16,
        currentWeek,
        phase: currentWeekLabel,
        plannedThisWeek: 3,
        completedThisWeek: activeWeek.workouts.filter((item) => item.status === 'completed').length,
        lastActivity: 'Vandaag · 9,8 km',
        lastFeedback: 'Zoals verwacht',
        lastLongRun: 'Vorige zondag · 24 km',
        risk: 'green',
        planWeeks: coachPlans.demo,
      },
      {
        id: 'athlete-2',
        name: 'Joris van Dijk',
        marathonDate,
        goalTime: '03:45:00',
        planLength: 16,
        currentWeek: Math.max(1, currentWeek - 1),
        phase: 'Algemene ontwikkelfase',
        plannedThisWeek: 3,
        completedThisWeek: 2,
        lastActivity: 'Gisteren · 8,2 km',
        lastFeedback: 'Zwaarder dan verwacht',
        lastLongRun: 'Vorige zondag · 21 km',
        risk: 'orange',
        reason: 'Kwaliteitstraining voelde zwaarder dan gepland.',
        planWeeks: coachPlans.joris,
      },
      {
        id: 'athlete-3',
        name: 'Noor Bakker',
        marathonDate: noorMarathonDate,
        goalTime: '04:20:00',
        planLength: 20,
        currentWeek: Math.min(20, currentWeek + 2),
        phase: 'Basisfase',
        plannedThisWeek: 3,
        completedThisWeek: 1,
        lastActivity: '3 dagen geleden · 6,1 km',
        lastFeedback: 'Nog niet ingevuld',
        lastLongRun: '2 weken geleden · 18 km',
        risk: 'red',
        reason: 'Twee geplande trainingen staan nog open.',
        planWeeks: coachPlans.noor,
      },
    ],
    suggestions: [
      {
        id: 'suggestion-1',
        athleteId: 'athlete-2',
        athleteName: 'Joris van Dijk',
        title: 'Kwaliteitstraining iets inkorten',
        reason: 'De vorige drempeltraining voelde zwaarder dan verwacht.',
        replacement: '3 × 6 min drempel in plaats van 4 × 6 min',
        status: 'pending',
        createdAt: dateString(today),
      },
      {
        id: 'suggestion-2',
        athleteId: 'athlete-3',
        athleteName: 'Noor Bakker',
        title: 'Schema voortzetten zonder gemiste training in te halen',
        reason: 'Een sessie is overgeslagen. Extra kilometers toevoegen is niet nodig.',
        replacement: 'Volgende geplande training uitvoeren op praattempo',
        status: 'pending',
        createdAt: dateString(addDays(today, -1)),
      },
    ],
  }
}
