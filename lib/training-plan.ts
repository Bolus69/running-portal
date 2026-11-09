import { todayDateISO } from '@/lib/dates'

export type PlanLength = 12 | 16 | 20
export type Phase = 'basis' | 'ontwikkeling' | 'marathonspecifiek' | 'taper'
export type WorkoutStatus = 'planned' | 'completed' | 'adjusted' | 'skipped'
export type All4RunningZone = 1 | 2 | 3 | 4 | 5 | '4-5'
export type TrainingType = 'easy' | 'quality' | 'long' | 'optional' | 'race'
export type WorkoutFeedback = {
  effort?: 'easier' | 'as_expected' | 'harder' | 'not_good'
  note?: string
  completedAt?: string
}

export type WorkoutStep = {
  kind: 'warmup' | 'easy' | 'work' | 'recovery' | 'cooldown' | 'strides'
  label: string
  durationMinutes?: number
  durationSeconds?: number
  repeats?: number
  intensity?: 'E' | 'M' | 'T' | 'I' | 'R'
  all4runningZone?: All4RunningZone
}

export type PlannedWorkout = {
  id: string
  date: string
  day: string
  title: string
  type: TrainingType
  durationMinutes?: number
  distanceKm?: number
  timeCapMinutes?: number
  intensity: string
  goal: string
  description: string
  steps: WorkoutStep[]
  status: WorkoutStatus
  optional: boolean
  feedback?: WorkoutFeedback
}

export type PlanWeek = {
  weekNumber: number
  phase: Phase
  goal: string
  isRecoveryWeek: boolean
  workouts: PlannedWorkout[]
}

export type PlanInput = {
  marathonDate: string
  length: PlanLength
  trainingDays?: number[]
  includeOptionalFourth?: boolean
  optionalTrainingDay?: number
  goalTimeSeconds?: number
  startingWeeklyKm?: number
}

const LONG_RUNS: Record<PlanLength, number[]> = {
  12: [18, 20, 22, 16, 24, 26, 28, 18, 30, 32, 16, 42.2],
  16: [14, 16, 18, 14, 20, 22, 24, 18, 24, 26, 28, 22, 30, 22, 14, 42.2],
  20: [12, 14, 16, 12, 18, 20, 22, 16, 24, 26, 28, 20, 26, 30, 32, 24, 28, 22, 14, 42.2],
}

const RECOVERY_WEEKS: Record<PlanLength, number[]> = {
  12: [4, 8],
  16: [4, 8, 12],
  20: [4, 8, 12, 16],
}

const PHASES: Record<PlanLength, { phase: Phase; first: number; last: number }[]> = {
  12: [
    { phase: 'basis', first: 1, last: 4 },
    { phase: 'ontwikkeling', first: 5, last: 7 },
    { phase: 'marathonspecifiek', first: 8, last: 10 },
    { phase: 'taper', first: 11, last: 12 },
  ],
  16: [
    { phase: 'basis', first: 1, last: 5 },
    { phase: 'ontwikkeling', first: 6, last: 9 },
    { phase: 'marathonspecifiek', first: 10, last: 13 },
    { phase: 'taper', first: 14, last: 16 },
  ],
  20: [
    { phase: 'basis', first: 1, last: 6 },
    { phase: 'ontwikkeling', first: 7, last: 11 },
    { phase: 'marathonspecifiek', first: 12, last: 17 },
    { phase: 'taper', first: 18, last: 20 },
  ],
}

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const PHASE_LABELS: Record<Phase, string> = {
  basis: 'Basisfase',
  ontwikkeling: 'Algemene ontwikkelfase',
  marathonspecifiek: 'Marathonspecifieke fase',
  taper: 'Taperfase',
}

function utcDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Vul een geldige marathondatum in.')
  const value = new Date(date + 'T12:00:00.000Z')
  if (Number.isNaN(value.getTime()) || dateOnly(value) !== date) throw new Error('Vul een geldige marathondatum in.')
  return value
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function mondayOf(value: Date): Date {
  const result = new Date(value)
  const weekday = result.getUTCDay()
  result.setUTCDate(result.getUTCDate() - (weekday === 0 ? 6 : weekday - 1))
  return result
}

function dateInWeek(weekStart: Date, weekday: number): Date {
  const result = new Date(weekStart)
  result.setUTCDate(result.getUTCDate() + (weekday === 0 ? 6 : weekday - 1))
  return result
}

