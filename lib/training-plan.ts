export type PlanLength = 12 | 16 | 20
export type Phase = 'basis' | 'ontwikkeling' | 'marathonspecifiek' | 'taper'
export type WorkoutStatus = 'planned' | 'completed' | 'adjusted' | 'skipped'
export type TrainingType = 'easy' | 'quality' | 'long' | 'optional' | 'race'

export type WorkoutStep = {
  kind: 'warmup' | 'easy' | 'work' | 'recovery' | 'cooldown' | 'strides'
  label: string
  durationMinutes?: number
  repeats?: number
  intensity?: 'E' | 'M' | 'T' | 'I' | 'R'
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
  goalTimeSeconds?: number
  startingWeeklyKm?: number
}

const LONG_RUNS: Record<PlanLength, number[]> = {
  12: [18, 20, 22, 16, 24, 26, 28, 18, 30, 32, 16, 42.2],
  16: [14, 16, 18, 14, 20, 22, 18, 24, 26, 20, 28, 30, 24, 28, 20, 42.2],
  20: [12, 14, 16, 14, 18, 20, 16, 22, 24, 18, 26, 28, 20, 30, 32, 24, 28, 20, 14, 42.2],
}

const RECOVERY_WEEKS: Record<PlanLength, number[]> = {
  12: [4, 8],
  16: [4, 8, 13],
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
  const value = new Date(date + 'T12:00:00.000Z')
  if (Number.isNaN(value.getTime())) throw new Error('Vul een geldige marathondatum in.')
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
    return {
      id: 'quality-' + week,
      date: '',
      day: '',
      title: phase === 'taper' ? 'Korte activatie' : 'Lichte fartlek',
      type: 'quality',
      durationMinutes: 40,
      intensity: 'Gecontroleerd · T/R',
      goal: 'Soepel en ontspannen blijven lopen.',
      description: 'Houd de inspanning licht. Stop als je techniek of ontspanning verslechtert.',
      steps: [
        { kind: 'warmup', label: 'Rustig inlopen', durationMinutes: 10, intensity: 'E' },
        { kind: 'work', label: 'Vlotte blokken', durationMinutes: 3, repeats: 4, intensity: 'T' },
        { kind: 'recovery', label: 'Rustig herstel', durationMinutes: 2, intensity: 'E' },
        { kind: 'cooldown', label: 'Uitlopen', durationMinutes: 8, intensity: 'E' },
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
      title: 'Fartlek · ' + repeats + ' × 1 min vlot',
      type: 'quality',
      durationMinutes: 45,
      intensity: 'Vlot, met ruime controle · R',
      goal: 'Licht voetenwerk en een ontspannen pasritme oefenen.',
      description: 'De vlotte minuten zijn geen sprint. Loop de herstelminuten heel rustig.',
      steps: [
        { kind: 'warmup', label: 'Rustig inlopen', durationMinutes: 12, intensity: 'E' },
        { kind: 'work', label: 'Vlot lopen', durationMinutes: 1, repeats, intensity: 'R' },
        { kind: 'recovery', label: 'Rustig herstel', durationMinutes: 1, repeats, intensity: 'E' },
        { kind: 'cooldown', label: 'Uitlopen', durationMinutes: 12, intensity: 'E' },
      ],
      status: 'planned',
      optional: false,
    }
  }

  if (phase === 'ontwikkeling') {
    const blocks = week % 2 === 0 ? 4 : 3
    const minutes = week % 2 === 0 ? 6 : 8
    return {
      id: 'quality-' + week,
      date: '',
      day: '',
      title: 'Drempelblokken · ' + blocks + ' × ' + minutes + ' min',
      type: 'quality',
      durationMinutes: 52,
      intensity: 'Drempel · T',
      goal: 'Een gelijkmatige, herhaalbare drempelinspanning.',
      description: 'Loop stevig maar beheerst. Je moet de laatste herhaling technisch goed kunnen afronden.',
      steps: [
        { kind: 'warmup', label: 'Rustig inlopen', durationMinutes: 12, intensity: 'E' },
        { kind: 'work', label: 'Drempelblok', durationMinutes: minutes, repeats: blocks, intensity: 'T' },
        { kind: 'recovery', label: 'Dribbelpauze', durationMinutes: 2, repeats: blocks - 1, intensity: 'E' },
        { kind: 'cooldown', label: 'Uitlopen', durationMinutes: 10, intensity: 'E' },
      ],
      status: 'planned',
      optional: false,
    }
  }

  const blocks = week % 2 === 0 ? 3 : 2
  return {
    id: 'quality-' + week,
    date: '',
    day: '',
    title: 'Marathonblokken · ' + blocks + ' × 10 min',
    type: 'quality',
    durationMinutes: 55,
    intensity: 'Marathoninspanning · M',
    goal: 'Het doeltempo ontspannen en gelijkmatig leren lopen.',
    description: 'Gebruik de blokken om je marathoninspanning te herkennen. Pas aan bij warmte, wind of vermoeidheid.',
    steps: [
      { kind: 'warmup', label: 'Rustig inlopen', durationMinutes: 12, intensity: 'E' },
      { kind: 'work', label: 'Marathonblok', durationMinutes: 10, repeats: blocks, intensity: 'M' },
      { kind: 'recovery', label: 'Rustige dribbel', durationMinutes: 3, repeats: blocks - 1, intensity: 'E' },
      { kind: 'cooldown', label: 'Uitlopen', durationMinutes: 10, intensity: 'E' },
    ],
    status: 'planned',
    optional: false,
  }
}

