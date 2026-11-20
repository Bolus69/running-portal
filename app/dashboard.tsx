Warning: truncated output (original token count: 37251)
Total output lines: 1595

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoMark } from '@/components/logo'
import { BRAND } from '@/lib/brand'
import { calculateTrainingPaces, currentWeekNumber, formatPace, generatePlan, getPlanStartDate, nextMondayDate, parseDurationToSeconds, phaseLabel } from '@/lib/training-plan'
import { todayDateISO } from '@/lib/dates'
import type { PlanWeek } from '@/lib/training-plan'
import type { ActivityLap, AppRole, AthleteSummary, CoachNote, CoachSuggestion, DashboardData, RunActivity, WellnessEntry } from '@/lib/types'

type View = 'week' | 'plan' | 'history' | 'wellness' | 'profile' | 'coach' | 'athletes' | 'suggestions' | 'athlete-detail'
type ManualDraft = { name: string; date: string; duration: string; distance: string; heartRate: string; effort: string; note: string; plannedWorkoutId: string }
type QuickFeedbackDraft = { effort: NonNullable<RunActivity['effort']> | ''; note: string }
type WellnessDraft = { sleepHours: string; restingHeartRate: string; recoveryScore: string; note: string }
type AthleteIdentityDraft = { name: string; age: string }
type ProfileDraft = { marathonDate: string; goalTime: string; planLength: 12 | 16 | 20; days: number[]; optional: boolean; optionalTrainingDay: number; raceTime: string; raceDistance: string; recentWeeklyKm: string; recentLongestRunKm: string }

const TRAINING_DAYS = [{ value: 1, label: 'Ma' }, { value: 2, label: 'Di' }, { value: 3, label: 'Wo' }, { value: 4, label: 'Do' }, { value: 5, label: 'Vr' }, { value: 6, label: 'Za' }, { value: 0, label: 'Zo' }]

function toggleProfileDay(setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>, value: number) {
  setDraft((current) => {
    const days = current.days.includes(value) ? current.days.filter((day) => day !== value) : [...current.days, value]
    const optionalTrainingDay = current.optional && days.includes(current.optionalTrainingDay)
      ? (TRAINING_DAYS.find((day) => !days.includes(day.value))?.value ?? current.optionalTrainingDay)
      : current.optionalTrainingDay
    return { ...current, days, optionalTrainingDay }
  })
}

function PlanTimingNote({ draft, revision = false, readOnly = false }: { draft: ProfileDraft; revision?: boolean; readOnly?: boolean }) {
  if (revision) return <p className="plan-timing-note">Wijzigingen gaan in op maandag {dateLabel(nextMondayDate(), { day: 'numeric', month: 'long' })}. Eerdere trainingen en feedback blijven bewaard.</p>
  if (!draft.marathonDate) return <p className="plan-timing-note">Kies een marathondatum om de start van week 1 te zien.</p>
  if (draft.days.length !== 3) return <p className="plan-timing-note">Kies precies drie vaste dagen om de startdatum te berekenen.</p>
  let message: string
  let isPast = false
  try {
    const start = getPlanStartDate({
      marathonDate: draft.marathonDate,
      length: draft.planLength,
      trainingDays: draft.days,
      includeOptionalFourth: draft.optional,
      optionalTrainingDay: draft.optionalTrainingDay,
    })
    isPast = start < todayDateISO()
    message = isPast && !readOnly
      ? 'Dit schema zou starten op ' + dateLabel(start, { day: 'numeric', month: 'long', year: 'numeric' }) + ', in het verleden. Kies een korter schema of een latere marathondatum.'
      : 'Start van week 1: ' + dateLabel(start, { day: 'numeric', month: 'long', year: 'numeric' }) + '.'
  } catch (error) {
    isPast = true
    message = error instanceof Error ? error.message : 'Controleer de marathondatum en trainingsdagen.'
  }
  return <p className={'plan-timing-note' + (isPast && !readOnly ? ' warning' : '')}>{message}</p>
}

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  // Font Awesome Free "person-running" by Fonticons, Inc. (CC BY 4.0): https://fontawesome.com/icons/person-running
  const runnerMark = <path fill="currentColor" stroke="none" d="M400 224h-44l-26.12-53.25c-12.5-25.5-35.38-44.25-61.75-51L197 98.63C189.5 96.84 181.1 95.97 174.5 95.97c-20.88 0-41.33 6.81-58.26 19.78L76.5 146.3C68.31 152.5 64.01 162 64.01 171.6c0 17.11 13.67 32.02 32.02 32.02c6.808 0 13.67-2.158 19.47-6.616l39.63-30.38c5.92-4.488 13.01-6.787 19.53-6.787c2.017 0 3.981 .2196 5.841 .6623l14.62 4.25l-37.5 87.5C154.1 260.3 152.5 268.8 152.5 277.2c0 22.09 11.49 43.52 31.51 55.29l85 50.13l-27.5 87.75c-.9875 3.174-1.458 6.388-1.458 9.55c0 13.65 8.757 26.31 22.46 30.58C265.6 511.5 268.9 512 272 512c13.62 0 26.25-8.75 30.5-22.5l31.75-101c1.211-4.278 1.796-8.625 1.796-12.93c0-16.57-8.661-32.51-23.55-41.44l-61.13-36.12l31.25-78.38l20.25 41.5C310.9 277.4 327.9 288 345.1 288H400c17.62 0 32-14.38 32-32C432 238.3 417.6 224 400 224zM288 96c26.5 0 48-21.5 48-48s-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48zM129.8 317.5L114.9 352H48c-17.62 0-32 14.38-32 32s14.38 32 32 32h77.5c19.25 0 36.5-11.5 44-29.12l8.875-20.5l-10.75-6.25C150.4 349.9 137.6 334.8 129.8 317.5z" />
  const paths: Record<string, React.ReactNode> = {
    week: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/></>,
    plan: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v15M8 7h8M8 11h7"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    heart: <><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/><path d="M3.8 12h4l2-3 2.2 6 2.1-4H20"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M19 5h2M20 4v2"/></>,
    coach: <><circle cx="9" cy="8" r="3.3"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.5a3 3 0 0 1 0 5.8M17.5 14a5.6 5.6 0 0 1 4 5"/></>,
    people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20a6 6 0 0 1 12 0M16 15a4.8 4.8 0 0 1 5 5"/></>,
    spark: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
    runner: runnerMark,
    run: runnerMark,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></>,
    mood1: <><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" strokeWidth="2.5"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/></>,
    mood2: <><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" strokeWidth="2.5"/><path d="M8.5 16.5c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8"/></>,
    mood3: <><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" strokeWidth="2.5"/><path d="M8 16h8"/></>,
    mood4: <><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" strokeWidth="2.5"/><path d="M8.5 15.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/></>,
    mood5: <><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" strokeWidth="2.5"/><path d="M8 15c1 2 2.5 3 4 3s3-1 4-3"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  }
  const isRunner = name === "runner" || name === "run"
  return <svg {...common} viewBox={isRunner ? "0 0 448 512" : common.viewBox} fill={isRunner ? "currentColor" : common.fill} stroke={isRunner ? "none" : common.stroke}>{paths[name] ?? paths.runner}</svg>
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const date = new Date(value.slice(0, 10) + 'T12:00:00')
  return new Intl.DateTimeFormat('nl-NL', options).format(date)
}

function formatTime(value: string): string {
  const seconds = parseDurationToSeconds(value)
  if (!seconds) return value || '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')
}

function raceTimeInput(seconds?: number): string {
  if (!seconds || seconds <= 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = Math.floor(seconds % 60)
  return hours > 0
    ? [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')
    : [minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')
}

function profileDraftForAthlete(athlete?: AthleteSummary): ProfileDraft {
  const workouts = athlete?.planWeeks?.[0]?.workouts ?? []
  const inferredDays = [...new Set(workouts.filter((workout) => !workout.optional).map((workout) => new Date(workout.date + 'T12:00:00').getDay()))]
  const optionalWorkout = workouts.find((workout) => workout.optional)
  const suggestedDate = new Date()
  suggestedDate.setDate(suggestedDate.getDate() + (athlete?.planLength ?? 16) * 7)
  return {
    marathonDate: athlete?.marathonDate || todayDateISO(suggestedDate),
    goalTime: athlete?.goalTime || '04:00:00',
    planLength: athlete?.planLength ?? 16,
    days: athlete?.trainingDays ?? (inferredDays.length === 3 ? inferredDays : [2, 4, 0]),
    optional: athlete?.includeOptionalFourth ?? Boolean(optionalWorkout),
    optionalTrainingDay: athlete?.optionalTrainingDay ?? (optionalWorkout ? new Date(optionalWorkout.date + 'T12:00:00').getDay() : 6),
    raceTime: raceTimeInput(athlete?.recentRaceTimeSeconds),
    raceDistance: athlete?.recentRaceDistanceKm ? String(athlete.recentRaceDistanceKm) : '',
    recentWeeklyKm: athlete?.recentWeeklyKm ? String(athlete.recentWeeklyKm) : '',
    recentLongestRunKm: athlete?.recentLongestRunKm ? String(athlete.recentLongestRunKm) : '',
  }
}

function mergeRevisedPlanWeeks(previous: PlanWeek[], next: PlanWeek[], effectiveStartDate: string): PlanWeek[] {
  const history = previous.map((week, index) => ({
    ...week,
    id: week.id ?? 'history-' + week.weekNumber + '-' + (week.workouts[0]?.date ?? index),
    historical: true,
    workouts: week.workouts.filter((workout) => workout.date < effectiveStartDate),
  })).filter((week) => week.workouts.length > 0)
  const upcoming = next.map((week) => ({
    ...week,
    id: 'current-' + week.weekNumber,
    historical: false,
    workouts: week.workouts.filter((workout) => workout.date >= effectiveStartDate),
  })).filter((week) => week.workouts.length > 0)
  return [...history, ...upcoming].sort((a, b) => (a.workouts[0]?.date ?? '').localeCompare(b.workouts[0]?.date ?? ''))
}

function findCurrentPlanWeek(weeks: PlanWeek[], todayDate = todayDateISO()): PlanWeek | undefined {
  const monday = new Date(todayDate + 'T12:00:00.000Z')
  const weekday = monday.getUTCDay()
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1))
  const mondayISO = monday.toISOString().slice(0, 10)
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  const sundayISO = sunday.toISOString().slice(0, 10)
  return weeks.find((week) => week.workouts.some((workout) => workout.date >= mondayISO && workout.date <= sundayISO))
    ?? weeks.find((week) => (week.workouts[0]?.date ?? '') >= todayDate)
    ?? weeks[0]
}

function paceIntensityLabel(value?: string): string {
  if (!value) return ''
  const labels: Record<string, string> = {
    E: 'Rustig tempo',
    M: 'Marathontempo',
    T: 'Stevig tempo',
    I: 'Intervaltempo',
    R: 'Korte versnellingen',
  }
  return labels[value] ?? value.replace(/\s*\((?:E|M|T|I|R)\)/g, '').replace(/\bMarathonpace\b/gi, 'Marathontempo')
}

function workoutTitleLabel(value: string): string {
  return value.replace(/\s*\((?:E|M|T|I|R)\)/g, '').replace(/\bMarathonpace\b/gi, 'Marathontempo')
}

function effortLabel(value?: RunActivity['effort']): string {
  return ({ easier: 'Makkelijker dan verwacht', as_expected: 'Zoals verwacht', harder: 'Zwaarder dan verwacht', not_good: 'Niet goed gegaan' } as const)[value ?? 'as_expected']
}

const RECOVERY_LABELS = ['Slecht', 'Matig', 'Neutraal', 'Goed', 'Heel goed'] as const

function recoveryLabel(value: number): string {
  return RECOVERY_LABELS[value - 1] ?? 'Niet ingevuld'
}

function RecoveryMood({ value, size = 17 }: { value: number; size?: number }) {
  return <span className="recovery-mood" aria-label={'Herstelgevoel: ' + recoveryLabel(value)}><Icon name={'mood' + value} size={size} /><small>{recoveryLabel(value)}</small></span>
}

function workoutIconName(type: PlanWeek['workouts'][number]['type']): string {
  void type
  return 'runner'
}

function activitySourceLabel(source: RunActivity['source']): string {
  return source === 'strava' ? 'Strava' : source === 'upload' ? 'Bestand' : 'Handmatig'
}
function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { planned: 'Gepland', completed: 'Uitgevoerd', adjusted: 'Aangepast', skipped: 'Overgeslagen' }
  return <span className={'status-pill status-' + status}>{labels[status] ?? status}</span>
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={'nav-item' + (active ? ' active' : '')} onClick={onClick}>{icon === 'appLogo' ? <LogoMark small /> : <Icon name={icon} />}<span>{label}</span>{active && <span className="nav-active-dot" />}</button>
}