export function getPlanStartDate(input: Pick<PlanInput, 'marathonDate' | 'length' | 'trainingDays' | 'includeOptionalFourth' | 'optionalTrainingDay'>): string {
  const days = [...(input.trainingDays ?? [2, 4, 0])]
  if (days.length !== 3 || new Set(days).size !== 3 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Kies drie verschillende vaste trainingsdagen.')
  }
  const optionalTrainingDay = input.optionalTrainingDay ?? 6
  if (input.includeOptionalFourth && (!Number.isInteger(optionalTrainingDay) || optionalTrainingDay < 0 || optionalTrainingDay > 6 || days.includes(optionalTrainingDay))) {
    throw new Error('Kies voor de optionele training een dag die niet al bij je vaste dagen staat.')
  }
  const raceWeekMonday = mondayOf(utcDate(input.marathonDate))
  raceWeekMonday.setUTCDate(raceWeekMonday.getUTCDate() - (input.length - 1) * 7)
  const firstWeekDays = [...days, ...(input.includeOptionalFourth ? [optionalTrainingDay] : [])]
  const earliestDay = firstWeekDays.sort((a, b) => (a === 0 ? 6 : a - 1) - (b === 0 ? 6 : b - 1))[0]
  return dateOnly(dateInWeek(raceWeekMonday, earliestDay))
}

function phaseFor(length: PlanLength, week: number): Phase {
  const match = PHASES[length].find((item) => week >= item.first && week <= item.last)
  return match?.phase ?? 'basis'
}

function phaseGoal(phase: Phase, recovery: boolean): string {
  if (recovery) return 'Herstel en ritme: minder volume, ontspannen lopen.'
  if (phase === 'basis') return 'Rustige kilometers en een vaste trainingsroutine.'
  if (phase === 'ontwikkeling') return 'Gecontroleerde drempelprikkel en rustige duur.'
  if (phase === 'marathonspecifiek') return 'Marathoninspanning oefenen en lange duur opbouwen.'
  return 'Vermoeidheid laten zakken en fris aan de start komen.'
}