function easySession(week: number, phase: Phase): PlannedWorkout {
  const taper = phase === 'taper'
  return {
    id: 'easy-' + week,
    date: '',
    day: '',
    title: 'Rustige duurloop (E)',
    type: 'easy',
    durationMinutes: taper ? 35 : phase === 'basis' ? 50 + Math.min(week, 4) * 5 : 60,
    intensity: 'Rustig · praattempo',
    goal: 'Aerobe basis opbouwen zonder onnodige vermoeidheid.',
    description: 'Je moet in volledige zinnen kunnen praten. Tempo is ondergeschikt aan ontspannen lopen.',
    steps: [
      { kind: 'easy', label: 'Rustige duur', durationMinutes: taper ? 30 : 45, intensity: 'E' },
      { kind: 'strides', label: 'Korte versnellingen', durationMinutes: 1, repeats: taper ? 3 : 4, intensity: 'R' },
    ],
    status: 'planned',
    optional: false,
  }
}

function longSession(week: number, length: PlanLength, phase: Phase): PlannedWorkout {
  const distanceKm = LONG_RUNS[length][week - 1]
  if (week === length) {
    return {
      id: 'race-' + week,
      date: '',
      day: '',
      title: 'Marathon',
      type: 'race',
      distanceKm: 42.2,
      intensity: 'Wedstrijdinspanning · M',
      goal: 'Je marathon lopen met een plan dat past bij jouw voorbereiding.',
      description: 'Start beheerst. Pas tempo en voedingsplan aan op omstandigheden en hoe je je voelt.',
      steps: [
        { kind: 'warmup', label: 'Rustig voorbereiden', durationMinutes: 10, intensity: 'E' },
        { kind: 'work', label: 'Marathon', durationMinutes: 1, intensity: 'M' },
      ],
      status: 'planned',
      optional: false,
    }
  }
  const timeCapMinutes = distanceKm >= 32 ? (distanceKm >= 32 ? 180 : undefined) : distanceKm >= 30 ? 165 : undefined
  return {
    id: 'long-' + week,
    date: '',
    day: '',
    title: 'Lange duurloop',
    type: 'long',
    distanceKm,
    timeCapMinutes,
    intensity: phase === 'marathonspecifiek' ? 'Rustig · eventueel M-blokken' : 'Rustig · praattempo',
    goal: 'Duurvermogen en een ontspannen voedings- en drinkroutine oefenen.',
    description: timeCapMinutes
      ? 'Houd afstand én tijd als richtlijn. Breek de training af als vermoeidheid of klachten toenemen.'
      : 'Loop ontspannen. Je hoeft de afstand niet sneller af te leggen dan je herstel toelaat.',
    steps: [
      { kind: 'warmup', label: 'Inlopen', durationMinutes: 10, intensity: 'E' },
      { kind: 'easy', label: 'Rustige duur', durationMinutes: 1, intensity: 'E' },
      ...(phase === 'marathonspecifiek' && week % 2 === 0
        ? [{ kind: 'work' as const, label: 'Marathonblok aan het einde', durationMinutes: 15, intensity: 'M' as const }]
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
  const raceDate = utcDate(input.marathonDate)
  const raceWeekMonday = mondayOf(raceDate)
  const recoveryWeeks = RECOVERY_WEEKS[input.length]
  const weeks: PlanWeek[] = []

  for (let week = 1; week <= input.length; week += 1) {
    const phase = phaseFor(input.length, week)
    const isRecoveryWeek = recoveryWeeks.includes(week)
    const weekStart = new Date(raceWeekMonday)
    weekStart.setUTCDate(weekStart.getUTCDate() - (input.length - week) * 7)

    const trainingDays = [...days].sort((a, b) => (a === 0 ? 6 : a - 1) - (b === 0 ? 6 : b - 1))
    const sessions: PlannedWorkout[] = [easySession(week, phase), qualitySession(week, phase, isRecoveryWeek), longSession(week, input.length, phase)]

    sessions.forEach((session, index) => {
      const scheduled = session.type === 'race' ? raceDate : dateInWeek(weekStart, trainingDays[index])
      session.date = dateOnly(scheduled)
      session.day = DAY_NAMES[scheduled.getUTCDay()]
    })

    if (input.includeOptionalFourth) {
      const optionalDate = dateInWeek(weekStart, 6)
      if (optionalDate < raceDate) {
        sessions.push({
          id: 'optional-' + week,
          date: dateOnly(optionalDate),
          day: DAY_NAMES[optionalDate.getUTCDay()],
          title: 'Optionele herstelduurloop',
          type: 'optional',
          durationMinutes: 30,
          intensity: 'Zeer rustig · E',
          goal: 'Extra rustige beweegtijd, alleen als dit goed past bij je herstel.',
          description: 'Sla deze training over als je moe bent of klachten hebt. Voeg geen zware blokken toe.',
          steps: [{ kind: 'easy', label: 'Rustige herstelduur', durationMinutes: 30, intensity: 'E' }],
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