function TalkTestGuide() {
  return <div className="talk-test-guide">
    <div><strong>Rustig</strong><span>Je kunt in volledige zinnen praten.</span></div>
    <div><strong>Stevig</strong><span>Praten lukt in korte zinnen.</span></div>
    <div><strong>Intensief</strong><span>Je kunt nog maar enkele woorden zeggen.</span></div>
  </div>
}

function StatCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone?: string }) {
  return <div className="stat-card"><span className={'stat-icon ' + (tone ?? '')}><Icon name={icon} size={17} /></span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}

export function Dashboard({ initialData, demoMode }: { initialData: DashboardData; demoMode: boolean }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [role, setRole] = useState<AppRole>(initialData.profile.role)
  const [view, setView] = useState<View>(initialData.profile.role === 'coach' ? 'coach' : 'week')
  const [modal, setModal] = useState<'activity' | 'invite' | 'plan' | 'feedback' | 'select-athlete' | 'delete-athlete' | null>(null)
  const [feedbackWorkout, setFeedbackWorkout] = useState<PlanWeek['workouts'][number] | null>(null)
  const [feedbackDraft, setFeedbackDraft] = useState<QuickFeedbackDraft>({ effort: '', note: '' })
  const [activityFile, setActivityFile] = useState<File | null>(null)
  const [activityUploadError, setActivityUploadError] = useState('')
  const [savingWorkoutFeedback, setSavingWorkoutFeedback] = useState(false)
  const [toast, setToast] = useState('')
  const [evaluatingSuggestions, setEvaluatingSuggestions] = useState(false)
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null)
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteSummary | null>(null)
  const [deleteAthleteConfirmation, setDeleteAthleteConfirmation] = useState('')
  const [deletingAthlete, setDeletingAthlete] = useState(false)
  const [profileAthleteId, setProfileAthleteId] = useState<string | null>(initialData.profile.role === 'coach' ? null : initialData.athletes[0]?.id ?? null)
  const [draft, setDraft] = useState<ManualDraft>({ name: '', date: todayDateISO(), duration: '', distance: '', heartRate: '', effort: '', note: '', plannedWorkoutId: '' })
  const [lapDrafts, setLapDrafts] = useState<ActivityLap[]>([])
  const [wellnessDraft, setWellnessDraft] = useState<WellnessDraft>({ sleepHours: '', restingHeartRate: '', recoveryScore: '', note: '' })
  const [identityDraft, setIdentityDraft] = useState<AthleteIdentityDraft>({ name: initialData.profile.name, age: initialData.profile.age ? String(initialData.profile.age) : '' })
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ marathonDate: initialData.plan?.marathonDate ?? '', goalTime: initialData.plan?.goalTime ?? '', planLength: initialData.plan?.length ?? 16, days: initialData.plan?.trainingDays ?? [2, 4, 0], optional: initialData.plan?.includeOptionalFourth ?? false, optionalTrainingDay: initialData.plan?.optionalTrainingDay ?? 6, raceTime: raceTimeInput(initialData.plan?.recentRaceTimeSeconds), raceDistance: initialData.plan?.recentRaceDistanceKm ? String(initialData.plan.recentRaceDistanceKm) : '', recentWeeklyKm: initialData.plan?.recentWeeklyKm ? String(initialData.plan.recentWeeklyKm) : '', recentLongestRunKm: initialData.plan?.recentLongestRunKm ? String(initialData.plan.recentLongestRunKm) : '' })
  const [coachPlanDraft, setCoachPlanDraft] = useState<ProfileDraft>({ marathonDate: '', goalTime: '04:00:00', planLength: 16, days: [2, 4, 0], optional: false, optionalTrainingDay: 6, raceTime: '', raceDistance: '', recentWeeklyKm: '', recentLongestRunKm: '' })

  useEffect(() => {
    if (demoMode) return
    const frame = window.requestAnimationFrame(() => setData(initialData))
    return () => window.cancelAnimationFrame(frame)
  }, [initialData, demoMode])

  useEffect(() => {
    if (!demoMode) return
    const saved = window.localStorage.getItem('marathon-coach-preview-v1')
    if (!saved) return
    try {
      const value = JSON.parse(saved) as DashboardData
      const frame = window.requestAnimationFrame(() => {
        setData(value)
        setRole(value.profile.role)
      })
      return () => window.cancelAnimationFrame(frame)
    } catch {
      window.localStorage.removeItem('marathon-coach-preview-v1')
    }
  }, [demoMode])

  useEffect(() => {
    const openInvite = () => setModal('invite')
    const openProfile = () => setView('profile')
    window.addEventListener('open-invite', openInvite)
    window.addEventListener('open-profile', openProfile)
    return () => {
      window.removeEventListener('open-invite', openInvite)
      window.removeEventListener('open-profile', openProfile)
    }
  }, [])

  useEffect(() => {
    if (demoMode) window.localStorage.setItem('marathon-coach-preview-v1', JSON.stringify(data))
  }, [data, demoMode])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const plan = data.plan
  const activeWeek = useMemo(() => plan?.weeks.find((week) => week.id === plan.currentWeekId) ?? plan?.weeks.find((week) => week.weekNumber === plan.currentWeek) ?? plan?.weeks[0] ?? null, [plan])
  const completedThisWeek = activeWeek?.workouts.filter((workout) => workout.status === 'completed').length ?? 0
  const requiredThisWeek = activeWeek?.workouts.filter((workout) => !workout.optional).length ?? 0
  const progress = requiredThisWeek > 0 ? Math.round((completedThisWeek / requiredThisWeek) * 100) : 0
  const nextTraining = activeWeek?.workouts.find((workout) => workout.status === 'planned' && !workout.optional)
  const profileAthlete = data.athletes.find((athlete) => athlete.id === profileAthleteId) ?? null
  const paces = calculateTrainingPaces(Number(profileDraft.raceDistance), parseDurationToSeconds(profileDraft.raceTime) ?? 0, parseDurationToSeconds(profileDraft.goalTime) ?? undefined)
  const feedbackLinkedActivity = feedbackWorkout ? data.activities.find((activity) => activity.plannedWorkoutId === feedbackWorkout.id) : undefined

  const showToast = (message: string) => setToast(message)
  const go = (next: View) => {
    if (next === 'profile' && role === 'coach' && profileAthlete) {
      setProfileDraft(profileDraftForAthlete(profileAthlete))
    }
    setView(next)
    setSelectedAthlete(null)
  }

  function selectProfileAthlete(id: string) {
    const athlete = data.athletes.find((item) => item.id === id)
    if (!athlete) return
    setProfileAthleteId(athlete.id)
    setProfileDraft(profileDraftForAthlete(athlete))
  }

  function openCoachAthlete(athlete: AthleteSummary) {
    setSelectedAthlete(athlete)
    setProfileAthleteId(athlete.id)
    setProfileDraft(profileDraftForAthlete(athlete))
    setView('athlete-detail')
  }

  function openWorkoutFeedback(workout: PlanWeek['workouts'][number]) {
    setFeedbackWorkout(workout)
    setFeedbackDraft({ effort: workout.feedback?.effort ?? '', note: workout.feedback?.note ?? '' })
    setActivityFile(null)
    setActivityUploadError('')
    setModal('feedback')
  }

  function openWorkoutFeedbackById(workoutId: string) {
    const workout = data.plan?.weeks.flatMap((week) => week.workouts).find((item) => item.id === workoutId)
    if (workout) openWorkoutFeedback(workout)
  }

  async function saveWorkoutFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!feedbackWorkout || savingWorkoutFeedback) return
    setSavingWorkoutFeedback(true)
    const note = feedbackDraft.note.trim().slice(0, 200)
    const payload = { workoutId: feedbackWorkout.id, status: 'completed', effort: feedbackDraft.effort || undefined, note: note || undefined }
    const completedAt = new Date().toISOString()
    const feedback = payload.effort || payload.note
      ? { effort: payload.effort, note: payload.note, completedAt }
      : undefined
    try {
      if (!demoMode) {
        const response = await fetch('/api/workouts/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!response.ok) {
          showToast('De trainingsstatus kon niet worden opgeslagen. Probeer het opnieuw.')
          return
        }
      }
      setData((current) => ({
        ...current,
        plan: current.plan ? { ...current.plan, weeks: current.plan.weeks.map((week) => ({ ...week, workouts: week.workouts.map((workout) => workout.id === feedbackWorkout.id ? { ...workout, status: 'completed', feedback } : workout) })) } : null,
      }))

      if (activityFile && !demoMode) {
        setFeedbackWorkout((current) => current ? { ...current, status: 'completed', feedback } : current)
        const form = new FormData()
        form.set('file', activityFile)
        form.set('plannedWorkoutId', feedbackWorkout.id)
        if (payload.effort) form.set('effort', payload.effort)
        if (note) form.set('note', note)
        const response = await fetch('/api/activities/import', { method: 'POST', body: form })
        const result = await response.json().catch(() => ({})) as { error?: string; warning?: string }
        if (!response.ok) {
          setActivityUploadError(result.error ?? 'Het bestand kon niet worden toegevoegd. Probeer het opnieuw.')
          return
        }
        if (result.warning) {
          setActivityUploadError(result.warning)
          router.refresh()
          return
        }
      } else if (activityFile && demoMode) {
        setActivityUploadError('Bestanden uploaden kan alleen met je eigen account. Je kunt de training wel afronden.')
        return
      }

      const wasAlreadyCompleted = feedbackWorkout.status === 'completed'
      setModal(null)
      setFeedbackWorkout(null)
      setActivityFile(null)
      if (activityFile) router.refresh()
      showToast(activityFile ? 'Training afgerond en bestand aan je schema gekoppeld.' : wasAlreadyCompleted ? 'Je trainingsfeedback is opgeslagen.' : 'Training als uitgevoerd gemarkeerd.')
    } catch {
      setActivityUploadError(activityFile ? 'De training is afgerond, maar het bestand kon niet worden gekoppeld. Probeer het opnieuw.' : 'De trainingsstatus kon niet worden opgeslagen. Probeer het opnieuw.')
    } finally {
      setSavingWorkoutFeedback(false)
    }
  }

  async function updateWorkout(workoutId: string, status: 'completed' | 'skipped') {
    if (!demoMode) {
      const response = await fetch('/api/workouts/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workoutId, status }) })
      if (!response.ok) return showToast('De trainingsstatus kon niet worden opgeslagen. Probeer het opnieuw.')
    }
    setData((current) => ({
      ...current,
      plan: current.plan ? { ...current.plan, weeks: current.plan.weeks.map((week) => ({ ...week, workouts: week.workouts.map((workout) => workout.id === workoutId ? { ...workout, status } : workout) })) } : null,
    }))
    showToast(status === 'completed' ? 'Training als uitgevoerd gemarkeerd.' : 'Training als overgeslagen gemarkeerd.')
  }

  async function saveManualActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const durationMinutes = Number(draft.duration)
    const distanceKm = Number(draft.distance)
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return showToast('Vul de duur van je training in.')
    const activity: RunActivity = {
      id: 'manual-' + Date.now(),
      name: draft.name.trim() || 'Hardlooptraining',
      startedAt: draft.date + 'T12:00:00',
      activityType: 'Run',
      durationMinutes,
      distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : undefined,
      pace: Number.isFinite(distanceKm) && distanceKm > 0 ? formatPace((durationMinutes * 60) / distanceKm) : undefined,
      averageHeartRate: Number(draft.heartRate) > 0 ? Number(draft.heartRate) : undefined,
      source: 'manual',
      effort: draft.effort ? draft.effort as RunActivity['effort'] : undefined,
      note: draft.note.trim() || undefined,
      plannedWorkoutId: draft.plannedWorkoutId || undefined,
      laps: lapDrafts.length ? lapDrafts.map((lap, index) => ({ ...lap, id: 'manual-lap-' + Date.now() + '-' + index })) : undefined,
    }
    if (!demoMode) {
      const response = await fetch('/api/activities/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(activity) })
      const result = await response.json().catch(() => ({})) as { warning?: string; error?: string }
      if (!response.ok) return showToast(result.error ?? 'Opslaan lukte niet. Probeer het opnieuw.')
      setData((current) => ({
        ...current,
        activities: [activity, ...current.activities],
        plan: current.plan && activity.plannedWorkoutId ? { ...current.plan, weeks: current.plan.weeks.map((week) => ({ ...week, workouts: week.workouts.map((workout) => workout.id === activity.plannedWorkoutId ? { ...workout, status: 'completed' } : workout) })) } : current.plan,
      }))
      setModal(null)
      setLapDrafts([])
      setDraft({ name: '', date: todayDateISO(), duration: '', distance: '', heartRate: '', effort: '', note: '', plannedWorkoutId: '' })
      showToast(result.warning ?? 'Training toegevoegd aan je geschiedenis.')
      return
    }
    setData((current) => ({
      ...current,
      activities: [activity, ...current.activities],
      plan: current.plan && activity.plannedWorkoutId ? { ...current.plan, weeks: current.plan.weeks.map((week) => ({ ...week, workouts: week.workouts.map((workout) => workout.id === activity.plannedWorkoutId ? { ...workout, status: 'completed' } : workout) })) } : current.plan,
    }))
    setModal(null)
    setLapDrafts([])
    setDraft({ name: '', date: todayDateISO(), duration: '', distance: '', heartRate: '', effort: '', note: '', plannedWorkoutId: '' })
    showToast('Training toegevoegd aan je geschiedenis.')
  }

  async function saveWellness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entry: WellnessEntry = {
      id: 'wellness-' + Date.now(),
      date: todayDateISO(),
      sleepHours: wellnessDraft.sleepHours ? Number(wellnessDraft.sleepHours) : undefined,
      restingHeartRate: wellnessDraft.restingHeartRate ? Number(wellnessDraft.restingHeartRate) : undefined,
      recoveryScore: wellnessDraft.recoveryScore ? Number(wellnessDraft.recoveryScore) : undefined,
      note: wellnessDraft.note.trim() || undefined,
      visibleToCoach: true,
    }
    if (!demoMode) {
      try {
        const response = await fetch('/api/wellness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) return showToast(result.error ?? 'Opslaan lukte niet. Probeer het opnieuw.')
      } catch {
        return showToast('Geen verbinding. Je herstelgegevens zijn niet opgeslagen.')
      }
    }
    setData((current) => ({ ...current, wellness: [entry, ...current.wellness.filter((item) => item.date !== entry.date)] }))
    setWellnessDraft({ sleepHours: '', restingHeartRate: '', recoveryScore: '', note: '' })
    showToast('Herstelgegevens opgeslagen en gedeeld met je coach.')
  }

  async function saveAthleteIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = identityDraft.name.trim()
    if (!name || name.length > 80) return showToast('Vul een naam in van maximaal 80 tekens.')
    const age = identityDraft.age.trim() ? Number(identityDraft.age) : undefined
    if (age !== undefined && (!Number.isInteger(age) || age < 1 || age > 120)) return showToast('Vul een leeftijd tussen 1 en 120 jaar in, of laat het veld leeg.')

    if (!demoMode) {
      try {
        const response = await fetch('/api/athlete/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, age: age ?? null }) })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) return showToast(result.error ?? 'Je profielgegevens konden niet worden opgeslagen.')
      } catch {
        return showToast('Geen verbinding. Je profielgegevens zijn niet opgeslagen.')
      }
    }

    setData((current) => ({
      ...current,
      profile: { ...current.profile, name, age },
      athletes: current.athletes.map((athlete) => athlete.id === current.profile.id ? { ...athlete, name, age } : athlete),
    }))
    setIdentityDraft({ name, age: age === undefined ? '' : String(age) })
    showToast('Profielgegevens opgeslagen.')
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const goalSeconds = parseDurationToSeconds(profileDraft.goalTime)
    if (!goalSeconds) return showToast('Gebruik voor je streeftijd uu:mm:ss, bijvoorbeeld 04:00:00.')
    if (profileDraft.days.length !== 3) return showToast('Je hebt ' + profileDraft.days.length + ' vaste dagen gekozen. Kies precies drie.')
    let weeks: PlanWeek[]
    try {
      weeks = generatePlan({
        marathonDate: profileDraft.marathonDate,
        length: profileDraft.planLength,
        trainingDays: profileDraft.days,
        includeOptionalFourth: profileDraft.optional,
        optionalTrainingDay: profileDraft.optionalTrainingDay,
        goalTimeSeconds: goalSeconds,
      })
    } catch (error) {
      return showToast(error instanceof Error ? error.message : 'Het plan kan niet worden opgebouwd.')
    }
    const recentWeeklyKm = profileDraft.recentWeeklyKm ? Number(profileDraft.recentWeeklyKm) : undefined
    const recentLongestRunKm = profileDraft.recentLongestRunKm ? Number(profileDraft.recentLongestRunKm) : undefined
    const newPlan = {
      length: profileDraft.planLength,
      marathonDate: profileDraft.marathonDate,
      goalTime: profileDraft.goalTime,
      currentWeek: currentWeekNumber(weeks),
      weeks,
      trainingDays: [...profileDraft.days],
      includeOptionalFourth: profileDraft.optional,
      optionalTrainingDay: profileDraft.optionalTrainingDay,
      recentWeeklyKm,
      recentLongestRunKm,
    }
    if (!demoMode) {
      const response = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marathonDate: newPlan.marathonDate, planLength: newPlan.length, goalTime: newPlan.goalTime, trainingDays: newPlan.trainingDays, includeOptionalFourth: newPlan.includeOptionalFourth, optionalTrainingDay: newPlan.optionalTrainingDay, recentRaceDistanceKm: Number(profileDraft.raceDistance), recentRaceTimeSeconds: parseDurationToSeconds(profileDraft.raceTime), recentWeeklyKm, recentLongestRunKm }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) return showToast(result.error ?? 'Het plan kon niet worden bijgewerkt. Controleer je accountinstellingen.')
    }
    setData((current) => ({ ...current, plan: newPlan }))
    showToast('Je trainingsplan is bijgewerkt.')
  }

  async function saveCoachPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAthlete) return
    const goalSeconds = parseDurationToSeconds(coachPlanDraft.goalTime)
    if (!goalSeconds) return showToast('Gebruik voor de streeftijd uu:mm:ss, bijvoorbeeld 04:00:00.')
    if (coachPlanDraft.days.length !== 3) return showToast('Je hebt ' + coachPlanDraft.days.length + ' vaste dagen gekozen. Kies precies drie.')
    const effectiveStartDate = selectedAthlete.planWeeks?.length ? nextMondayDate() : undefined
    let generatedWeeks: PlanWeek[]
    try {
      generatedWeeks = generatePlan({
        marathonDate: coachPlanDraft.marathonDate,
        length: coachPlanDraft.planLength,
        trainingDays: coachPlanDraft.days,
        includeOptionalFourth: coachPlanDraft.optional,
        optionalTrainingDay: coachPlanDraft.optionalTrainingDay,
        goalTimeSeconds: goalSeconds,
        effectiveStartDate,
      })
    } catch (error) {
      return showToast(error instanceof Error ? error.message : 'Het plan kan niet worden opgebouwd.')
    }
    const displayedWeeks = effectiveStartDate ? mergeRevisedPlanWeeks(selectedAthlete.planWeeks ?? [], generatedWeeks, effectiveStartDate) : generatedWeeks
    const displayedCurrentWeek = findCurrentPlanWeek(displayedWeeks)

    if (!demoMode) {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId: selectedAthlete.id,
          marathonDate: coachPlanDraft.marathonDate,
          planLength: coachPlanDraft.planLength,
          goalTime: coachPlanDraft.goalTime,
          trainingDays: coachPlanDraft.days,
          includeOptionalFourth: coachPlanDraft.optional,
          optionalTrainingDay: coachPlanDraft.optionalTrainingDay,
          recentRaceDistanceKm: Number(coachPlanDraft.raceDistance),
          recentRaceTimeSeconds: parseDurationToSeconds(coachPlanDraft.raceTime),
          recentWeeklyKm: coachPlanDraft.recentWeeklyKm ? Number(coachPlanDraft.recentWeeklyKm) : undefined,
          recentLongestRunKm: coachPlanDraft.recentLongestRunKm ? Number(coachPlanDraft.recentLongestRunKm) : undefined,
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) return showToast(result.error ?? 'Het plan kon niet worden opgeslagen. Controleer je coachrechten en de invoer.')
    }

    const updatedAthlete: AthleteSummary = {
      ...selectedAthlete,
      marathonDate: coachPlanDraft.marathonDate,
      goalTime: coachPlanDraft.goalTime,
      planLength: coachPlanDraft.planLength,
      recentWeeklyKm: coachPlanDraft.recentWeeklyKm ? Number(coachPlanDraft.recentWeeklyKm) : undefined,
      recentLongestRunKm: coachPlanDraft.recentLongestRunKm ? Number(coachPlanDraft.recentLongestRunKm) : undefined,
      currentWeek: displayedCurrentWeek?.weekNumber ?? selectedAthlete.currentWeek,
      phase: displayedCurrentWeek?.phase ?? selectedAthlete.phase,
      plannedThisWeek: effectiveStartDate ? selectedAthlete.plannedThisWeek : displayedCurrentWeek?.workouts.filter((workout) => !workout.optional).length ?? 3,
      lastLongRun: selectedAthlete.lastLongRun,
      planWeeks: displayedWeeks,
    }
    setSelectedAthlete(updatedAthlete)
    setData((current) => ({
      ...current,
      athletes: current.athletes.map((athlete) => athlete.id === updatedAthlete.id ? updatedAthlete : athlete),
    }))
    setModal(null)
    showToast(effectiveStartDate ? 'Schema aangepast. Eerdere trainingen blijven bewaard; de wijziging gaat in op maandag ' + dateLabel(effectiveStartDate, { day: 'numeric', month: 'long' }) + '.' : demoMode ? 'Voorbeeldschema ingesteld.' : 'Marathonplan opgeslagen voor ' + selectedAthlete.name + '.')
    if (!demoMode) router.refresh()
  }

  async function saveCoachProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formAthleteId = String(new FormData(event.currentTarget).get('athleteId') ?? '')
    const selectedAthlete = data.athletes.find((athlete) => athlete.id === formAthleteId)
    if (!selectedAthlete) return showToast('Selecteer eerst een atleet uit de lijst.')
    const goalSeconds = parseDurationToSeconds(profileDraft.goalTime)
    if (!goalSeconds) return showToast('Gebruik voor de streeftijd uu:mm:ss, bijvoorbeeld 04:00:00.')
    if (profileDraft.days.length !== 3) return showToast('Kies precies drie vaste trainingsdagen.')
    const effectiveStartDate = selectedAthlete.planWeeks?.length ? nextMondayDate() : undefined
    const recentWeeklyKm = profileDraft.recentWeeklyKm ? Number(profileDraft.recentWeeklyKm) : undefined
    const recentLongestRunKm = profileDraft.recentLongestRunKm ? Number(profileDraft.recentLongestRunKm) : undefined
    const recentRaceDistanceKm = profileDraft.raceDistance ? Number(profileDraft.raceDistance) : undefined
    const recentRaceTimeSeconds = profileDraft.raceTime ? parseDurationToSeconds(profileDraft.raceTime) ?? undefined : undefined
    let weeks: PlanWeek[]
    try {
      weeks = generatePlan({
        marathonDate: profileDraft.marathonDate,
        length: profileDraft.planLength,
        trainingDays: profileDraft.days,
        includeOptionalFourth: profileDraft.optional,
        optionalTrainingDay: profileDraft.optionalTrainingDay,
        goalTimeSeconds: goalSeconds,
        effectiveStartDate,
      })
    } catch (error) {
      return showToast(error instanceof Error ? error.message : 'Het plan kan niet worden opgebouwd.')
    }
    const displayedWeeks = effectiveStartDate ? mergeRevisedPlanWeeks(selectedAthlete.planWeeks ?? [], weeks, effectiveStartDate) : weeks
    const currentPlanWeek = findCurrentPlanWeek(displayedWeeks)
    const currentWeek = currentPlanWeek?.weekNumber ?? currentWeekNumber(displayedWeeks)
    if (!demoMode) {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId: selectedAthlete.id,
          marathonDate: profileDraft.marathonDate,
          planLength: profileDraft.planLength,
          goalTime: profileDraft.goalTime,
          trainingDays: profileDraft.days,
          includeOptionalFourth: profileDraft.optional,
          optionalTrainingDay: profileDraft.optionalTrainingDay,
          recentRaceDistanceKm,
          recentRaceTimeSeconds,
          recentWeeklyKm,
          recentLongestRunKm,
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) return showToast(result.error ?? 'Het atleetprofiel kon niet worden opgeslagen.')
    }
    const updatedAthlete: AthleteSummary = {
      ...selectedAthlete,
      marathonDate: profileDraft.marathonDate,
      goalTime: profileDraft.goalTime,
      planLength: profileDraft.planLength,
      trainingDays: [...profileDraft.days],
      includeOptionalFourth: profileDraft.optional,
      optionalTrainingDay: profileDraft.optionalTrainingDay,
      recentRaceDistanceKm,
      recentRaceTimeSeconds,
      recentWeeklyKm,
      recentLongestRunKm,
      currentWeek,
      phase: currentPlanWeek?.phase ?? 'Basis',
      plannedThisWeek: effectiveStartDate ? selectedAthlete.plannedThisWeek : currentPlanWeek?.workouts.filter((workout) => !workout.optional).length ?? 0,
      planWeeks: displayedWeeks,
    }
    setData((current) => ({ ...current, athletes: current.athletes.map((athlete) => athlete.id === updatedAthlete.id ? updatedAthlete : athlete) }))
    showToast(effectiveStartDate ? 'Atleetprofiel bijgewerkt. Eerdere trainingen blijven bewaard; de wijziging gaat in op maandag ' + dateLabel(effectiveStartDate, { day: 'numeric', month: 'long' }) + '.' : demoMode ? 'Voorbeeldprofiel bijgewerkt voor ' + updatedAthlete.name + '.' : 'Atleetprofiel bijgewerkt voor ' + updatedAthlete.name + '.')
    if (!demoMode) router.refresh()
  }

  async function addCoachNote(note: string): Promise<boolean> {
    if (!selectedAthlete || !note.trim()) return false
    let savedNote: CoachNote = { id: 'note-' + Date.now(), note: note.trim(), createdAt: new Date().toISOString() }
    if (!demoMode) {
      const response = await fetch('/api/coach/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ athleteId: selectedAthlete.id, note: note.trim() }) })
      const result = await response.json().catch(() => ({})) as { error?: string; note?: { id: string; note: string; createdAt: string } }
      if (!response.ok || !result.note) {
        showToast(result.error ?? 'De coachnotitie kon niet worden opgeslagen.')
        return false
      }
      savedNote = result.note
    }
    const athleteId = selectedAthlete.id
    setData((current) => ({ ...current, athletes: current.athletes.map((athlete) => athlete.id === athleteId ? { ...athlete, coachNotes: [savedNote, ...(athlete.coachNotes ?? [])] } : athlete) }))
    setSelectedAthlete((current) => current?.id === athleteId ? { ...current, coachNotes: [savedNote, ...(current.coachNotes ?? [])] } : current)
    showToast('Coachnotitie opgeslagen.')
    return true
  }

  async function removeSelectedAthlete() {
    if (!selectedAthlete || demoMode || deleteAthleteConfirmation.trim() !== selectedAthlete.name.trim()) return
    setDeletingAthlete(true)
    try {
      const response = await fetch('/api/coach/athletes/' + encodeURIComponent(selectedAthlete.id), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: deleteAthleteConfirmation.trim() }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; auditRecorded?: boolean }
      if (!response.ok) {
        showToast(result.error ?? 'Het atleetaccount kon niet worden verwijderd. Probeer het opnieuw.')
        return
      }

      const removedAthleteId = selectedAthlete.id
      setData((current) => ({
        ...current,
        athletes: current.athletes.filter((athlete) => athlete.id !== removedAthleteId),
        suggestions: current.suggestions.filter((suggestion) => suggestion.athleteId !== removedAthleteId),
      }))
      setSelectedAthlete(null)
      setProfileAthleteId((current) => current === removedAthleteId ? null : current)
      setDeleteAthleteConfirmation('')
      setModal(null)
      setView('athletes')
      showToast(result.auditRecorded === false
        ? 'Atleet en gegevens verwijderd. De interne verwijderregistratie kon niet worden bijgewerkt.'
        : 'Atleet en alle bijbehorende Marathon Coach-gegevens zijn definitief verwijderd.')
      router.refresh()
    } catch {
      showToast('Geen verbinding. Het atleetaccount kon niet worden verwijderd; probeer het opnieuw.')
    } finally {
      setDeletingAthlete(false)
    }
  }

  async function evaluateCoachSuggestions() {
    if (demoMode) return showToast('In dit voorbeeld staan al twee voorstellen klaar om te bekijken.')
    setEvaluatingSuggestions(true)
    try {
      const response = await fetch('/api/coach/suggestions/evaluate', { method: 'POST' })
      const result = await response.json().catch(() => ({})) as { created?: number; error?: string }
      if (!response.ok) return showToast(result.error ?? 'Voorstellen controleren lukte niet.')
      if (result.created) {
        showToast(result.created + (result.created === 1 ? ' nieuw voorstel toegevoegd.' : ' nieuwe voorstellen toegevoegd.'))
        router.refresh()
      } else {
        showToast('Er is nu geen nieuw voorstel nodig.')
      }
    } catch {
      showToast('Voorstellen controleren lukte niet. Probeer het later opnieuw.')
    } finally {
      setEvaluatingSuggestions(false)
    }
  }

  async function updateSuggestion(suggestion: CoachSuggestion, status: CoachSuggestion['status']) {
    let change: string | undefined
    if (status === 'modified') {
      const answer = window.prompt('Welke aangepaste training wil je voorstellen?', suggestion.replacement ?? '')
      if (answer === null) return
      change = answer.trim()
      if (!change) return showToast('Vul de aangepaste training in.')
    }
    if (!demoMode) {
      const response = await fetch('/api/coach/suggestions/' + suggestion.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, change }) })
      if (!response.ok) return showToast('Het voorstel kon niet worden bijgewerkt.')
    }
    setData((current) => ({ ...current, suggestions: current.suggestions.map((item) => item.id === suggestion.id ? { ...item, status, replacement: change ?? item.replacement } : item) }))
    showToast(status === 'accepted' ? 'Voorstel geaccepteerd. Pas de planning waar nodig nog aan.' : status === 'rejected' ? 'Voorstel afgewezen.' : 'Aangepast voorstel opgeslagen.')
  }

  async function inviteAthlete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    if (!email.includes('@')) return showToast('Vul een geldig e-mailadres in.')
    if (!demoMode) {
      const response = await fetch('/api/coach/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: String(form.get('name') ?? '').trim() }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) return showToast(result.error ?? 'Uitnodigen lukte niet. Probeer opnieuw.')
    }
    setModal(null)
    showToast(demoMode ? 'Demo: dit is alleen een voorbeeld; er wordt geen e-mail verstuurd.' : 'Uitnodiging aangevraagd voor ' + email + '.')
  }

  function openCoachPlan(athlete: AthleteSummary) {
    const suggestedDate = new Date()
    suggestedDate.setDate(suggestedDate.getDate() + 16 * 7)
    setSelectedAthlete(athlete)
    setCoachPlanDraft({
      marathonDate: athlete.marathonDate || suggestedDate.toISOString().slice(0, 10),
      goalTime: athlete.goalTime || '04:00:00',
      planLength: athlete.planLength || 16,
      days: [2, 4, 0],
      optional: false,
      optionalTrainingDay: 6,
      raceTime: '',
      raceDistance: '',
      recentWeeklyKm: athlete.recentWeeklyKm ? String(athlete.recentWeeklyKm) : '',
      recentLongestRunKm: athlete.recentLongestRunKm ? String(athlete.recentLongestRunKm) : '',
    })
    setModal('plan')
  }

  const navItems = role === 'athlete'
    ? [{ id: 'week' as const, icon: 'appLogo', label: 'Deze week' }, { id: 'plan' as const, icon: 'plan', label: 'Mijn schema' }, { id: 'history' as const, icon: 'history', label: 'Geschiedenis' }, { id: 'wellness' as const, icon: 'heart', label: 'Herstel & welzijn' }, { id: 'profile' as const, icon: 'user', label: 'Mijn profiel' }]
    : [{ id: 'coach' as const, icon: 'coach', label: 'Overzicht' }]
  const shortMobileLabels: Record<string, string> = { week: 'Week', plan: 'Schema', history: 'Historie', wellness: 'Herstel', profile: role === 'coach' ? 'Atleet' : 'Profiel', coach: 'Overzicht', athletes: 'Atleten', suggestions: 'Voorstel' }
  const mobileNavItems = navItems.map((item) => ({ ...item, mobileLabel: shortMobileLabels[item.id] ?? item.label }))
  const title = view === 'week' ? 'Deze week' : view === 'plan' ? 'Mijn schema' : view === 'history' ? 'Trainingsgeschiedenis' : view === 'wellness' ? 'Herstel & welzijn' : view === 'profile' ? role === 'coach' ? 'Atleetprofiel' : 'Mijn profiel' : view === 'athletes' ? 'Mijn atleten' : view === 'suggestions' ? 'Coachvoorstellen' : view === 'athlete-detail' ? selectedAthlete?.name ?? 'Atleet' : 'Coachoverzicht'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><LogoMark /><div><strong>{BRAND.appName}</strong><span>{BRAND.byline}</span></div></div>
        <div className="sidebar-divider" />
        <nav className="side-nav" aria-label="Hoofdnavigatie">
          {navItems.map((item) => <NavItem key={item.id} icon={item.icon} label={item.label} active={view === item.id || (view === 'athlete-detail' && item.id === 'coach')} onClick={() => go(item.id)} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="coach-card">
            <span className="coach-avatar">{data.profile.name.charAt(0).toUpperCase()}</span>
            <span className="coach-card-identity"><strong>{data.profile.name}</strong><span>{role === 'coach' ? 'Coach' : 'Atleet'}</span></span>
          </div>
          <div className="side-brand-note"><LogoMark small /><span>Train met aandacht.<br />Loop met vertrouwen.</span></div>
        </div>
 …12251 tokens truncated…min' : '') + (step.intensity ? ' · ' + paceIntensityLabel(step.intensity) : '')) + '</p>').join('') +
          '</td></tr>'
        : ''
      return '<table width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;page-break-inside:avoid;margin:0">' +
        '<tr>' +
        '<td width="76%" valign="top" style="width:76%;padding:8pt 7pt 3pt 8pt;border-bottom:1px solid #dfe7ec">' +
        '<p style="margin:0;font-size:10.5pt;font-weight:bold;color:#183247">' + esc(workoutTitleLabel(workout.title) + optional) + '</p>' +
        '<p style="margin:2pt 0 0 0;font-size:8.5pt;color:#63798b">' + esc(dateLabel(workout.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) + '</p>' +
        '</td>' +
        '<td width="24%" valign="top" align="right" style="width:24%;padding:8pt 8pt 3pt 4pt;border-bottom:1px solid #dfe7ec">' +
        '<p style="margin:0;font-size:10pt;font-weight:bold;color:#183247">' + esc(workload) + '</p>' +
        (intensity ? '<p style="margin:2pt 0 0 0;font-size:8pt;color:#456176">' + esc(intensity) + '</p>' : '') +
        '</td>' +
        '</tr>' +
        ((workout.goal || workout.description) ? '<tr><td colspan="2" style="padding:4pt 8pt 3pt 8pt">' +
          (workout.goal ? '<p style="margin:0 0 2pt 0;font-size:9pt;color:#183247"><b>Doel:</b> ' + esc(workout.goal) + '</p>' : '') +
          (workout.description ? '<p style="margin:0;font-size:9pt;color:#456176">' + esc(workout.description) + '</p>' : '') +
          '</td></tr>' : '') +
        stepsHtml +
        '</table>'
    }).join('')

    const weekLabel = 'WEEK ' + String(week.weekNumber).padStart(2, '0') + '  ·  ' + phaseLabel(week.phase) +
      (week.historical ? '  ·  Eerdere planning' : '') + (week.isRecoveryWeek ? '  ·  Herstelweek' : '')
    return '<table width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:13pt 0 0 0;page-break-inside:avoid">' +
      '<tr><td width="5" bgcolor="#D5F36B" style="width:5pt;background:#D5F36B;font-size:1pt">&nbsp;</td>' +
      '<td bgcolor="#EDF4F7" style="padding:7pt 9pt;background:#EDF4F7">' +
      '<p style="margin:0;font-size:8pt;font-weight:bold;letter-spacing:1pt;color:#63798b;mso-pagination:keep-with-next">' + esc(weekLabel) + '</p>' +
      '<p style="margin:2pt 0 0 0;font-size:10pt;font-weight:bold;color:#183247;mso-pagination:keep-with-next">' + esc(week.goal) + '</p>' +
      '</td></tr></table>' +
      (workoutsHtml || '<p style="margin:7pt 8pt;font-size:9pt;color:#63798b">Geen trainingen in deze week.</p>')
  }).join('')

  const generatedDate = dateLabel(todayDateISO(), { day: 'numeric', month: 'long', year: 'numeric' })
  return '<!DOCTYPE html><html lang="nl-NL" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><meta name="ProgId" content="Word.Document"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Marathonschema - ' + esc(athleteName) + '</title><style>' + css + '</style></head><body>' +
    '<div class="WordSection1">' +
    '<table width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>' +
    '<td width="64" valign="middle" style="width:64pt;padding:0 9pt 0 0">' + logo + '</td>' +
    '<td valign="middle" style="padding:0"><p style="margin:0;font-size:16pt;font-weight:bold;color:#183247">Marathon Coach</p><p style="margin:2pt 0 0 0;font-size:8.5pt;color:#63798b">Persoonlijke marathonbegeleiding</p></td>' +
    '<td width="110" valign="middle" align="right" style="width:110pt"><p style="margin:0;font-size:8pt;font-weight:bold;letter-spacing:1pt;color:#63798b">TRAININGSPLAN</p></td>' +
    '</tr><tr><td colspan="3" height="5" bgcolor="#D5F36B" style="height:4pt;background:#D5F36B;font-size:1pt;line-height:1pt">&nbsp;</td></tr></table>' +
    '<p class="page-title" style="margin:16pt 0 3pt 0;font-size:8pt;font-weight:bold;letter-spacing:1.2pt;color:#63798b">JOUW TRAININGSPLAN</p>' +
    '<p style="margin:0;font-size:21pt;line-height:1.15;font-weight:bold;color:#183247">Marathonschema voor ' + esc(athleteName) + '</p>' +
    '<p style="margin:4pt 0 12pt 0;font-size:9.5pt;color:#63798b">Een persoonlijk schema, ingesteld door je coach.</p>' +
    '<table width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 12pt 0"><tr>' +
    '<td width="33%" valign="top" style="width:33%;padding:7pt 8pt;border:1px solid #dae4ec;background:#f5f8fa"><p style="margin:0;font-size:7.5pt;color:#63798b">MARATHONDATUM</p><p style="margin:2pt 0 0 0;font-size:10pt;font-weight:bold;color:#183247">' + esc(dateLabel(plan.marathonDate, { day: 'numeric', month: 'long', year: 'numeric' })) + '</p></td>' +
    '<td width="34%" valign="top" style="width:34%;padding:7pt 8pt;border:1px solid #dae4ec;background:#f5f8fa"><p style="margin:0;font-size:7.5pt;color:#63798b">DOELTIJD</p><p style="margin:2pt 0 0 0;font-size:10pt;font-weight:bold;color:#183247">' + esc(formatTime(plan.goalTime)) + '</p></td>' +
    '<td width="33%" valign="top" style="width:33%;padding:7pt 8pt;border:1px solid #dae4ec;background:#f5f8fa"><p style="margin:0;font-size:7.5pt;color:#63798b">OPBOUW</p><p style="margin:2pt 0 0 0;font-size:10pt;font-weight:bold;color:#183247">' + esc(String(plan.length)) + ' weken</p></td>' +
    '</tr></table>' +
    '<p style="margin:0 0 4pt 0;font-size:13pt;font-weight:bold;color:#183247">Trainingsweken</p>' +
    weeksHtml +
    '<table width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:17pt 0 0 0;page-break-inside:avoid">' +
    '<tr><td height="3" bgcolor="#D5F36B" style="height:3pt;background:#D5F36B;font-size:1pt;line-height:1pt">&nbsp;</td></tr>' +
    '<tr><td style="padding:7pt 0 0 0">' +
    '<p style="margin:0 0 4pt 0;font-size:8.5pt;color:#456176"><b>Opbouw:</b> Dit schema is gebaseerd op de trainingsopbouw van All4Running en door je coach persoonlijk ingesteld. Dit is geen officieel All4Running-document.</p>' +
    '<p style="margin:0 0 4pt 0;font-size:8.5pt;color:#456176"><b>Belangrijk:</b> Dit schema is een richtlijn en geen medisch advies. Pas trainingen aan bij klachten of herstelproblemen en bespreek twijfel met je coach.</p>' +
    '<p style="margin:8pt 0 0 0;font-size:8pt;color:#8396a7">Aangemaakt op ' + esc(generatedDate) + ' · Marathon Coach</p>' +
    '</td></tr></table>' +
    '</div></body></html>'
}