function qualitySession(week: number, phase: Phase, recovery: boolean): PlannedWorkout {
  if (recovery || phase === 'taper') {
    const taper = phase === 'taper'
    return {
      id: 'quality-' + week,
      date: '',
      day: '',
      title: taper ? 'Korte activatie' : 'Lichte fartlek',
      type: 'quality',
      durationMinutes: taper ? 32 : 38,
      intensity: 'Z2 · licht en ontspannen',
      goal: 'Een kleine prikkel die past bij herstel en het verdere trainingsplan.',
      description: 'Houd de vlotte stukken comfortabel. Herstel volledig rustig; maak er geen test van.',
      steps: [
        { kind: 'warmup', label: 'Rustig inlopen (Z1)', durationMinutes: 10, intensity: 'E', all4runningZone: 1 },
        { kind: 'work', label: 'Licht vlot', durationMinutes: taper ? 2 : 1, repeats: taper ? 3 : 5, all4runningZone: 2 },
        { kind: 'recovery', label: 'Rustig herstel (Z1)', durationMinutes: taper ? 2 : 1, repeats: taper ? 2 : 4, intensity: 'E', all4runningZone: 1 },
        { kind: 'cooldown', label: 'Uitlopen (Z1)', durationMinutes: 10, intensity: 'E', all4runningZone: 1 },
      ],
      status: 'planned',
      optional: false,
    }
  }

  if (phase === 'basis') {
    const repeats = week < 3 ? 6 : 8
    return {
      id: 'quality-' + week,
      date: '',
      day: '',
      title: 'Fartlek · ' + repeats + ' × 1 min (Z3)',
      type: 'quality',
      durationMinutes: 45,
      intensity: 'Z3 · vlot maar beheerst (I)',
      goal: 'Licht voetenwerk en een ontspannen pasritme oefenen.',
      description: 'Loop de vlotte minuten gelijkmatig, niet als sprint. Neem na ieder blok 1 minuut rustig herstel in Z1.',
      steps: [
        { kind: 'warmup', label: 'Rustig inlopen (Z1)', durationMinutes: 12, intensity: 'E', all4runningZone: 1 },
        { kind: 'work', label: 'Vlot lopen', durationMinutes: 1, repeats, intensity: 'I', all4runningZone: 3 },
        { kind: 'recovery', label: 'Rustig herstel', durationMinutes: 1, repeats, intensity: 'E', all4runningZone: 1 },
        { kind: 'cooldown', label: 'Uitlopen (Z1)', durationMinutes: 12, intensity: 'E', all4runningZone: 1 },
      ],
      status: 'planned',
      optional: false,
    }
  }

  if (phase === 'ontwikkeling' || phase === 'marathonspecifiek') {
    const blocks = week % 2 === 0 ? 4 : 3
    const minutes = phase === 'marathonspecifiek' ? 8 : week % 2 === 0 ? 6 : 8
    return {
      id: 'quality-' + week,
      date: '',
      day: '',
      title: (phase === 'marathonspecifiek' ? 'Drempelblokken' : 'Drempelblokken') + ' · ' + blocks + ' × ' + minutes + ' min (Z3)',
      type: 'quality',
      durationMinutes: phase === 'marathonspecifiek' ? 55 : 52,
      intensity: 'Z3 · gecontroleerde drempel (T)',
      goal: 'Een gelijkmatige, herhaalbare drempelinspanning.',
      description: 'Loop stevig maar beheerst. Je moet de laatste herhaling technisch goed kunnen afronden. Dribbel 2 minuten rustig in Z1 tussen de blokken.',
      steps: [
        { kind: 'warmup', label: 'Rustig inlopen (Z1)', durationMinutes: 12, intensity: 'E', all4runningZone: 1 },
        { kind: 'work', label: 'Drempelblok', durationMinutes: minutes, repeats: blocks, intensity: 'T', all4runningZone: 3 },
        { kind: 'recovery', label: 'Dribbelpauze (Z1)', durationMinutes: 2, repeats: blocks - 1, intensity: 'E', all4runningZone: 1 },
        { kind: 'cooldown', label: 'Uitlopen (Z1)', durationMinutes: 10, intensity: 'E', all4runningZone: 1 },
      ],
      status: 'planned',
      optional: false,
    }
  }

  return {
    id: 'quality-' + week,
    date: '',
    day: '',
    title: 'Fartlek · gecontroleerde blokken (Z3)',
    type: 'quality',
    durationMinutes: 48,
    intensity: 'Z3 · vlot en herhaalbaar (I)',
    goal: 'Een stevige prikkel die je zonder forceren kunt herhalen.',
    description: 'Houd het tempo gelijkmatig. Neem na ieder blok 1 minuut rustig herstel in Z1.',
    steps: [
      { kind: 'warmup', label: 'Rustig inlopen (Z1)', durationMinutes: 12, intensity: 'E', all4runningZone: 1 },
      { kind: 'work', label: 'Vlot interval', durationMinutes: 3, repeats: 5, intensity: 'I', all4runningZone: 3 },
      { kind: 'recovery', label: 'Rustig herstel (Z1)', durationMinutes: 1, repeats: 4, intensity: 'E', all4runningZone: 1 },
      { kind: 'cooldown', label: 'Uitlopen (Z1)', durationMinutes: 10, intensity: 'E', all4runningZone: 1 },
    ],
    status: 'planned',
    optional: false,
  }
}

function easySession(week: number, phase: Phase): PlannedWorkout {
  const taper = phase === 'taper'
  const marathonBlocks = phase === 'marathonspecifiek' && week % 2 === 1
  return {
    id: 'easy-' + week,
    date: '',
    day: '',
    title: marathonBlocks ? 'Rustige duurloop + marathontempo' : 'Rustige duurloop (E)',
    type: 'easy',
    durationMinutes: marathonBlocks ? 55 : taper ? 35 : phase === 'basis' ? 50 + Math.min(week, 4) * 5 : 60,
    intensity: marathonBlocks ? 'Z1 + Z2 · gecontroleerd marathontempo (M)' : 'Z1 · rustig praattempo (E)',
    goal: marathonBlocks ? 'Rustig lopen met korte, beheerste blokken op marathoninspanning.' : 'Aerobe basis opbouwen zonder onnodige vermoeidheid.',
    description: marathonBlocks
      ? 'Loop de blokken op gevoel en persoonlijk marathontempo. Je ademhaling blijft gecontroleerd; pas aan bij warmte, wind of vermoeidheid.'
      : 'Je moet in volledige zinnen kunnen praten. Tempo is ondergeschikt aan ontspannen lopen.',
    steps: marathonBlocks
      ? [
          { kind: 'warmup', label: 'Rustige duur (Z1)', durationMinutes: 18, intensity: 'E', all4runningZone: 1 },
          { kind: 'work', label: 'Marathontempo', durationMinutes: 8, repeats: 2, intensity: 'M', all4runningZone: 2 },
          { kind: 'recovery', label: 'Rustige dribbel (Z1)', durationMinutes: 3, intensity: 'E', all4runningZone: 1 },
          { kind: 'cooldown', label: 'Rustig uitlopen (Z1)', durationMinutes: 15, intensity: 'E', all4runningZone: 1 },
        ]
      : [
          { kind: 'easy', label: 'Rustige duur (Z1)', durationMinutes: taper ? 30 : 45, intensity: 'E', all4runningZone: 1 },
          { kind: 'strides', label: 'Korte versnellingen', durationSeconds: 15, repeats: taper ? 3 : 4, intensity: 'R', all4runningZone: '4-5' },
        ],
    status: 'planned',
    optional: false,
  }
}

function longSession(week: number, length: PlanLength, phase: Phase, recovery: boolean): PlannedWorkout {
  const distanceKm = LONG_RUNS[length][week - 1]
  if (week === length) {
    return {
      id: 'race-' + week,
      date: '',
      day: '',
      title: 'Marathon',
      type: 'race',
      distanceKm: 42.2,
      intensity: 'Marathonpace (M) · op inspanning en doeltempo',
      goal: 'Je marathon lopen met een plan dat past bij jouw voorbereiding.',
      description: 'Start beheerst. Pas tempo en voedingsplan aan op omstandigheden en hoe je je voelt.',
      steps: [
        { kind: 'warmup', label: 'Rustig voorbereiden (Z1)', durationMinutes: 10, intensity: 'E', all4runningZone: 1 },
        { kind: 'work', label: 'Persoonlijk marathontempo', durationMinutes: 1, intensity: 'M', all4runningZone: 2 },
      ],
      status: 'planned',
      optional: false,
    }
  }
  const timeCapMinutes = distanceKm >= 32 ? 180 : distanceKm >= 30 ? 165 : undefined
  const marathonBlock = phase === 'marathonspecifiek' && !recovery && week % 2 === 0
  return {
    id: 'long-' + week,
    date: '',
    day: '',
    title: 'Lange duurloop',
    type: 'long',
    distanceKm,
    timeCapMinutes,
    intensity: marathonBlock ? 'Z1 · met kort Z2-marathonblok (M)' : 'Z1 · rustig praattempo (E)',
    goal: 'Duurvermogen en een ontspannen voedings- en drinkroutine oefenen.',
    description: timeCapMinutes
      ? 'Houd afstand én tijd als richtlijn. Loop rustig; breek af als vermoeidheid of klachten toenemen.'
      : 'Loop ontspannen in Z1. Je hoeft de afstand niet sneller af te leggen dan je herstel toelaat.',
    steps: [
      { kind: 'warmup', label: 'Inlopen (Z1)', durationMinutes: 10, intensity: 'E', all4runningZone: 1 },
      { kind: 'easy', label: 'Rustige duur (Z1)', durationMinutes: 1, intensity: 'E', all4runningZone: 1 },
      ...(marathonBlock
        ? [{ kind: 'work' as const, label: 'Marathonblok aan het einde', durationMinutes: 15, intensity: 'M' as const, all4runningZone: 2 as const }]
        : []),
    ],
    status: 'planned',
    optional: false,
  }
}