function LinkedActivitySummary({ activity }: { activity: RunActivity }) {
  const details = [
    dateLabel(activity.startedAt),
    activity.distanceKm ? activity.distanceKm.toFixed(1).replace('.', ',') + ' km' : undefined,
    activity.durationMinutes + ' min',
    activity.pace ? activity.pace + ' /km' : undefined,
    activity.averageHeartRate ? Math.round(activity.averageHeartRate) + ' bpm gemiddeld' : undefined,
  ].filter(Boolean).join(' · ')
  return <div className="linked-activity-summary"><strong>Uitgevoerde activiteit · {activitySourceLabel(activity.source)}</strong><span>{details}</span>{activity.laps?.length ? <ActivityLapDetails laps={activity.laps} /> : null}</div>
}

function formatLapDuration(minutes: number): string {
  const seconds = Math.round(minutes * 60)
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

function ActivityLapDetails({ laps }: { laps: NonNullable<RunActivity['laps']> }) {
  return <details className="lap-details linked-activity-laps"><summary>Bekijk {laps.length} rondes of blokken</summary><div className="lap-table linked-lap-table"><div className="linked-lap-heading"><span>Ronde/blok</span><span>Duur</span><span>Afstand</span><span>Tempo</span><span>Hartslag</span></div>{laps.map((lap) => <div key={lap.id}><span>{lap.label}</span><span>{lap.durationMinutes ? formatLapDuration(lap.durationMinutes) : '—'}</span><span>{lap.distanceKm ? lap.distanceKm.toFixed(2).replace('.', ',') + ' km' : '—'}</span><span>{lap.pace ? lap.pace + ' /km' : '—'}</span><span>{lap.averageHeartRate ? Math.round(lap.averageHeartRate) + ' bpm' : '—'}</span></div>)}</div></details>
}

type HistoryItem = { id: string; date: string; activity?: RunActivity; workout?: PlanWeek['workouts'][number] }

function buildHistoryItems(activities: RunActivity[], workouts: PlanWeek['workouts']): HistoryItem[] {
  const cutoffDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const activityItems: HistoryItem[] = activities.map((activity) => ({
    id: 'activity:' + activity.id,
    date: activity.startedAt,
    activity,
    workout: activity.plannedWorkoutId ? workouts.find((workout) => workout.id === activity.plannedWorkoutId) : undefined,
  }))
  const linkedWorkoutIds = new Set(activities.map((activity) => activity.plannedWorkoutId).filter((id): id is string => Boolean(id)))
  const feedbackItems: HistoryItem[] = workouts
    .filter((workout) => workout.status === 'completed' && !linkedWorkoutIds.has(workout.id))
    .map((workout) => ({ id: 'workout:' + workout.id, date: workout.feedback?.completedAt ?? workout.date, workout }))
    .filter((item) => item.date.slice(0, 10) >= cutoffDate)
  return [...activityItems, ...feedbackItems].sort((a, b) => b.date.localeCompare(a.date))
}

function HistoryView({ activities, workouts, onEditWorkout, onAdd }: { activities: RunActivity[]; workouts: PlanWeek['workouts']; onEditWorkout: (workoutId: string) => void; onAdd: () => void }) {
  const items = buildHistoryItems(activities, workouts)
  return <section className="history-page"><div className="history-toolbar"><div className="filter-chip active">Laatste 30 dagen</div><button className="button button-outline button-small" onClick={onAdd}><Icon name="plus" size={15} /> Handmatig toevoegen</button></div>{items.length ? <div className="history-list">{items.map((item) => {
    const { activity, workout } = item
    const effort = activity?.effort ?? workout?.feedback?.effort
    const note = activity?.note ?? workout?.feedback?.note
    return <article className="history-card" key={item.id}><div className="history-date"><strong>{dateLabel(item.date, { day: 'numeric' })}</strong><span>{dateLabel(item.date, { month: 'short' })}</span></div><div className={'history-activity-icon' + (workout ? ' type-' + workout.type : '')}><Icon name={workout ? workoutIconName(workout.type) : 'runner'} size={18} /></div><div className="history-main"><div className="history-title-row"><h3>{activity?.name ?? workout?.title ?? 'Hardlooptraining'}</h3><span className={'source-pill ' + (activity ? 'source-' + activity.source : 'source-completed')}>{activity ? activitySourceLabel(activity.source) : 'Schema'}</span></div>{activity ? <div className="history-meta"><span>{activity.distanceKm ? activity.distanceKm.toFixed(1).replace('.', ',') + ' km' : 'Afstand niet ingevuld'}</span><span>{activity.durationMinutes} min</span>{activity.pace && <span>{activity.pace} /km</span>}{activity.averageHeartRate && <span>{activity.averageHeartRate} bpm gem.</span>}</div> : <p className="history-note completed-workout-note">Als uitgevoerd gemarkeerd in je schema.</p>}{effort && <p className="history-feedback"><span>Gevoel</span>{effortLabel(effort)}</p>}{note && <p className="history-note">{note}</p>}{activity?.laps && activity.laps.length > 0 && <ActivityLapDetails laps={activity.laps} />}{workout && <div className="history-entry-actions"><button type="button" className="button button-outline button-small" onClick={() => onEditWorkout(workout.id)}>{workout.feedback ? 'Feedback aanpassen' : 'Feedback toevoegen'}</button></div>}</div><span className={'history-link-status ' + (activity?.plannedWorkoutId ? 'linked' : workout ? 'linked' : 'unlinked')}>{activity?.plannedWorkoutId ? 'Gekoppeld' : workout ? 'Uitgevoerd' : 'Losse activiteit'}</span></article>
  })}</div> : <div className="empty-state"><div className="empty-plan-mark"><Icon name="history" size={24} /></div><h3>Nog geen trainingen</h3><p>Voeg na je training kort de belangrijkste gegevens toe.</p><button className="button button-primary button-small" onClick={onAdd}><Icon name="plus" size={15} /> Handmatig toevoegen</button></div>}</section>
}

function TrainingDaysControl({ draft, setDraft, disabled = false }: { draft: ProfileDraft; setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>; disabled?: boolean }) {
  const availableOptionalDays = TRAINING_DAYS.filter((day) => !draft.days.includes(day.value))

  function toggleOptional(enabled: boolean) {
    setDraft((current) => {
      const optionalTrainingDay = enabled && current.days.includes(current.optionalTrainingDay)
        ? (TRAINING_DAYS.find((day) => !current.days.includes(day.value))?.value ?? 6)
        : current.optionalTrainingDay
      return { ...current, optional: enabled, optionalTrainingDay }
    })
  }

  return (
    <>
      <div className="field full">
        <span>Vaste trainingsdagen <small>{draft.days.length}/3 gekozen</small></span>
        <div className="day-options">
          {TRAINING_DAYS.map((day) => (
            <button
              type="button"
              key={day.value}
              aria-pressed={draft.days.includes(day.value)}
              className={draft.days.includes(day.value) ? 'selected' : ''}
              disabled={disabled}
              onClick={() => toggleProfileDay(setDraft, day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>
        <small className="day-selection-hint">{disabled ? 'Je coach beheert deze trainingsdagen.' : 'Selecteer of deselecteer dagen. Je kunt eerst een nieuwe dag kiezen en daarna een oude uitzetten; opslaan vraagt precies drie dagen.'}</small>
      </div>
      <label className="optional-setting full">
        <input type="checkbox" checked={draft.optional} disabled={disabled} onChange={(event) => toggleOptional(event.target.checked)} />
        <span><strong>Optionele vierde training beschikbaar</strong><small>Rustige herstelduurloop of korte techniektraining.</small></span>
      </label>
      {draft.optional && (
        <div className="field full">
          <span>Dag van de optionele training <small>kies een dag buiten je vaste dagen</small></span>
          <div className="day-options">
            {availableOptionalDays.map((day) => (
              <button
                type="button"
                key={day.value}
                aria-pressed={draft.optionalTrainingDay === day.value}
                className={draft.optionalTrainingDay === day.value ? 'selected' : ''}
                disabled={disabled}
                onClick={() => setDraft((current) => ({ ...current, optionalTrainingDay: day.value }))}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function WellnessView({ wellness, draft, setDraft, onSubmit }: { wellness: WellnessEntry[]; draft: WellnessDraft; setDraft: React.Dispatch<React.SetStateAction<WellnessDraft>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const entryDate = todayDateISO()
  const diaryEntries = [...wellness].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="wellness-layout">
      <section className="wellness-form-card">
        <div className="section-heading">
          <div><h2>Hoe is je herstel?</h2></div>
          <span className="wellness-icon-large"><Icon name="heart" size={22} /></span>
        </div>
        <div className="wellness-form-meta"><div className="wellness-form-date"><Icon name="clock" size={16} /><span><small>Invoerdatum</small><strong>{dateLabel(entryDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></span></div><span className="wellness-sharing-note"><Icon name="shield" size={14} /> Je coach kan deze gegevens zien</span></div>
        <form onSubmit={onSubmit} className="wellness-form">
          <label className="field"><span>Slaapduur <small>uur</small></span><input type="number" min="0" max="24" step="0.25" value={draft.sleepHours} onChange={(event) => setDraft({ ...draft, sleepHours: event.target.value })} placeholder="Bijv. 7,5" /></label>
          <label className="field"><span>Rusthartslag <small>bpm</small></span><input type="number" min="25" max="220" value={draft.restingHeartRate} onChange={(event) => setDraft({ ...draft, restingHeartRate: event.target.value })} placeholder="Bijv. 54" /></label>
          <div className="field full"><span>Herstelgevoel</span><div className="recovery-select">{RECOVERY_LABELS.map((label, index) => { const value = index + 1; return <button type="button" key={value} aria-label={'Herstelgevoel: ' + label} aria-pressed={draft.recoveryScore === String(value)} className={'mood-' + value + (draft.recoveryScore === String(value) ? ' selected' : '')} onClick={() => setDraft({ ...draft, recoveryScore: draft.recoveryScore === String(value) ? '' : String(value) })}><span className="recovery-icon"><Icon name={'mood' + value} size={22} /></span><small>{label}</small></button> })}</div></div>
          <label className="field full"><span>Korte opmerking <small>optioneel</small></span><textarea rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Bijvoorbeeld: drukke werkweek, voelde me fris tijdens het lopen" /></label>
          <div className="form-actions full"><button className="button button-primary">Opslaan</button></div>
        </form>
      </section>
      <aside className="wellness-side">
        <div className="wellness-history wellness-diary">
          <div className="wellness-diary-heading"><div><p className="eyebrow">HERSTEL & WELZIJN</p><h2>Jouw dagboek</h2></div><span>{diaryEntries.length} {diaryEntries.length === 1 ? 'dag' : 'dagen'}</span></div>
          {diaryEntries.length ? <div className="wellness-diary-list">{diaryEntries.map((entry) => <article className="wellness-diary-entry" key={entry.id}>
            <div className="wellness-diary-entry-heading"><strong>{dateLabel(entry.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><span className={entry.visibleToCoach ? 'shared' : ''}>{entry.visibleToCoach ? 'Gedeeld met coach' : 'Privé'}</span></div>
            <div className="wellness-diary-metrics">
              {entry.sleepHours !== undefined && <span><small>Slaap</small><strong>{String(entry.sleepHours).replace('.', ',')} uur</strong></span>}
              {entry.restingHeartRate !== undefined && <span><small>Rusthartslag</small><strong>{entry.restingHeartRate} bpm</strong></span>}
              {entry.recoveryScore !== undefined && <span><small>Herstelgevoel</small><RecoveryMood value={entry.recoveryScore} size={16} /></span>}
            </div>
            {entry.note && <p className="wellness-diary-note">{entry.note}</p>}
          </article>)}</div> : <p className="wellness-diary-empty">Je opgeslagen herstelgegevens verschijnen hier per dag.</p>}
        </div>
      </aside>
    </div>
  )
}

function AthleteIdentityForm({ data, draft, setDraft, onSubmit }: { data: DashboardData; draft: AthleteIdentityDraft; setDraft: React.Dispatch<React.SetStateAction<AthleteIdentityDraft>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <section className="profile-form-card athlete-personal-card">
    <div className="section-heading"><div><p className="eyebrow">PERSOONLIJKE GEGEVENS</p><h2>Mijn gegevens</h2></div><span className="profile-avatar">{draft.name.charAt(0) || 'A'}</span></div>
    <form className="form-grid" onSubmit={onSubmit}>
      <label className="field"><span>Naam</span><input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Je naam" /></label>
      <label className="field"><span>E-mailadres <small>account</small></span><input type="email" readOnly value={data.profile.email ?? ''} placeholder="Niet beschikbaar" /></label>
      <label className="field"><span>Leeftijd <small>jaar · optioneel</small></span><input type="number" min={1} max={120} step={1} value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} placeholder="Bijv. 35" /></label>
      <div className="form-actions full"><button className="button button-primary">Gegevens opslaan</button></div>
    </form>
  </section>
}

function ProfileView({ data, role, athletes, selectedAthlete, onSelectAthlete, draft, setDraft, paces, onSubmit, identityDraft, setIdentityDraft, onSaveIdentity }: { data: DashboardData; role: AppRole; athletes: AthleteSummary[]; selectedAthlete: AthleteSummary | null; onSelectAthlete: (id: string) => void; draft: ProfileDraft; setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>; paces: ReturnType<typeof calculateTrainingPaces>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; identityDraft?: AthleteIdentityDraft; setIdentityDraft?: React.Dispatch<React.SetStateAction<AthleteIdentityDraft>>; onSaveIdentity?: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const planLocked = role !== 'coach' || !selectedAthlete
  return (
    <div className="profile-layout">
      <div className="profile-main-column">
      <form className="profile-form-card" onSubmit={(event) => { event.preventDefault(); if (role === 'coach' && selectedAthlete) onSubmit(event) }}>
        <div className="section-heading">
          <div><p className="eyebrow">MARATHONINSTELLINGEN</p><h2>{role === 'coach' ? 'Atleetinstellingen' : 'Jouw startpunt'}</h2></div>
          <span className="profile-avatar">{(role === 'coach' ? selectedAthlete?.name : data.profile.name)?.charAt(0) ?? 'A'}</span>
        </div>
        {role === 'coach' && selectedAthlete && <input type="hidden" name="athleteId" value={selectedAthlete.id} />}
        {role === 'coach' && !selectedAthlete && <label className="field full"><span>Atleet</span><select name="athleteId" aria-label="Atleet selecteren" required value="" onChange={(event) => onSelectAthlete(event.target.value)}><option value="" disabled>Kies een atleet</option>{[...athletes].sort((a, b) => a.name.localeCompare(b.name, 'nl')).map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}{athlete.email ? ' (' + athlete.email + ')' : ''}</option>)}</select></label>}
        {role === 'coach' && !selectedAthlete ? <p className="plan-timing-note">Selecteer een atleet om diens schema-instellingen te bekijken of aan te passen.</p> : null}
        <div className="form-row">
          <label className="field"><span>Marathondatum</span><input type="date" min={todayDateISO()} required value={draft.marathonDate} disabled={planLocked} onChange={(event) => setDraft({ ...draft, marathonDate: event.target.value })} /></label>
          <label className="field"><span>Gewenste streeftijd <small>uu:mm:ss</small></span><input required pattern="\d{2}:\d{2}:\d{2}" value={draft.goalTime} readOnly={planLocked} onChange={(event) => setDraft({ ...draft, goalTime: event.target.value })} placeholder="04:00:00" /></label>
        </div>
        <PlanTimingNote draft={draft} revision={role === 'coach' && Boolean(selectedAthlete?.planWeeks?.length)} readOnly={role === 'athlete'} />
        <div className="field full">
          <span>Planlengte</span>
          <div className="plan-length-options">{([12, 16, 20] as const).map((length) => <button type="button" key={length} aria-pressed={draft.planLength === length} className={draft.planLength === length ? 'selected' : ''} onClick={() => setDraft({ ...draft, planLength: length })} disabled={planLocked}><strong>{length}</strong><span>weken</span></button>)}</div>
        </div>
        <TrainingDaysControl draft={draft} setDraft={setDraft} disabled={planLocked} />
        <div className="field full">
          <span>Recente wedstrijd <small>voor een eerste tempo-indicatie · optioneel</small></span>
          <div className="form-row">
            <label className="field"><span>Afstand <small>km</small></span><input type="number" min="1" step="0.1" aria-label="Wedstrijdafstand in kilometers" value={draft.raceDistance} readOnly={planLocked} onChange={(event) => setDraft({ ...draft, raceDistance: event.target.value })} placeholder="10" /></label>
            <label className="field"><span>Tijd <small>min:sec of uu:mm:ss</small></span><input value={draft.raceTime} aria-label="Wedstrijdtijd" readOnly={planLocked} onChange={(event) => setDraft({ ...draft, raceTime: event.target.value })} placeholder="50:00" /></label>
          </div>
        </div>
        {role === 'coach' && <div className="field full"><span>Recente trainingsbasis <small>optioneel, afgelopen 4 weken</small></span><div className="form-row"><label className="field"><span>Gemiddelde weekomvang <small>km per week</small></span><input type="number" min="0.1" max="300" step="0.1" value={draft.recentWeeklyKm} readOnly={planLocked} onChange={(event) => setDraft({ ...draft, recentWeeklyKm: event.target.value })} placeholder="Bijv. 35" /></label><label className="field"><span>Langste duurloop <small>km</small></span><input type="number" min="0.1" max="100" step="0.1" value={draft.recentLongestRunKm} readOnly={planLocked} onChange={(event) => setDraft({ ...draft, recentLongestRunKm: event.target.value })} placeholder="Bijv. 18" /></label></div><small className="plan-context-hint">Deze gegevens helpen de startbelasting te beoordelen. Ze passen het schema zelf niet automatisch aan.</small></div>}
        {role === 'coach' && selectedAthlete && <small className="plan-context-hint">Dit schema wordt opgeslagen voor {selectedAthlete.name}{selectedAthlete.email ? ' (' + selectedAthlete.email + ')' : ''}.</small>}
         {role === 'coach' && <button className="button button-primary" disabled={!selectedAthlete}>Schema opslaan voor {selectedAthlete?.name ?? 'atleet'} <Icon name="arrow" size={16} /></button>}
      </form>
      {role === 'athlete' && identityDraft && setIdentityDraft && onSaveIdentity && <AthleteIdentityForm data={data} draft={identityDraft} setDraft={setIdentityDraft} onSubmit={onSaveIdentity} />}
      </div>
      <aside className="profile-side">
        <div className="profile-help"><span className="aside-icon lime"><Icon name="spark" /></span><h3>Praattempo</h3><p>Gebruik je ademhaling naast tempo en hartslag om je inspanning in te schatten.</p><TalkTestGuide /><small className="talk-test-note">Een praktische richtlijn; wind, warmte en vermoeidheid tellen ook mee.</small></div>
        <details className="zone-reference"><summary><span><strong>Hartslagzones</strong><small>Open voor uitleg bij de zone-indeling</small></span><Icon name="chevron" size={18} /></summary><div className="zone-reference-list"><div><b>Z1</b><span><strong>Rustig</strong><small>&lt;75% · makkelijk praten</small></span></div><div><b>Z2</b><span><strong>Gecontroleerd</strong><small>75–82% · zinnen worden korter</small></span></div><div><b>Z3</b><span><strong>Vlot / stevig</strong><small>82–88% · korte zinnen</small></span></div><div><b>Z4</b><span><strong>Intensief</strong><small>89–92% · enkele woorden</small></span></div><div><b>Z5</b><span><strong>Korte versnelling</strong><small>&gt;92% · zwaar hijgen</small></span></div></div><p className="zone-note">Percentages zijn een richtlijn op basis van maximale hartslag. Gebruik ook je ademhaling en ervaren inspanning; hartslag hoeft niet ingevuld te zijn.</p><a className="zone-source" href="https://all4running.nl/blog/app/uploads/2025/05/HardloopschemaMarathonGevorderd.pdf" target="_blank" rel="noreferrer">Bekijk de bron van deze zone-indeling <span>↗</span></a></details>
        <details className="zone-reference pace-reference"><summary><span><strong>Tempozones</strong><small>Open voor jouw tempo-indicaties</small></span><Icon name="chevron" size={18} /></summary><div className="pace-preview"><div><span className="small-label">TEMPO-INDICATIES</span><span className="pace-preview-note">Richtlijnen op basis van je recente wedstrijd en marathondoel. Zie ze als startpunt; pas aan op gevoel en omstandigheden.</span></div>{paces ? <div className="pace-preview-grid"><span><small>Rustige duur</small><b>{formatPace(paces.easy[0])}–{formatPace(paces.easy[1])} /km</b></span><span><small>Marathontempo</small><b>{formatPace(paces.marathon)} /km</b></span><span><small>Stevig tempo</small><b>{formatPace(paces.threshold[0])}–{formatPace(paces.threshold[1])} /km</b></span><span><small>Intervaltempo</small><b>{formatPace(paces.interval[0])}–{formatPace(paces.interval[1])} /km</b></span></div> : <p className="muted">Vul links een recente wedstrijdafstand en -tijd in, bijvoorbeeld 10 km in 50:00.</p>}</div></details>
        <div className="profile-footnote"><Icon name="shield" size={16} /><span>Je account en trainingsgegevens zijn alleen zichtbaar volgens de coach-atleettoewijzing.</span></div>
      </aside>
    </div>
  )
}

function CoachView({ data, onAthlete, onInvite }: { data: DashboardData; onAthlete: (athlete: AthleteSummary) => void; onInvite: () => void }) {
  const planned = data.athletes.reduce((sum, athlete) => sum + athlete.plannedThisWeek, 0)
  const completed = data.athletes.reduce((sum, athlete) => sum + athlete.completedThisWeek, 0)
  const attention = data.athletes.filter((athlete) => athlete.risk !== 'green').length
  return <div className="coach-view">
    <div className="stat-grid coach-overview-stats"><StatCard label="Atleten" value={String(data.athletes.length)} detail="in jouw groep" icon="people" /><StatCard label="Trainingen deze week" value={completed + ' / ' + planned} detail="uitgevoerd / gepland" icon="week" tone="lime" /><StatCard label="Aandacht nodig" value={String(attention)} detail="bekijk de context" icon="heart" tone="orange" /></div>
    <section className="coach-athletes-panel"><div className="section-heading"><div><p className="eyebrow">JOUW GROEP</p><h2>Atleten</h2></div><button className="button button-outline button-small" onClick={onInvite}><Icon name="plus" size={15} /> Atleet uitnodigen</button></div>
      {data.athletes.length ? <AthleteRows athletes={data.athletes} onAthlete={onAthlete} /> : <div className="empty-state"><div className="empty-plan-mark"><Icon name="people" size={24} /></div><h3>Nog geen atleten</h3><p>Nodig een atleet uit om diens schema hier te beheren.</p><button className="button button-primary button-small" onClick={onInvite}><Icon name="plus" size={15} /> Atleet uitnodigen</button></div>}
    </section>
  </div>
}

function AthleteRows({ athletes, onAthlete }: { athletes: AthleteSummary[]; onAthlete: (athlete: AthleteSummary) => void }) {
  return <div className="athlete-rows">{athletes.map((athlete) => <button className="athlete-row" key={athlete.id} onClick={() => onAthlete(athlete)}><span className="athlete-avatar">{athlete.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="athlete-row-main"><strong>{athlete.name}{athlete.email && <span className="athlete-email"> ({athlete.email})</span>}</strong><small>Week {String(athlete.currentWeek).padStart(2, '0')} · {athlete.phase}</small></span><span className="athlete-row-progress"><span><b>{athlete.completedThisWeek}</b>/{athlete.plannedThisWeek} trainingen</span><i><em style={{ width: (athlete.plannedThisWeek > 0 ? Math.min(100, Math.round((athlete.completedThisWeek / athlete.plannedThisWeek) * 100)) : 0) + '%' }} /></i></span><span className={'risk-indicator risk-' + athlete.risk}><i />{athlete.risk === 'green' ? 'Op schema' : athlete.risk === 'orange' ? 'Aandacht' : 'Actie nodig'}</span><Icon name="arrow" size={17} /></button>)}</div>
}

function AthletesView({ athletes, onAthlete, onInvite }: { athletes: AthleteSummary[]; onAthlete: (athlete: AthleteSummary) => void; onInvite: () => void }) {
  return <section className="athletes-page"><div className="section-heading"><div><p className="eyebrow">TOEGEWEZEN ATLETEN</p><h2>Begeleiding in één overzicht</h2></div><button className="button button-primary button-small" onClick={onInvite}><Icon name="plus" size={15} /> Atleet uitnodigen</button></div><p className="muted">Statuskleuren zijn ondersteunende signalen. Bekijk altijd de context en het verloop.</p><AthleteRows athletes={athletes} onAthlete={onAthlete} /></section>
}

function SuggestionCard({ suggestion, onUpdate, compact = false }: { suggestion: CoachSuggestion; onUpdate: (suggestion: CoachSuggestion, status: CoachSuggestion['status']) => void; compact?: boolean }) {
  return <article className={'suggestion-card' + (compact ? ' compact' : '')}><div className="suggestion-top"><span className="suggestion-avatar">{suggestion.athleteName.split(' ').map((part) => part[0]).join('')}</span><div><strong>{suggestion.athleteName}</strong><span>{dateLabel(suggestion.createdAt, { day: 'numeric', month: 'short' })}</span></div><span className={'suggestion-status status-' + suggestion.status}>{suggestion.status === 'pending' ? 'Te beoordelen' : suggestion.status === 'accepted' ? 'Geaccepteerd' : suggestion.status === 'modified' ? 'Aangepast' : 'Afgewezen'}</span></div><h3>{suggestion.title}</h3><p>{suggestion.reason}</p>{suggestion.replacement && <div className="suggestion-replacement"><span>Voorstel</span><strong>{suggestion.replacement}</strong></div>}{suggestion.status === 'pending' && <div className="suggestion-actions"><button className="button button-primary button-small" onClick={() => onUpdate(suggestion, 'accepted')}>Accepteren</button><button className="button button-outline button-small" onClick={() => onUpdate(suggestion, 'modified')}>Aanpassen</button><button className="text-button subtle" onClick={() => onUpdate(suggestion, 'rejected')}>Afwijzen</button></div>}</article>
}

function SuggestionsView({ suggestions, onUpdate, onEvaluate, evaluating }: { suggestions: CoachSuggestion[]; onUpdate: (suggestion: CoachSuggestion, status: CoachSuggestion['status']) => void; onEvaluate: () => void; evaluating: boolean }) {
  return <section className="suggestions-page"><div className="section-heading"><div><p className="eyebrow">BEOORDELING DOOR DE COACH</p><h2>Wijzigingen blijven jouw keuze</h2></div><div className="form-actions"><span className="proposal-count">{suggestions.filter((item) => item.status === 'pending').length} open</span><button className="button button-outline button-small" onClick={onEvaluate} disabled={evaluating}>{evaluating ? 'Controleren…' : 'Voorstellen controleren'}</button></div></div><div className="suggestion-list">{suggestions.map((item) => <SuggestionCard key={item.id} suggestion={item} onUpdate={onUpdate} />)}</div>{suggestions.length === 0 && <div className="empty-state"><h3>Geen voorstellen</h3><p>Als feedback of verloop aandacht vraagt, verschijnt een voorstel hier.</p></div>}</section>
}

function AthleteIdentitySummary({ athlete }: { athlete: AthleteSummary }) {
  return <section className="athlete-identity-card">
    <div className="section-heading"><div><p className="eyebrow">PERSOONLIJKE GEGEVENS</p><h2>{athlete.name}</h2></div><span className="athlete-avatar">{athlete.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span></div>
    <div className="athlete-identity-grid"><div><small>E-mailadres</small><strong>{athlete.email || 'Niet beschikbaar'}</strong></div><div><small>Leeftijd</small><strong>{athlete.age ? athlete.age + ' jaar' : 'Nog niet ingevuld'}</strong></div></div>
  </section>
}

type AthleteDetailTab = 'plan' | 'history' | 'profile'

function AthleteDetail({ athlete, data, onBack, onSetupPlan, onAddNote, profileContent, onRemove, canRemove }: { athlete: AthleteSummary; data: DashboardData; onBack: () => void; onSetupPlan: () => void; onAddNote: (note: string) => Promise<boolean>; profileContent: React.ReactNode; onRemove: () => void; canRemove: boolean }) {
  const [noteDraft, setNoteDraft] = useState('')
  const [activeTab, setActiveTab] = useState<AthleteDetailTab>('plan')
  const recent = (athlete.activities ?? data.activities).slice(0, 30)
  const planWeeks = athlete.planWeeks ?? []
  const historyItems = buildHistoryItems(recent, planWeeks.flatMap((week) => week.workouts))

  async function submitCoachNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = noteDraft.trim()
    if (note && await onAddNote(note)) setNoteDraft('')
  }

  return <section className="athlete-detail-page">
    <button className="text-button back-button" onClick={onBack}>← Terug naar overzicht</button>
    <div className="athlete-detail-hero">
      <span className="athlete-avatar large">{athlete.name.split(' ').map((part) => part[0]).join('')}</span>
      <div><p className="eyebrow">ATLEETPROFIEL</p><h2>{athlete.name}{athlete.email && <span className="athlete-email"> ({athlete.email})</span>}</h2><span>{athlete.marathonDate ? 'Marathon ' + dateLabel(athlete.marathonDate, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Nog geen schema ingesteld'}{athlete.goalTime ? ' · doel ' + formatTime(athlete.goalTime) : ''}</span></div>
      <span className={'risk-indicator risk-' + athlete.risk}><i />{athlete.risk === 'green' ? 'Op schema' : athlete.risk === 'orange' ? 'Aandacht' : 'Actie nodig'}</span>
    </div>
    <div className="athlete-detail-tabs" role="tablist" aria-label={'Gegevens van ' + athlete.name}>
      <button type="button" role="tab" aria-selected={activeTab === 'plan'} className={activeTab === 'plan' ? 'active' : ''} onClick={() => setActiveTab('plan')}><Icon name="plan" size={16} /> Schema</button>
      <button type="button" role="tab" aria-selected={activeTab === 'history'} className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}><Icon name="history" size={16} /> Geschiedenis</button>
      <button type="button" role="tab" aria-selected={activeTab === 'profile'} className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}><Icon name="user" size={16} /> Atleetprofiel</button>
    </div>
    {activeTab === 'plan' && <div className="athlete-detail-panel">
      <div className="detail-plan-actions"><button className="button button-outline button-small" onClick={onSetupPlan}><Icon name="plan" size={15} /> Plan instellen of bijwerken</button></div>
      <div className="stat-grid detail-stats">
        <StatCard label="Trainingsweek" value={String(athlete.currentWeek).padStart(2, '0') + ' / ' + athlete.planLength} detail={athlete.phase} icon="plan" />
        <StatCard label="Deze week" value={athlete.completedThisWeek + ' / ' + athlete.plannedThisWeek} detail="trainingen uitgevoerd" icon="week" tone="lime" />
        <StatCard label="Lange duurloop" value={athlete.lastLongRun?.split('·').pop()?.trim() ?? '—'} detail={athlete.lastLongRun ?? 'nog niet geregistreerd'} icon="runner" tone="lavender" />
        <StatCard label="Laatste feedback" value={athlete.lastFeedback ?? 'Nog geen feedback'} detail={athlete.lastActivity ?? 'Geen recente activiteit'} icon="heart" tone="orange" />
      </div>
      {athlete.reason && <div className="attention-note"><Icon name="spark" size={18} /><span><strong>Coachcontext</strong>{athlete.reason}</span></div>}
      {(athlete.recentWeeklyKm || athlete.recentLongestRunKm) && <div className="attention-note training-baseline"><Icon name="runner" size={18} /><span><strong>Recente trainingsbasis</strong>{athlete.recentWeeklyKm ? athlete.recentWeeklyKm + ' km per week' : ''}{athlete.recentWeeklyKm && athlete.recentLongestRunKm ? ' · ' : ''}{athlete.recentLongestRunKm ? 'langste duurloop ' + athlete.recentLongestRunKm + ' km' : ''}. Gebruik dit als context bij de beoordeling van de startweken.</span></div>}
      {planWeeks.length > 0 ? <section className="coach-plan-timeline">
        <div className="section-heading"><div><p className="eyebrow">PLANNING</p><h2>Volledig trainingsplan</h2></div></div>
        <div className="plan-week-list">{planWeeks.map((week) => {
          const completed = week.workouts.filter((workout) => workout.status === 'completed').length
          return <details className="plan-week" key={week.weekNumber} open={week.weekNumber === athlete.currentWeek}>
            <summary><span className="plan-week-number">{String(week.weekNumber).padStart(2, '0')}</span><span className="plan-week-copy"><strong>Week {week.weekNumber} · {phaseLabel(week.phase)}{week.isRecoveryWeek ? ' · Herstelweek' : ''}</strong><small>{week.goal}</small></span><span className="plan-week-count">{completed}/{week.workouts.length}<Icon name="chevron" size={16} /></span></summary>
            <div className="plan-week-workouts">{week.workouts.map((workout) => <div key={workout.id}><div className="plan-row"><div className="plan-row-main"><span className={'workout-type-icon type-' + workout.type}><Icon name={workoutIconName(workout.type)} size={18} /></span><span className="plan-row-copy"><span className="plan-row-date">{dateLabel(workout.date)}</span><strong>{workoutTitleLabel(workout.title)}{workout.optional && <span className="optional-tag"> Optioneel</span>}</strong></span></div><span className="plan-row-duration">{workout.durationMinutes ? workout.durationMinutes + ' min' : workout.distanceKm + ' km'}</span><StatusPill status={workout.status} /></div><div className="plan-row-detail">{workout.goal}{workout.intensity ? ' · ' + paceIntensityLabel(workout.intensity) : ''}</div>{workout.feedback && <div className="coach-workout-feedback"><strong>Atleetfeedback</strong>{workout.feedback.effort && <span>{effortLabel(workout.feedback.effort)}</span>}{workout.feedback.note && <p>{workout.feedback.note}</p>}{workout.feedback.completedAt && <small>Ingevuld {dateLabel(workout.feedback.completedAt)}</small>}</div>}{recent.filter((activity) => activity.plannedWorkoutId === workout.id).slice(0, 1).map((activity) => <LinkedActivitySummary key={activity.id} activity={activity} />)}</div>)}</div>
          </details>
        })}</div>
      </section> : <div className="empty-state"><div className="empty-plan-mark"><Icon name="plan" size={24} /></div><h3>Nog geen schema</h3><p>Stel voor deze atleet een marathonplan in met de knop bovenaan.</p><button className="button button-primary button-small" onClick={onSetupPlan}><Icon name="plus" size={15} /> Schema instellen</button></div>}
    </div>}
    {activeTab === 'history' && <div className="athlete-detail-panel">
      <div className="section-heading"><div><p className="eyebrow">LAATSTE 30 DAGEN</p><h2>Trainingsgeschiedenis</h2></div></div>
      <div className="history-list compact-history">{historyItems.map((item) => { const activity = item.activity; const workout = item.workout; const effort = activity?.effort ?? workout?.feedback?.effort; const note = activity?.note ?? workout?.feedback?.note; return <div className="history-card" key={item.id}><div className={'history-activity-icon' + (workout ? ' type-' + workout.type : '')}><Icon name={workout ? workoutIconName(workout.type) : 'runner'} size={18} /></div><div className="history-main"><div className="history-title-row"><h3>{activity?.name ?? workout?.title ?? 'Hardlooptraining'}</h3><span className={'source-pill ' + (activity ? 'source-' + activity.source : 'source-completed')}>{activity ? activitySourceLabel(activity.source) : 'Schema'}</span></div><div className="history-meta"><span>{dateLabel(item.date)}</span>{activity ? <><span>{activity.distanceKm ? activity.distanceKm.toFixed(1).replace('.', ',') + ' km' : '—'}</span><span>{activity.durationMinutes} min</span>{activity.pace && <span>{activity.pace} /km</span>}</> : <span>Uitgevoerd volgens schema</span>}</div>{effort && <p className="history-feedback"><span>Gevoel</span>{effortLabel(effort)}</p>}{note && <p className="history-note">{note}</p>}</div></div>})}{historyItems.length === 0 && <p className="muted">Nog geen trainingen uitgevoerd in de afgelopen 30 dagen.</p>}</div>
    </div>}
    {activeTab === 'profile' && <div className="athlete-detail-panel athlete-profile-panel">
      <AthleteIdentitySummary athlete={athlete} />
      {profileContent}
      {athlete.wellness && athlete.wellness.length > 0 ? <section className="shared-wellness wellness-diary coach-wellness-diary"><div className="wellness-diary-heading"><div><p className="eyebrow">ATLEET HEEFT GEDEELD</p><h2>Herstel & welzijn</h2></div><span>{athlete.wellness.length} {athlete.wellness.length === 1 ? 'dag' : 'dagen'}</span></div><div className="wellness-diary-list">{athlete.wellness.map((item) => <article className="wellness-diary-entry" key={item.id}><div className="wellness-diary-entry-heading"><strong>{dateLabel(item.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><span className="shared">Gedeeld met coach</span></div><div className="wellness-diary-metrics">{item.sleepHours !== undefined && <span><small>Slaap</small><strong>{String(item.sleepHours).replace('.', ',')} uur</strong></span>}{item.restingHeartRate !== undefined && <span><small>Rusthartslag</small><strong>{item.restingHeartRate} bpm</strong></span>}{item.recoveryScore !== undefined && <span><small>Herstelgevoel</small><RecoveryMood value={item.recoveryScore} size={16} /></span>}</div>{item.note && <p className="wellness-diary-note">{item.note}</p>}</article>)}</div></section> : <section className="shared-wellness wellness-diary coach-wellness-diary"><div className="wellness-diary-heading"><div><p className="eyebrow">HERSTEL & WELZIJN</p><h2>Gedeelde dagboekgegevens</h2></div><span>0 dagen</span></div><p className="muted">Er zijn nog geen herstelgegevens met jou gedeeld.</p></section>}
      <section className="wellness-history coach-notes">
        <div className="section-heading"><div><p className="eyebrow">ALLEEN VOOR DE COACH</p><h2>Coachnotities</h2></div></div>
        <p className="muted">Deze notities zijn alleen zichtbaar voor jou en worden bij dit atletenprofiel bewaard.</p>
        <form className="form-grid" onSubmit={submitCoachNote}><label className="field full"><span>Nieuwe notitie <small>max. 1000 tekens</small></span><textarea rows={3} maxLength={1000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Bijvoorbeeld: bespreken hoe de lange duurloop voelde." /></label><div className="form-actions full"><button className="button button-primary button-small" disabled={!noteDraft.trim()}>Notitie opslaan</button></div></form>
        {(athlete.coachNotes ?? []).length === 0 ? <p className="muted">Nog geen notities toegevoegd.</p> : (athlete.coachNotes ?? []).map((item) => <div className="wellness-entry" key={item.id}><strong>{dateLabel(item.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</strong><span>{item.note}</span></div>)}
      </section>
      <p className="plan-disclaimer"><Icon name="shield" size={16} /> Herstelgegevens zijn alleen zichtbaar als de atleet deze met jou deelt.</p>
      {canRemove && <section className="delete-athlete-zone" aria-labelledby="delete-athlete-heading"><div><p className="eyebrow">GEVOELIGE ACTIE</p><h2 id="delete-athlete-heading">Atleetaccount verwijderen</h2><p>Verwijdert het Marathon Coach-account en alle gekoppelde gegevens definitief.</p></div><button type="button" className="button button-danger button-small" onClick={onRemove}>Atleet verwijderen</button></section>}
    </div>}
  </section>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = () => dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true') : []
    const focusTimer = window.requestAnimationFrame(() => (focusableElements()[0] ?? dialog)?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const elements = focusableElements()
      if (!elements.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-subtitle" tabIndex={-1}><div className="modal-heading"><div><p className="eyebrow">MARATHON COACH</p><h2 id="modal-title">{title}</h2><p id="modal-subtitle">{subtitle}</p></div><button type="button" className="icon-quiet modal-close" aria-label="Venster sluiten" onClick={onClose}><Icon name="close" /></button></div>{children}</section></div>
}