export function generatePlan(input: PlanInput): PlanWeek[] {
  const days = [...(input.trainingDays ?? [2, 4, 0])].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  if (days.length !== 3 || new Set(days).size !== 3) {
    throw new Error('Kies drie verschillende vaste trainingsdagen.')
  }
  const optionalTrainingDay = input.optionalTrainingDay ?? 6
  if (input.includeOptionalFourth && (!Number.isInteger(optionalTrainingDay) || optionalTrainingDay < 0 || optionalTrainingDay > 6 || days.includes(optionalTrainingDay))) {
    throw new Error('Kies voor de optionele training een dag die niet al bij je vaste dagen staat.')
  }
  const raceDate = utcDate(input.marathonDate)
  if (dateOnly(raceDate) < todayDateISO()) throw new Error('De marathondatum ligt in het verleden. Kies een toekomstige datum.')
  const firstWorkoutDate = getPlanStartDate(input)
  if (firstWorkoutDate < todayDateISO()) {
    const startLabel = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(utcDate(firstWorkoutDate))
    throw new Error(`Dit schema zou starten op ${startLabel}, in het verleden. Kies een korter schema of een latere marathondatum.`)
  }
  const raceWeekMonday = mondayOf(raceDate)
  const recoveryWeeks = RECOVERY_WEEKS[input.length]
  const weeks: PlanWeek[] = []

  for (let week = 1; week <= input.length; week += 1) {
    const phase = phaseFor(input.length, week)
    const isRecoveryWeek = recoveryWeeks.includes(week)
    const weekStart = new Date(raceWeekMonday)
    weekStart.setUTCDate(weekStart.getUTCDate() - (input.length - week) * 7)

    const trainingDays = [...days].sort((a, b) => (a === 0 ? 6 : a - 1) - (b === 0 ? 6 : b - 1))
    const sessions: PlannedWorkout[] = [easySession(week, phase), qualitySession(week, phase, isRecoveryWeek), longSession(week, input.length, phase, isRecoveryWeek)]

    sessions.forEach((session, index) => {
      const scheduled = session.type === 'race' ? raceDate : dateInWeek(weekStart, trainingDays[index])
      session.date = dateOnly(scheduled)
      session.day = DAY_NAMES[scheduled.getUTCDay()]
    })

    if (input.includeOptionalFourth) {
      const optionalDate = dateInWeek(weekStart, optionalTrainingDay)
      if (optionalDate < raceDate) {
        sessions.push({
          id: 'optional-' + week,
          date: dateOnly(optionalDate),
          day: DAY_NAMES[optionalDate.getUTCDay()],
          title: 'Optionele herstelduurloop',
          type: 'optional',
          durationMinutes: 30,
          intensity: 'Z1 · zeer rustig (E)',
          goal: 'Extra rustige beweegtijd, alleen als dit goed past bij je herstel.',
          description: 'Sla deze training over als je moe bent of klachten hebt. Voeg geen zware blokken toe.',
          steps: [{ kind: 'easy', label: 'Rustige herstelduur (Z1)', durationMinutes: 30, intensity: 'E', all4runningZone: 1 }],
          status: 'planned',
          optional: true,
        })
      }
    }

    weeks.push({ weekNumber: week, phase, goal: phaseGoal(phase, isRecoveryWeek), isRecoveryWeek, workouts: sessions })
  }

  return weeks
}

export function phaseLabel(phase: Phase): string {
  return PHASE_LABELS[phase]
}

export function formatPace(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—'
  const rounded = Math.round(secondsPerKm)
  return Math.floor(rounded / 60) + ':' + String(rounded % 60).padStart(2, '0')
}

export function parseDurationToSeconds(value: string): number | null {
  const parts = value.trim().split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function paceAtFraction(vdot: number, fraction: number): number {
  const oxygenDemand = vdot * fraction
  const velocity = (-0.182258 + Math.sqrt(0.182258 ** 2 - 4 * 0.000104 * (-4.6 - oxygenDemand))) / (2 * 0.000104)
  return velocity > 0 ? 60000 / velocity : 0
}

export type TrainingPaces = {
  vdot: number
  easy: [number, number]
  marathon: number
  threshold: [number, number]
  interval: [number, number]
  repetition: [number, number]
}

export function calculateTrainingPaces(raceDistanceKm: number, raceTimeSeconds: number, goalTimeSeconds?: number): TrainingPaces | null {
  if (raceDistanceKm <= 0 || raceTimeSeconds <= 0) return null
  const minutes = raceTimeSeconds / 60
  const velocity = (raceDistanceKm * 1000) / minutes
  const oxygenCost = -4.6 + 0.182258 * velocity + 0.000104 * velocity ** 2
  const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
  const vdot = oxygenCost / fraction
  if (!Number.isFinite(vdot) || vdot <= 0) return null
  const range = (faster: number, slower: number): [number, number] => [paceAtFraction(vdot, faster), paceAtFraction(vdot, slower)]
  const marathon = goalTimeSeconds && goalTimeSeconds > 0 ? (goalTimeSeconds / 42.195) : paceAtFraction(vdot, 0.82)
  return {
    vdot: Math.round(vdot * 10) / 10,
    easy: range(0.74, 0.59),
    marathon,
    threshold: range(0.88, 0.84),
    interval: range(0.98, 0.95),
    repetition: range(1.05, 1.0),
  }
}

export function currentWeekNumber(weeks: PlanWeek[], today = new Date()): number {
  const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const openWeek = weeks.find((week) => {
    const dates = week.workouts.map((item) => item.date).sort()
    return dates.length > 0 && dateOnly(day) >= dates[0] && dateOnly(day) <= dates[dates.length - 1]
  })
  return openWeek?.weekNumber ?? 1
}

export function planLengths(): PlanLength[] {
  return [12, 16, 20]
}
