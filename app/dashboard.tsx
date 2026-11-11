'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoMark } from '@/components/logo'
import { BRAND } from '@/lib/brand'
import { calculateTrainingPaces, currentWeekNumber, formatPace, generatePlan, getPlanStartDate, parseDurationToSeconds, phaseLabel } from '@/lib/training-plan'
import { todayDateISO } from '@/lib/dates'
import type { PlanWeek } from '@/lib/training-plan'
import type { ActivityLap, AppRole, AthleteSummary, CoachNote, CoachSuggestion, DashboardData, RunActivity, WellnessEntry } from '@/lib/types'

type View = 'week' | 'plan' | 'history' | 'wellness' | 'profile' | 'coach' | 'athletes' | 'suggestions' | 'athlete-detail'
type ManualDraft = { name: string; date: string; duration: string; distance: string; heartRate: string; effort: string; note: string; plannedWorkoutId: string }
type QuickFeedbackDraft = { effort: NonNullable<RunActivity['effort']> | ''; note: string }
type StravaCandidate = { id: string; name: string; startedAt: string; distanceKm?: number; durationMinutes: number; averageHeartRate?: number; alreadyLinkedToWorkout: boolean; linkedElsewhere: boolean; automaticMatchElsewhere: boolean }
type WellnessDraft = { sleepHours: string; restingHeartRate: string; recoveryScore: string; note: string; visibleToCoach: boolean }
type ProfileDraft = { marathonDate: string; goalTime: string; planLength: 12 | 16 | 20; days: number[]; optional: boolean; optionalTrainingDay: number; raceTime: string; raceDistance: string }

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

function PlanTimingNote({ draft }: { draft: ProfileDraft }) {
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
    message = isPast
      ? 'Dit schema zou starten op ' + dateLabel(start, { day: 'numeric', month: 'long', year: 'numeric' }) + ', in het verleden. Kies een korter schema of een latere marathondatum.'
      : 'Start van week 1: ' + dateLabel(start, { day: 'numeric', month: 'long', year: 'numeric' }) + '.'
  } catch (error) {
    isPast = true
    message = error instanceof Error ? error.message : 'Controleer de marathondatum en trainingsdagen.'
  }
  return <p className={'plan-timing-note' + (isPast ? ' warning' : '')}>{message}</p>
}

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  const paths: Record<string, React.ReactNode> = {
    week: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/></>,
    plan: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v15M8 7h8M8 11h7"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    heart: <><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/><path d="M3.8 12h4l2-3 2.2 6 2.1-4H20"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M19 5h2M20 4v2"/></>,
    coach: <><circle cx="9" cy="8" r="3.3"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.5a3 3 0 0 1 0 5.8M17.5 14a5.6 5.6 0 0 1 4 5"/></>,
    people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20a6 6 0 0 1 12 0M16 15a4.8 4.8 0 0 1 5 5"/></>,
    spark: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
    run: <><circle cx="15.5" cy="4.8" r="2"/><path d="m13.5 9 3.5 2 2.2 4M13.5 9l-3.7 3.2-3.1.2M17 11l-4.3 4.3-1.1 5M13.8 14.2l-5 4-1.2 3"/><path d="M3 21h18"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  }
  return <svg {...common}>{paths[name] ?? paths.run}</svg>
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

function effortLabel(value?: RunActivity['effort']): string {
  return ({ easier: 'Makkelijker dan verwacht', as_expected: 'Zoals verwacht', harder: 'Zwaarder dan verwacht', not_good: 'Niet goed gegaan' } as const)[value ?? 'as_expected']
}

function activitySourceLabel(source: RunActivity['source']): string {
  return source === 'strava' ? 'Strava' : source === 'upload' ? 'Bestand' : 'Handmatig'
}
function stravaWebhookIssueMessage(issue?: string, detail?: string): string {
  const messages: Record<string, string> = {
    credentials_missing: 'De automatische koppeling mist een Strava-instelling. Handmatig synchroniseren blijft werken.',
    webhook_secret_missing: 'De beveiligde Strava-webhookinstelling ontbreekt in Preview.',
    preview_origin_missing: 'Het vaste Preview-adres voor automatische synchronisatie ontbreekt.',
    strava_auth_rejected: 'Strava accepteert de appgegevens voor automatische synchronisatie niet. Controleer Client ID en Client Secret in Vercel Preview.',
    subscription_check_failed: 'Strava kon de bestaande webhook niet controleren. Probeer het later opnieuw.',
    subscription_conflict: 'Er staat al een oude Strava-webhook. Die moet eerst veilig worden vervangen.',
    callback_rejected: 'Strava kon het Preview-adres niet controleren. Controleer de webhookinstellingen.',
    callback_protected: 'Vercel blokkeert het callbackadres nog. Controleer de toegang tot deze Preview-branch.',
    callback_url_too_long: 'Het Strava-webhookadres is te lang. Er is een korter callbackadres nodig.',
    callback_probe_failed: 'De app kan het webhookadres niet zelf bereiken.',
    callback_redirected: 'Het webhookadres stuurt eerst door naar een ander adres. Strava accepteert alleen direct HTTP 200.',
    callback_response_invalid: 'Het webhookadres geeft niet de verwachte Strava-controle terug.',
    callback_too_slow: 'Het webhookadres antwoordt te langzaam voor Strava.',
    registration_rejected: 'Strava heeft de automatische koppeling geweigerd.',
    registration_unconfirmed: 'Strava heeft de automatische koppeling niet bevestigd.',
    network_error: 'Strava was tijdelijk niet bereikbaar.',
    setup_failed: 'De automatische koppeling kon niet worden ingesteld.',
  }
  const message = issue ? messages[issue] ?? messages.setup_failed : 'Automatische synchronisatie is nog niet actief.'
  return detail ? message + ' (' + detail + ')' : message
}


function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { planned: 'Gepland', completed: 'Uitgevoerd', adjusted: 'Aangepast', skipped: 'Overgeslagen' }
  return <span className={'status-pill status-' + status}>{labels[status] ?? status}</span>
}

function EffortDots({ value }: { value: number }) {
  return <span className="effort-dots" aria-label={'Herstelgevoel ' + value + ' van 5'}>{[1, 2, 3, 4, 5].map((item) => <i key={item} className={item <= value ? 'active' : ''} />)}</span>
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={'nav-item' + (active ? ' active' : '')} onClick={onClick}><Icon name={icon} /><span>{label}</span>{active && <span className="nav-active-dot" />}</button>
}

function PaceStrip() {
  return <div className="pace-strip"><span><i className="pace-dot easy" /> E <b>Rustig</b></span><span><i className="pace-dot marathon" /> M <b>Marathon</b></span><span><i className="pace-dot threshold" /> T <b>Drempel</b></span><span><i className="pace-dot interval" /> I/R <b>Vlot</b></span></div>
}

function StatCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone?: string }) {
  return <div className="stat-card"><span className={'stat-icon ' + (tone ?? '')}><Icon name={icon} size={17} /></span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}

export function Dashboard({ initialData, demoMode }: { initialData: DashboardData; demoMode: boolean }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [role, setRole] = useState<AppRole>(initialData.profile.role)
  const [view, setView] = useState<View>(initialData.profile.role === 'coach' ? 'coach' : 'week')
  const [modal, setModal] = useState<'activity' | 'invite' | 'plan' | 'feedback' | null>(null)
  const [feedbackWorkout, setFeedbackWorkout] = useState<PlanWeek['workouts'][number] | null>(null)
  const [feedbackDraft, setFeedbackDraft] = useState<QuickFeedbackDraft>({ effort: '', note: '' })
  const [activityFile, setActivityFile] = useState<File | null>(null)
  const [activityUploadError, setActivityUploadError] = useState('')
  const [stravaCandidates, setStravaCandidates] = useState<StravaCandidate[]>([])
  const [stravaCandidatesLoaded, setStravaCandidatesLoaded] = useState(false)
  const [loadingStravaCandidates, setLoadingStravaCandidates] = useState(false)
  const [selectedStravaCandidateId, setSelectedStravaCandidateId] = useState('')
  const [savingWorkoutFeedback, setSavingWorkoutFeedback] = useState(false)
  const [toast, setToast] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [evaluatingSuggestions, setEvaluatingSuggestions] = useState(false)
  const [syncingStrava, setSyncingStrava] = useState(false)
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null)
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteSummary | null>(null)
  const [draft, setDraft] = useState<ManualDraft>({ name: '', date: todayDateISO(), duration: '', distance: '', heartRate: '', effort: '', note: '', plannedWorkoutId: '' })
  const [lapDrafts, setLapDrafts] = useState<ActivityLap[]>([])
  const [wellnessDraft, setWellnessDraft] = useState<WellnessDraft>({ sleepHours: '', restingHeartRate: '', recoveryScore: '', note: '', visibleToCoach: true })
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ marathonDate: initialData.plan?.marathonDate ?? '', goalTime: initialData.plan?.goalTime ?? '', planLength: initialData.plan?.length ?? 16, days: initialData.plan?.trainingDays ?? [2, 4, 0], optional: initialData.plan?.includeOptionalFourth ?? false, optionalTrainingDay: initialData.plan?.optionalTrainingDay ?? 6, raceTime: '50:00', raceDistance: '10' })
  const [coachPlanDraft, setCoachPlanDraft] = useState<ProfileDraft>({ marathonDate: '', goalTime: '04:00:00', planLength: 16, days: [2, 4, 0], optional: false, optionalTrainingDay: 6, raceTime: '00:50:00', raceDistance: '10' })

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

  useEffect(() => {
    if (!accountMenuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    const url = new URL(window.location.href)
    const status = url.searchParams.get('strava')
    if (!status) return
    const webhook = url.searchParams.get('webhook')
    const sync = url.searchParams.get('sync')
    const messages: Record<string, string> = {
      connected: webhook === 'setup-failed'
        ? 'Strava is gekoppeld en de eerste import is gedaan. Automatische synchronisatie wacht nog op de preview-instelling.'
        : sync === 'partial'
          ? 'Strava is gekoppeld. De eerste import kon niet volledig worden afgerond; probeer Nu synchroniseren.'
          : 'Strava is gekoppeld. De laatste 30 dagen worden ingelezen.',
      'not-configured': 'Strava is nog niet ingesteld. Voeg eerst je Client ID en Client Secret toe in de Vercel-previewinstellingen.',
      cancelled: 'De Strava-koppeling is afgebroken. Je bestaande gegevens zijn niet gewijzigd.',
      error: 'Strava koppelen is niet gelukt. Probeer het opnieuw; je bestaande geschiedenis blijft beschikbaar.',
    }
    const message = messages[status]
    if (message) {
      const timer = window.setTimeout(() => setToast(message), 0)
      url.searchParams.delete('strava')
      url.searchParams.delete('sync')
      url.searchParams.delete('webhook')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      return () => window.clearTimeout(timer)
    }
  }, [])

  const plan = data.plan
  const activeWeek = useMemo(() => plan?.weeks.find((week) => week.weekNumber === plan.currentWeek) ?? plan?.weeks[0] ?? null, [plan])
  const completedThisWeek = activeWeek?.workouts.filter((workout) => workout.status === 'completed').length ?? 0
  const requiredThisWeek = activeWeek?.workouts.filter((workout) => !workout.optional).length ?? 0
  const progress = requiredThisWeek > 0 ? Math.round((completedThisWeek / requiredThisWeek) * 100) : 0
  const nextTraining = activeWeek?.workouts.find((workout) => workout.status === 'planned' && !workout.optional)
  const paces = calculateTrainingPaces(Number(profileDraft.raceDistance), parseDurationToSeconds(profileDraft.raceTime) ?? 0, parseDurationToSeconds(profileDraft.goalTime) ?? undefined)
  const feedbackLinkedActivity = feedbackWorkout ? data.activities.find((activity) => activity.plannedWorkoutId === feedbackWorkout.id) : undefined

  const showToast = (message: string) => setToast(message)
  const go = (next: View) => { setView(next); setSelectedAthlete(null) }

  function openWorkoutFeedback(workout: PlanWeek['workouts'][number]) {
    setFeedbackWorkout(workout)
    setFeedbackDraft({ effort: workout.feedback?.effort ?? '', note: workout.feedback?.note ?? '' })
    setActivityFile(null)
    setActivityUploadError('')
    setStravaCandidates([])
    setStravaCandidatesLoaded(false)
    setLoadingStravaCandidates(false)
    setSelectedStravaCandidateId('')
    setModal('feedback')
  }

  async function findStravaActivities() {
    if (!feedbackWorkout || loadingStravaCandidates) return
    setLoadingStravaCandidates(true)
    setActivityUploadError('')
    setStravaCandidatesLoaded(false)
    try {
      const response = await fetch('/api/strava/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedWorkoutId: feedbackWorkout.id }),
      })
      const result = await response.json().catch(() => ({})) as { candidates?: StravaCandidate[]; error?: string }
      if (!response.ok) {
        setActivityUploadError(result.error ?? 'Strava-activiteiten konden niet worden opgehaald. Probeer het opnieuw.')
        return
      }
      setStravaCandidates(result.candidates ?? [])
      setStravaCandidatesLoaded(true)
    } catch {
      setActivityUploadError('Strava-activiteiten konden niet worden opgehaald. Controleer je internetverbinding en probeer het opnieuw.')
    } finally {
      setLoadingStravaCandidates(false)
    }
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
    let completionSaved = demoMode
    try {
      if (!demoMode) {
        const response = await fetch('/api/workouts/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!response.ok) {
          showToast('De trainingsstatus kon niet worden opgeslagen. Probeer het opnieuw.')
          return
        }
        completionSaved = true
      }
      setData((current) => ({
        ...current,
        plan: current.plan ? { ...current.plan, weeks: current.plan.weeks.map((week) => ({ ...week, workouts: week.workouts.map((workout) => workout.id === feedbackWorkout.id ? { ...workout, status: 'completed', feedback } : workout) })) } : null,
      }))

      let stravaActivityLinked = false
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
      } else if (selectedStravaCandidateId && !demoMode) {
        setFeedbackWorkout((current) => current ? { ...current, status: 'completed', feedback } : current)
        const response = await fetch('/api/strava/attach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plannedWorkoutId: feedbackWorkout.id, activityId: selectedStravaCandidateId, replaceExistingActivity: Boolean(feedbackLinkedActivity) }),
        })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) {
          setActivityUploadError(result.error ?? 'De Strava-activiteit kon niet worden gekoppeld. Probeer het opnieuw.')
          return
        }
        stravaActivityLinked = true
      }

      const wasAlreadyCompleted = feedbackWorkout.status === 'completed'
      setModal(null)
      setFeedbackWorkout(null)
      setActivityFile(null)
      if (activityFile || stravaActivityLinked) router.refresh()
      showToast(activityFile ? 'Training afgerond en bestand aan je schema gekoppeld.' : stravaActivityLinked ? 'Training afgerond en Strava-activiteit gekoppeld.' : wasAlreadyCompleted ? 'Je trainingsfeedback is opgeslagen.' : 'Training als uitgevoerd gemarkeerd.')
    } catch {
      setActivityUploadError((activityFile || selectedStravaCandidateId) && completionSaved ? 'De training is afgerond, maar de activiteit kon niet worden gekoppeld. Probeer het opnieuw.' : 'De trainingsstatus kon niet worden opgeslagen. Probeer het opnieuw.')
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
      visibleToCoach: wellnessDraft.visibleToCoach,
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
    setWellnessDraft({ sleepHours: '', restingHeartRate: '', recoveryScore: '', note: '', visibleToCoach: true })
    showToast('Herstelgegevens opgeslagen. Bedankt voor het delen.')
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
    const newPlan = {
      length: profileDraft.planLength,
      marathonDate: profileDraft.marathonDate,
      goalTime: profileDraft.goalTime,
      currentWeek: currentWeekNumber(weeks),
      weeks,
      trainingDays: [...profileDraft.days],
      includeOptionalFourth: profileDraft.optional,
      optionalTrainingDay: profileDraft.optionalTrainingDay,
    }
    if (!demoMode) {
      const response = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marathonDate: newPlan.marathonDate, planLength: newPlan.length, goalTime: newPlan.goalTime, trainingDays: newPlan.trainingDays, includeOptionalFourth: newPlan.includeOptionalFourth, optionalTrainingDay: newPlan.optionalTrainingDay, recentRaceDistanceKm: Number(profileDraft.raceDistance), recentRaceTimeSeconds: parseDurationToSeconds(profileDraft.raceTime) }) })
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
    let generatedWeeks: PlanWeek[]
    try {
      generatedWeeks = generatePlan({
        marathonDate: coachPlanDraft.marathonDate,
        length: coachPlanDraft.planLength,
        trainingDays: coachPlanDraft.days,
        includeOptionalFourth: coachPlanDraft.optional,
        optionalTrainingDay: coachPlanDraft.optionalTrainingDay,
        goalTimeSeconds: goalSeconds,
      })
    } catch (error) {
      return showToast(error instanceof Error ? error.message : 'Het plan kan niet worden opgebouwd.')
    }

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
      currentWeek: 1,
      phase: 'Basisfase',
      plannedThisWeek: 3,
      completedThisWeek: 0,
      lastLongRun: undefined,
      planWeeks: generatedWeeks,
    }
    setSelectedAthlete(updatedAthlete)
    setData((current) => ({
      ...current,
      athletes: current.athletes.map((athlete) => athlete.id === updatedAthlete.id ? updatedAthlete : athlete),
    }))
    setModal(null)
    showToast(demoMode ? 'Voorbeeldschema ingesteld.' : 'Marathonplan opgeslagen voor ' + selectedAthlete.name + '.')
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

  async function syncStrava() {
    if (syncingStrava) return
    setSyncingStrava(true)
    try {
      const response = await fetch('/api/strava/sync', { method: 'POST' })
      const result = await response.json().catch(() => ({})) as { imported?: number; automaticSyncReady?: boolean; automaticSyncIssue?: string; automaticSyncDetail?: string; error?: string }
      if (!response.ok) {
        showToast(result.error ?? 'Synchroniseren lukte niet. Je bestaande geschiedenis blijft beschikbaar.')
        return
      }
      const imported = result.imported ?? 0
      const syncMessage = imported === 0 ? 'Geen nieuwe Strava-trainingen gevonden.' : imported + ' Strava-trainingen bijgewerkt.'
      showToast(syncMessage + ' ' + (result.automaticSyncReady ? 'Automatische synchronisatie is ingesteld.' : stravaWebhookIssueMessage(result.automaticSyncIssue, result.automaticSyncDetail)))
      router.refresh()
    } catch {
      showToast('De synchronisatie kon de server niet bereiken. Controleer je internetverbinding en probeer opnieuw.')
    } finally {
      setSyncingStrava(false)
    }
  }

  async function disconnectStrava() {
    const response = await fetch('/api/strava/disconnect', { method: 'POST' })
    if (!response.ok) return showToast('De Strava-koppeling kon niet worden verwijderd.')
    router.refresh()
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
    showToast(demoMode ? 'Demo: dit is alleen een voorbeeld; er wordt geen e-mail verstuurd.' : 'Uitnodiging aangevraagd voor ' + email + '. Controleer ook je spammap.')
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
      raceTime: '00:50:00',
      raceDistance: '10',
    })
    setModal('plan')
  }

  const todayWellness = data.wellness.find((item) => item.date === todayDateISO())
  const navItems = role === 'athlete'
    ? [{ id: 'week' as const, icon: 'week', label: 'Deze week' }, { id: 'plan' as const, icon: 'plan', label: 'Mijn schema' }, { id: 'history' as const, icon: 'history', label: 'Geschiedenis' }, { id: 'wellness' as const, icon: 'heart', label: 'Herstel & welzijn' }, { id: 'profile' as const, icon: 'user', label: 'Mijn profiel' }]
    : [{ id: 'coach' as const, icon: 'coach', label: 'Overzicht' }, { id: 'athletes' as const, icon: 'people', label: 'Atleten' }, { id: 'history' as const, icon: 'history', label: 'Mijn trainingen' }, { id: 'suggestions' as const, icon: 'spark', label: 'Voorstellen' }, { id: 'profile' as const, icon: 'user', label: 'Mijn profiel' }]
  const mobileNavItems = role === 'coach' ? navItems.filter((item) => item.id !== 'suggestions') : navItems.slice(0, 4)
  const title = view === 'week' ? 'Deze week' : view === 'plan' ? 'Mijn schema' : view === 'history' ? 'Trainingsgeschiedenis' : view === 'wellness' ? 'Herstel & welzijn' : view === 'profile' ? 'Mijn profiel' : view === 'athletes' ? 'Mijn atleten' : view === 'suggestions' ? 'Coachvoorstellen' : view === 'athlete-detail' ? selectedAthlete?.name ?? 'Atleet' : 'Coachoverzicht'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><LogoMark /><div><strong>{BRAND.appName}</strong><span>{BRAND.byline}</span></div></div>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">WERKRUIMTE</div>
        <nav className="side-nav" aria-label="Hoofdnavigatie">
          {navItems.map((item) => <NavItem key={item.id} icon={item.icon} label={item.label} active={view === item.id || (view === 'athlete-detail' && item.id === 'athletes')} onClick={() => go(item.id)} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="coach-card" ref={accountMenuRef}>
            <div className="coach-avatar">{data.profile.name.charAt(0).toUpperCase()}</div>
            <div><strong>{data.profile.name}</strong><span>{role === 'coach' ? BRAND.subtitle : 'Atleet'}</span></div>
            <div className="account-menu-wrap">
              <button type="button" aria-label="Accountopties" aria-haspopup="menu" aria-expanded={accountMenuOpen} className="icon-quiet" onClick={() => setAccountMenuOpen((open) => !open)}><Icon name="more" /></button>
              {accountMenuOpen && <div className="account-menu" role="menu" aria-label="Accountopties">
                <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); go('profile') }}>Mijn profiel</button>
                {demoMode
                  ? <button type="button" role="menuitem" onClick={() => { window.localStorage.removeItem('marathon-coach-preview-v1'); window.location.reload() }}>Voorbeeld resetten</button>
                  : <form action="/auth/signout" method="post"><button type="submit" role="menuitem">Uitloggen</button></form>}
              </div>}
            </div>
          </div>
          <div className="side-brand-note"><LogoMark small /><span>Train met aandacht.<br />Loop met vertrouwen.</span></div>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><LogoMark small /><span>{BRAND.appName}</span></div>
          <div className="breadcrumb"><span>Marathonplan</span><b>/</b><strong>{title}</strong></div>
          <div className="topbar-actions">
            {demoMode ? <label className="role-switch"><span>Voorbeeld</span><select aria-label="Voorbeeldrol" value={role} onChange={(event) => { const next = event.target.value as AppRole; setRole(next); setData((current) => ({ ...current, profile: { ...current.profile, role: next } })); go(next === 'coach' ? 'coach' : 'week') }}><option value="athlete">Atleet</option><option value="coach">Coach</option></select></label> : <span className="role-label"><span className="live-dot" /> {data.profile.name}</span>}
            {role === 'athlete' ? <button className="button button-primary button-compact" onClick={() => setModal('activity')}><Icon name="plus" size={17} /><span>Training toevoegen</span></button> : <button className="button button-primary button-compact" onClick={() => setModal('invite')}><Icon name="plus" size={17} /><span>Atleet uitnodigen</span></button>}
            {!demoMode && <form action="/auth/signout" method="post"><button className="icon-quiet" aria-label="Uitloggen" title="Uitloggen"><Icon name="close" size={17} /></button></form>}
          </div>
        </header>

        <div className="page-content">
          {demoMode && <div className="preview-banner"><span className="preview-dot" /><span><strong>Voorbeeldomgeving</strong> · demo-gegevens worden alleen in deze browser bewaard.</span><button onClick={() => { window.localStorage.removeItem('marathon-coach-preview-v1'); window.location.reload() }}>Voorbeeld resetten</button></div>}
          <div className="page-heading"><div><p className="eyebrow">{role === 'coach' ? 'COACHRUIMTE' : 'ATLEETRUIMTE'} <span className="eyebrow-line" /></p><h1>{title}</h1><p className="page-subtitle">{view === 'week' ? 'Een duidelijk overzicht van je trainingen en herstel.' : view === 'coach' ? 'Houd zicht op het trainingsproces van je atleten.' : view === 'plan' ? 'Je schema is een richtlijn. Pas de belasting aan op je reactie.' : view === 'history' ? 'Bekijk je looptrainingen, handmatig, via bestand of vanuit Strava.' : view === 'wellness' ? 'Deel alleen wat je zelf wilt. Invullen is altijd vrijblijvend.' : view === 'profile' ? 'Je instellingen bepalen hoe je plan wordt opgebouwd.' : view === 'suggestions' ? 'Voorstellen veranderen je schema pas na jouw beoordeling.' : 'Praktische informatie voor jouw begeleiding.'}</p></div><button className="date-chip"><Icon name="clock" size={16} /> {new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</button></div>

          {view === 'week' && <>
            {plan && activeWeek ? <>
              <section className="week-hero">
                <div className="week-hero-content"><div className="week-topline"><span className="phase-pill"><i /> {phaseLabel(activeWeek.phase)}</span><span className="week-label">WEEK {String(activeWeek.weekNumber).padStart(2, '0')} <span>/{plan.length}</span></span></div><h2>Stap voor stap<br /><em>naar de start.</em></h2><p>{activeWeek.goal}</p><div className="hero-meta"><span><Icon name="run" size={17} /> Marathon {dateLabel(plan.marathonDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="hero-meta-divider" /><span>Doel <b>{formatTime(plan.goalTime)}</b></span></div></div>
                <div className="week-ring-wrap"><div className="week-ring" style={{ '--progress': progress + '%' } as React.CSSProperties}><span>{completedThisWeek}<small>/{requiredThisWeek}</small></span></div><div><strong>trainingen</strong><span>deze week gedaan</span></div></div>
                <a className="hero-photo-credit" href="https://unsplash.com/photos/a-large-group-of-runners-participating-in-a-marathon-race-fW-drUfhcwc" target="_blank" rel="noreferrer" aria-label="Foto van Daniel Stiel via Unsplash">Foto Daniel Stiel / Unsplash</a>
              </section>

              <div className="content-grid week-grid">
                <section className="section-main"><div className="section-heading"><div><p className="eyebrow">JOUW PLANNING</p><h2>Deze week</h2></div><button className="text-button" onClick={() => go('plan')}>Hele schema <Icon name="arrow" size={16} /></button></div><div className="workout-list">{activeWeek.workouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} activity={data.activities.find((activity) => activity.plannedWorkoutId === workout.id)} expanded={expandedWorkout === workout.id} onExpand={() => setExpandedWorkout(expandedWorkout === workout.id ? null : workout.id)} onDone={() => openWorkoutFeedback(workout)} onSkip={() => updateWorkout(workout.id, 'skipped')} />)}</div></section>
                <aside className="section-aside"><div className="next-card"><div className="aside-card-head"><span className="aside-icon lime"><Icon name="spark" size={17} /></span><span className="small-label">VOLGENDE TRAINING</span></div>{nextTraining ? <><p className="next-date">{dateLabel(nextTraining.date)}</p><h3>{nextTraining.title}</h3><p className="muted">{nextTraining.description}</p><div className="next-details"><span>{nextTraining.durationMinutes ? nextTraining.durationMinutes + ' min' : nextTraining.distanceKm + ' km'}</span><span>{nextTraining.intensity}</span></div><button className="button button-dark full-width" onClick={() => { setExpandedWorkout(nextTraining.id); window.scrollTo({ top: 550, behavior: 'smooth' }) }}>Training bekijken <Icon name="arrow" size={16} /></button></> : <div className="empty-small"><strong>Alles gedaan</strong><span>Je trainingen voor deze week zijn afgerond.</span></div>}</div>
                  <div className="pace-card"><div className="aside-card-head"><span className="aside-icon light"><Icon name="run" size={17} /></span><span className="small-label">TRAININGSINTENSITEIT</span></div><p>Gebruik tempo als richtlijn. Je gevoel en de omstandigheden tellen mee.</p><PaceStrip /><button className="text-button" onClick={() => go('profile')}>Mijn tempozones <Icon name="arrow" size={16} /></button></div>
                  <div className="wellness-nudge"><span className="wellness-nudge-icon"><Icon name="heart" /></span><div><strong>Hoe is je herstel?</strong><span>Alleen als je wilt delen.</span></div><button aria-label="Herstel invullen" onClick={() => go('wellness')}><Icon name="arrow" size={17} /></button></div>
                </aside>
              </div>
            </> : <EmptyPlan onSetup={() => go('profile')} />}
          </>}

          {view === 'plan' && <PlanView plan={plan} activities={data.activities} onWorkout={setExpandedWorkout} expandedWorkout={expandedWorkout} />}
          {view === 'history' && <HistoryView activities={data.activities} onAdd={() => setModal('activity')} />}
          {view === 'wellness' && <WellnessView wellness={data.wellness} todayWellness={todayWellness} draft={wellnessDraft} setDraft={setWellnessDraft} onSubmit={saveWellness} />}
          {view === 'profile' && <ProfileView data={data} draft={profileDraft} setDraft={setProfileDraft} paces={paces} onSubmit={savePlan} onConnect={() => { if (!demoMode) router.push('/api/strava/connect'); else showToast('Strava koppelen werkt zodra de app-instellingen zijn aangesloten.') }} onSync={syncStrava} syncingStrava={syncingStrava} onDisconnect={disconnectStrava} demoMode={demoMode} />}
          {view === 'coach' && <CoachView data={data} onAthlete={(athlete) => { setSelectedAthlete(athlete); setView('athlete-detail') }} onSuggestions={() => go('suggestions')} onUpdateSuggestion={updateSuggestion} />}
          {view === 'athletes' && <AthletesView athletes={data.athletes} onAthlete={(athlete) => { setSelectedAthlete(athlete); setView('athlete-detail') }} onInvite={() => setModal('invite')} />}
          {view === 'suggestions' && <SuggestionsView suggestions={data.suggestions} onUpdate={updateSuggestion} onEvaluate={evaluateCoachSuggestions} evaluating={evaluatingSuggestions} />}
          {view === 'athlete-detail' && selectedAthlete && <AthleteDetail athlete={selectedAthlete} data={data} onBack={() => go('athletes')} onSetupPlan={() => openCoachPlan(selectedAthlete)} onAddNote={addCoachNote} />}
        </div>
        <footer className="page-footer"><span>{BRAND.appName} <b>·</b> {BRAND.byline}</span><span>Trainingsschema is een richtlijn, geen diagnose.</span></footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">{mobileNavItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span></button>)}</nav>

      {modal === 'activity' && <Modal title="Training toevoegen" subtitle="Vul alleen de gegevens in die je bij de hand hebt." onClose={() => setModal(null)}><form className="form-grid" onSubmit={saveManualActivity}><label className="field full"><span>Naam activiteit</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Bijvoorbeeld rustige duurloop" /></label><label className="field"><span>Datum</span><input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label className="field"><span>Duur in minuten *</span><input type="number" min="1" required value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} placeholder="52" /></label><label className="field"><span>Afstand in km</span><input type="number" min="0" step="0.01" value={draft.distance} onChange={(event) => setDraft({ ...draft, distance: event.target.value })} placeholder="9,8" /></label><label className="field"><span>Gem. hartslag</span><input type="number" min="0" max="230" value={draft.heartRate} onChange={(event) => setDraft({ ...draft, heartRate: event.target.value })} placeholder="Optioneel" /></label><label className="field"><span>Hoe voelde het? <small>optioneel</small></span><select value={draft.effort} onChange={(event) => setDraft({ ...draft, effort: event.target.value })}><option value="">Overslaan</option><option value="easier">Makkelijker dan verwacht</option><option value="as_expected">Zoals verwacht</option><option value="harder">Zwaarder dan verwacht</option><option value="not_good">Niet goed gegaan</option></select></label><label className="field full"><span>Opmerking</span><textarea rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Alleen als je iets wilt toevoegen" /></label>
          {plan?.weeks.flatMap((week) => week.workouts).some((workout) => workout.status === 'planned' || workout.status === 'adjusted') && <label className="field full"><span>Koppel aan geplande training <small>optioneel</small></span><select value={draft.plannedWorkoutId} onChange={(event) => setDraft({ ...draft, plannedWorkoutId: event.target.value })}><option value="">Geen koppeling</option>{plan.weeks.flatMap((week) => week.workouts).filter((workout) => workout.status === 'planned' || workout.status === 'adjusted').map((workout) => <option key={workout.id} value={workout.id}>{dateLabel(workout.date) + ' · ' + workout.title}</option>)}</select></label>}
          <div className="manual-laps full"><div className="manual-laps-heading"><div><strong>Blokken of laps</strong><span>Optioneel. Alleen ingevulde gegevens worden bewaard.</span></div><button type="button" className="button button-soft button-small" onClick={() => setLapDrafts([...lapDrafts, { id: String(Date.now()), label: 'Blok ' + (lapDrafts.length + 1), durationMinutes: undefined, pace: undefined, averageHeartRate: undefined }])}><Icon name="plus" size={15} /> Blok toevoegen</button></div>{lapDrafts.map((lap, index) => <div className="lap-input-row" key={lap.id}><strong>{lap.label}</strong><input aria-label={'Duur blok ' + (index + 1)} type="number" min="1" placeholder="min" onChange={(event) => setLapDrafts((items) => items.map((item) => item.id === lap.id ? { ...item, durationMinutes: Number(event.target.value) || undefined } : item))} /><input aria-label={'Tempo blok ' + (index + 1)} placeholder="tempo /km" onChange={(event) => setLapDrafts((items) => items.map((item) => item.id === lap.id ? { ...item, pace: event.target.value } : item))} /><input aria-label={'Hartslag blok ' + (index + 1)} type="number" placeholder="HF" onChange={(event) => setLapDrafts((items) => items.map((item) => item.id === lap.id ? { ...item, averageHeartRate: Number(event.target.value) || undefined } : item))} /><button type="button" aria-label="Blok verwijderen" className="icon-quiet" onClick={() => setLapDrafts(lapDrafts.filter((item) => item.id !== lap.id))}><Icon name="close" size={16} /></button></div>)}</div>
          <div className="modal-actions full"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Annuleren</button><button className="button button-primary">Opslaan</button></div></form></Modal>}
      {modal === 'feedback' && feedbackWorkout && <Modal title={feedbackWorkout.status === 'completed' ? 'Feedback bijwerken' : 'Training afronden?'} subtitle={feedbackWorkout.status === 'completed' ? 'De training is al uitgevoerd. Voeg kort toe hoe het ging.' : 'Markeer de training als uitgevoerd. Feedback is optioneel.'} onClose={() => setModal(null)}><form className="form-grid" onSubmit={saveWorkoutFeedback}>
        <div className="invite-note full"><Icon name="check" size={18} /><span>{feedbackWorkout.title}</span></div>
        <div className="field full"><span>Hoe ging de training? <small>optioneel</small></span><div className="quick-effort-options" role="group" aria-label="Hoe voelde de training?">{([{ value: 'easier', label: 'Makkelijker' }, { value: 'as_expected', label: 'Zoals verwacht' }, { value: 'harder', label: 'Zwaarder' }, { value: 'not_good', label: 'Niet goed' }] as const).map((option) => <button key={option.value} type="button" aria-pressed={feedbackDraft.effort === option.value} className={feedbackDraft.effort === option.value ? 'selected' : ''} onClick={() => setFeedbackDraft((current) => ({ ...current, effort: current.effort === option.value ? '' : option.value }))}>{option.label}</button>)}</div></div>
        <label className="field full"><span>Korte toelichting <small>optioneel · maximaal 200 tekens</small></span><textarea rows={2} maxLength={200} value={feedbackDraft.note} onChange={(event) => setFeedbackDraft({ ...feedbackDraft, note: event.target.value })} placeholder="Bijvoorbeeld: voelde soepel, maar lichte knieklachten." /><small className="feedback-character-count">{feedbackDraft.note.length}/200</small></label>
        {!demoMode && !data.stravaConnected && <div className="field full strava-search-section"><span>Strava-activiteit <small>optioneel</small></span><div className="invite-note"><Icon name="link" size={16} /><span>Koppel eerst Strava aan dit atleetaccount om een activiteit te kunnen kiezen.</span></div><button type="button" className="button button-outline full-width" onClick={() => router.push('/api/strava/connect')} disabled={savingWorkoutFeedback}><Icon name="link" size={16} /> Strava koppelen</button></div>}
        {!demoMode && data.stravaConnected && <div className="field full strava-search-section"><span>Strava-activiteit <small>optioneel</small></span><button type="button" className="button button-outline full-width" onClick={findStravaActivities} disabled={savingWorkoutFeedback || loadingStravaCandidates}><Icon name="link" size={16} /> {loadingStravaCandidates ? 'Activiteiten zoeken…' : stravaCandidatesLoaded ? 'Opnieuw zoeken in Strava' : feedbackLinkedActivity ? 'Andere activiteit zoeken' : 'Zoek activiteit in Strava'}</button><small className="activity-upload-note">We zoeken loopactiviteiten rond de datum van deze training. Kies de juiste activiteit om de gegevens toe te voegen.</small>{stravaCandidatesLoaded && stravaCandidates.length === 0 && <div className="invite-note strava-candidate-empty"><Icon name="history" size={16} /><span>Geen loopactiviteit rond deze datum gevonden. Controleer of de training in Strava staat en zoek opnieuw.</span></div>}{stravaCandidates.length > 0 && <div className="strava-candidate-list" role="radiogroup" aria-label="Kies een Strava-activiteit">{stravaCandidates.map((candidate) => { const unavailable = candidate.linkedElsewhere && !candidate.alreadyLinkedToWorkout; return <label key={candidate.id} className={'strava-candidate' + (selectedStravaCandidateId === candidate.id ? ' selected' : '') + (unavailable ? ' unavailable' : '')}><input type="radio" name="strava-candidate" value={candidate.id} checked={selectedStravaCandidateId === candidate.id} disabled={savingWorkoutFeedback || unavailable} onChange={() => { setSelectedStravaCandidateId(candidate.id); setActivityFile(null); setActivityUploadError('') }} /><span className="strava-candidate-copy"><strong>{candidate.name}</strong><span>{dateLabel(candidate.startedAt, { weekday: 'short', day: 'numeric', month: 'short' })}{candidate.distanceKm !== undefined ? ' · ' + candidate.distanceKm.toFixed(1).replace('.', ',') + ' km' : ''}{candidate.durationMinutes ? ' · ' + candidate.durationMinutes + ' min' : ''}{candidate.averageHeartRate ? ' · ' + Math.round(candidate.averageHeartRate) + ' bpm' : ''}</span>{candidate.alreadyLinkedToWorkout && <small>Al gekoppeld aan deze training</small>}{candidate.linkedElsewhere && !candidate.alreadyLinkedToWorkout && <small>Al gekoppeld aan een andere training</small>}{candidate.automaticMatchElsewhere && <small>Automatische koppeling wordt verplaatst naar deze training</small>}</span></label>})}</div>}</div>}
        {feedbackLinkedActivity && <div className="invite-note full"><Icon name="check" size={18} /><span>{selectedStravaCandidateId ? 'De Strava-activiteit wordt aan deze training gekoppeld. De bestaande ' + (feedbackLinkedActivity.source === 'upload' ? 'FIT-activiteit' : feedbackLinkedActivity.source === 'manual' ? 'handmatige activiteit' : 'Strava-activiteit') + ' blijft in je geschiedenis staan.' : 'Er is al een activiteit aan deze training gekoppeld (' + (feedbackLinkedActivity.source === 'strava' ? 'Strava' : feedbackLinkedActivity.source === 'upload' ? 'FIT-bestand' : 'handmatige invoer') + '). De gegevens staan bij de training.'}</span></div>}
        {!demoMode && !feedbackLinkedActivity && <div className="field full"><span>Trainingbestand <small>optioneel · FIT-bestand tot 4 MB</small></span><input key={activityFile ? activityFile.name + activityFile.size : 'empty'} type="file" accept=".fit,application/octet-stream" disabled={savingWorkoutFeedback} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setActivityUploadError(''); if (file && !file.name.toLowerCase().endsWith('.fit')) { setActivityFile(null); setActivityUploadError('Kies een FIT-bestand (.fit).'); return } if (file && file.size > 4 * 1024 * 1024) { setActivityFile(null); setActivityUploadError('Het bestand moet kleiner zijn dan 4 MB.'); return } setSelectedStravaCandidateId(''); setActivityFile(file) }} /><small className="activity-upload-note">We bewaren afstand, duur, hartslag en eventuele blokken. Het originele bestand en de gps-route worden niet opgeslagen.</small>{activityFile && <div className="activity-upload-selected"><span>Geselecteerd: {activityFile.name}</span><button type="button" className="text-button subtle" onClick={() => { setActivityFile(null); setActivityUploadError('') }} disabled={savingWorkoutFeedback}>Verwijderen</button></div>}</div>}
        {activityUploadError && <div className="activity-upload-error full" role="alert">{activityUploadError}</div>}
        <div className="modal-actions full"><button type="button" className="button button-outline" onClick={() => setModal(null)} disabled={savingWorkoutFeedback}>Annuleren</button><button className="button button-primary" disabled={savingWorkoutFeedback}>{savingWorkoutFeedback ? 'Opslaan…' : selectedStravaCandidateId ? feedbackLinkedActivity ? 'Strava koppelen en huidige activiteit vervangen' : 'Afronden en Strava-activiteit koppelen' : feedbackWorkout.status === 'completed' ? activityFile ? 'Feedback en bestand opslaan' : 'Feedback opslaan' : activityFile ? 'Afronden en bestand uploaden' : 'Training afronden'}</button></div>
      </form></Modal>}
      {modal === 'invite' && <Modal title="Atleet uitnodigen" subtitle="De atleet krijgt een e-mail om een eigen account te maken." onClose={() => setModal(null)}><form className="form-grid" onSubmit={inviteAthlete}><label className="field full"><span>Naam</span><input name="name" placeholder="Naam van de atleet" /></label><label className="field full"><span>E-mailadres *</span><input name="email" type="email" required placeholder="naam@voorbeeld.nl" /></label><div className="invite-note full"><Icon name="shield" size={18} /><span>Iedere atleet ziet alleen het eigen profiel en de eigen trainingsgegevens.</span></div><div className="modal-actions full"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Annuleren</button><button className="button button-primary">Uitnodiging versturen</button></div></form></Modal>}
      {modal === 'plan' && selectedAthlete && <Modal title="Marathonplan instellen" subtitle={'Maak een persoonlijk schema voor ' + selectedAthlete.name + '.'} onClose={() => setModal(null)}><form className="form-grid" onSubmit={saveCoachPlan}>
        <label className="field"><span>Marathondatum</span><input type="date" min={todayDateISO()} required value={coachPlanDraft.marathonDate} onChange={(event) => setCoachPlanDraft({ ...coachPlanDraft, marathonDate: event.target.value })} /></label>
        <label className="field"><span>Streeftijd <small>uu:mm:ss</small></span><input required pattern="\d{2}:\d{2}:\d{2}" value={coachPlanDraft.goalTime} onChange={(event) => setCoachPlanDraft({ ...coachPlanDraft, goalTime: event.target.value })} placeholder="04:00:00" /></label>
        <PlanTimingNote draft={coachPlanDraft} />
        <div className="field full"><span>Planlengte</span><div className="plan-length-options">{([12, 16, 20] as const).map((length) => <button type="button" key={length} aria-pressed={coachPlanDraft.planLength === length} className={coachPlanDraft.planLength === length ? 'selected' : ''} onClick={() => setCoachPlanDraft({ ...coachPlanDraft, planLength: length })}><strong>{length}</strong><span>weken</span></button>)}</div></div>
        <TrainingDaysControl draft={coachPlanDraft} setDraft={setCoachPlanDraft} />
        <div className="field full"><span>Recente wedstrijdtijd <small>voor tempo-indicaties</small></span><div className="form-row"><input type="number" min="1" step="0.1" aria-label="Wedstrijdafstand in kilometers" value={coachPlanDraft.raceDistance} onChange={(event) => setCoachPlanDraft({ ...coachPlanDraft, raceDistance: event.target.value })} /><input value={coachPlanDraft.raceTime} aria-label="Wedstrijdtijd" onChange={(event) => setCoachPlanDraft({ ...coachPlanDraft, raceTime: event.target.value })} placeholder="00:50:00" /></div></div>
        <div className="invite-note full"><Icon name="shield" size={18} /><span>Een nieuw schema pauzeert het vorige. De atleet ziet daarna het nieuwe actieve schema.</span></div>
        <div className="modal-actions full"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Annuleren</button><button className="button button-primary">Schema opslaan</button></div>
      </form></Modal>}
      {toast && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={16} /></span>{toast}</div>}
    </div>
  )
}

function WorkoutCard({ workout, activity, expanded, onExpand, onDone, onSkip }: { workout: PlanWeek['workouts'][number]; activity?: RunActivity; expanded: boolean; onExpand: () => void; onDone: () => void; onSkip: () => void }) {
  const icon = workout.type === 'long' || workout.type === 'race' ? 'run' : workout.type === 'quality' ? 'spark' : 'clock'
  const canAddFeedback = workout.status === 'completed'
  return (
    <article className={'workout-card' + (expanded ? ' expanded' : '') + (workout.optional ? ' optional-card' : '')}>
      <div className="workout-day"><span>{workout.day.toUpperCase()}</span><strong>{new Date(workout.date + 'T12:00:00').getDate()}</strong><small>{new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(new Date(workout.date + 'T12:00:00'))}</small></div>
      <div className="workout-main">
        <div className="workout-title-row"><span className={'workout-type-icon type-' + workout.type}><Icon name={icon} size={16} /></span><h3>{workout.title}</h3>{workout.optional && <span className="optional-tag">Optioneel</span>}<StatusPill status={workout.status} /></div>
        <p className="workout-description">{workout.goal}</p>
        <div className="workout-meta"><span><Icon name="clock" size={14} />{workout.durationMinutes ? workout.durationMinutes + ' min' : workout.distanceKm + ' km'}{workout.timeCapMinutes ? ' · max. ' + workout.timeCapMinutes + ' min' : ''}</span><span className="meta-divider" /><span>{workout.intensity}</span></div>
        {workout.feedback && <div className="workout-feedback-inline"><strong>Jouw terugkoppeling</strong>{workout.feedback.effort && <span>{effortLabel(workout.feedback.effort)}</span>}{workout.feedback.note && <p>{workout.feedback.note}</p>}</div>}
        {activity && <LinkedActivitySummary activity={activity} />}
        {expanded && <div className="workout-detail">
          <p>{workout.description}</p>
          <div className="step-list">{workout.steps.map((step, idx) => <div className="step-row" key={idx}><span className="step-index">{String(idx + 1).padStart(2, '0')}</span><span>{step.label}{step.repeats ? ' · ' + step.repeats + '×' : ''}</span><b>{step.durationSeconds ? step.durationSeconds + ' sec' : step.durationMinutes ? step.durationMinutes + ' min' : ''}{step.intensity ? ' · ' + step.intensity : ''}{step.all4runningZone ? <small className="zone-chip">Z{step.all4runningZone === '4-5' ? '4–5' : step.all4runningZone}</small> : null}</b></div>)}</div>
          {workout.status === 'planned' && <div className="workout-actions"><button className="button button-primary button-small" onClick={onDone}><Icon name="check" size={15} /> Uitgevoerd</button><button className="text-button subtle" onClick={onSkip}>Overslaan</button></div>}
          {canAddFeedback && <div className="workout-actions"><button className="button button-outline button-small" onClick={onDone}>{workout.feedback ? 'Feedback aanpassen' : 'Feedback toevoegen'}</button></div>}
        </div>}
      </div>
      <button className="workout-open" aria-label={expanded ? 'Training sluiten' : 'Training bekijken'} onClick={onExpand}><Icon name="chevron" size={18} /></button>
    </article>
  )
}

function EmptyPlan({ onSetup }: { onSetup: () => void }) {
  return <section className="empty-plan"><div className="empty-plan-mark"><Icon name="plan" size={28} /></div><p className="eyebrow">EEN GOEDE START</p><h2>Stel je marathonplan in</h2><p>Vul je marathondatum, streeftijd en vaste trainingsdagen in. Je krijgt daarna een plan van 12, 16 of 20 weken.</p><button className="button button-primary" onClick={onSetup}>Plan instellen <Icon name="arrow" size={16} /></button></section>
}

function PlanView({ plan, activities, onWorkout, expandedWorkout }: { plan: DashboardData['plan']; activities: RunActivity[]; onWorkout: (id: string | null) => void; expandedWorkout: string | null }) {
  if (!plan) return <EmptyPlan onSetup={() => window.dispatchEvent(new CustomEvent('open-profile'))} />

  return (
    <section className="plan-page">
      <div className="plan-overview">
        <div>
          <span className="small-label">JOUW PLAN</span>
          <h2>{plan.length} weken · marathon op {dateLabel(plan.marathonDate, { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          <p>Doel {formatTime(plan.goalTime)} · drie vaste trainingen{plan.includeOptionalFourth ? ' plus één optionele training' : ''}</p>
        </div>
        <div className="plan-overview-icon"><Icon name="plan" size={22} /></div>
      </div>
      <div className="plan-week-list">
        {plan.weeks.map((week) => (
          <details className="plan-week" key={week.weekNumber} open={week.weekNumber === plan.currentWeek}>
            <summary>
              <span className="plan-week-number">{String(week.weekNumber).padStart(2, '0')}</span>
              <span className="plan-week-copy"><strong>{phaseLabel(week.phase)}</strong><small>{week.goal}</small></span>
              {week.isRecoveryWeek && <span className="recovery-tag">Herstelweek</span>}
              <span className="plan-week-count">{week.workouts.filter((item) => item.status === 'completed').length}/{week.workouts.filter((item) => !item.optional).length}<Icon name="chevron" size={17} /></span>
            </summary>
            <div className="plan-week-workouts">
              {week.workouts.map((workout) => {
                const linkedActivity = activities.find((activity) => activity.plannedWorkoutId === workout.id)
                return <div className="plan-workout-entry" key={workout.id}>
                  <div className="plan-row">
                    <div><span className="plan-row-date">{dateLabel(workout.date)}</span><strong>{workout.title}{workout.optional && <small className="optional-tag">Optioneel</small>}</strong></div>
                    <span className="plan-row-duration">{workout.durationMinutes ? workout.durationMinutes + ' min' : workout.distanceKm + ' km'}</span>
                    <StatusPill status={workout.status} />
                    <button className="icon-quiet" aria-label="Trainingdetails tonen" onClick={() => onWorkout(expandedWorkout === workout.id ? null : workout.id)}><Icon name="arrow" size={16} /></button>
                  </div>
                  {expandedWorkout === workout.id && <div className="plan-row-detail"><p>{workout.description}</p><div>{workout.steps.map((step, index) => <span key={index}>{step.label}{step.repeats ? ' · ' + step.repeats + '×' : ''}{step.durationMinutes ? ' · ' + step.durationMinutes + ' min' : ''}</span>)}</div></div>}
                  {linkedActivity && <LinkedActivitySummary activity={linkedActivity} />}
                </div>
              })}
            </div>
          </details>
        ))}
      </div>
      <p className="plan-disclaimer"><Icon name="shield" size={16} /> Schema is een flexibel uitgangspunt. Bespreek wijzigingen of aanhoudende klachten met je coach.</p>
    </section>
  )
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

function HistoryView({ activities, onAdd }: { activities: RunActivity[]; onAdd: () => void }) {
  const items = [...activities].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return <section className="history-page"><div className="history-toolbar"><div className="filter-chip active">Laatste 30 dagen</div><button className="button button-outline button-small" onClick={onAdd}><Icon name="plus" size={15} /> Handmatig toevoegen</button></div>{items.length ? <div className="history-list">{items.map((activity) => <article className="history-card" key={activity.id}><div className="history-date"><strong>{dateLabel(activity.startedAt, { day: 'numeric' })}</strong><span>{dateLabel(activity.startedAt, { month: 'short' })}</span></div><div className="history-activity-icon"><Icon name="run" size={18} /></div><div className="history-main"><div className="history-title-row"><h3>{activity.name}</h3><span className={'source-pill source-' + activity.source}>{activity.source === 'strava' ? <><Icon name="link" size={13} /> Strava</> : activitySourceLabel(activity.source)}</span></div><div className="history-meta"><span>{activity.distanceKm ? activity.distanceKm.toFixed(1).replace('.', ',') + ' km' : 'Afstand niet ingevuld'}</span><span>{activity.durationMinutes} min</span>{activity.pace && <span>{activity.pace} /km</span>}{activity.averageHeartRate && <span>{activity.averageHeartRate} bpm gem.</span>}</div>{activity.effort && <p className="history-feedback"><span>Gevoel</span>{effortLabel(activity.effort)}</p>}{activity.note && <p className="history-note">{activity.note}</p>}{activity.laps && activity.laps.length > 0 && <ActivityLapDetails laps={activity.laps} />}</div><span className={'history-link-status ' + (activity.plannedWorkoutId ? 'linked' : 'unlinked')}>{activity.plannedWorkoutId ? 'Gekoppeld' : 'Losse activiteit'}</span></article>)}</div> : <div className="empty-state"><div className="empty-plan-mark"><Icon name="history" size={24} /></div><h3>Nog geen trainingen</h3><p>Voeg na je training kort de belangrijkste gegevens toe.</p><button className="button button-primary button-small" onClick={onAdd}><Icon name="plus" size={15} /> Training toevoegen</button></div>}</section>
}

function TrainingDaysControl({ draft, setDraft }: { draft: ProfileDraft; setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>> }) {
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
              onClick={() => toggleProfileDay(setDraft, day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>
        <small className="day-selection-hint">Selecteer of deselecteer dagen. Je kunt eerst een nieuwe dag kiezen en daarna een oude uitzetten; opslaan vraagt precies drie dagen.</small>
      </div>
      <label className="optional-setting full">
        <input type="checkbox" checked={draft.optional} onChange={(event) => toggleOptional(event.target.checked)} />
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

function WellnessView({ wellness, todayWellness, draft, setDraft, onSubmit }: { wellness: WellnessEntry[]; todayWellness?: WellnessEntry; draft: WellnessDraft; setDraft: React.Dispatch<React.SetStateAction<WellnessDraft>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const entryDate = todayDateISO()
  return (
    <div className="wellness-layout">
      <section className="wellness-form-card">
        <div className="section-heading">
          <div><p className="eyebrow">VRIJBLIJVEND</p><h2>Hoe is je herstel?</h2></div>
          <span className="wellness-icon-large"><Icon name="heart" size={22} /></span>
        </div>
        <p className="muted">Vul alleen in wat je wilt delen. De velden zijn niet verplicht en er komen geen meldingen als je niets invult.</p>
        <div className="wellness-form-date"><Icon name="clock" size={16} /><span>Datum van invoer: <strong>{dateLabel(entryDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Deze datum wordt bij opslaan vastgelegd.</span></div>
        <form onSubmit={onSubmit} className="wellness-form">
          <label className="field"><span>Slaapduur <small>uur</small></span><input type="number" min="0" max="24" step="0.25" value={draft.sleepHours} onChange={(event) => setDraft({ ...draft, sleepHours: event.target.value })} placeholder="Bijv. 7,5" /></label>
          <label className="field"><span>Rusthartslag <small>bpm</small></span><input type="number" min="25" max="220" value={draft.restingHeartRate} onChange={(event) => setDraft({ ...draft, restingHeartRate: event.target.value })} placeholder="Bijv. 54" /></label>
          <div className="field full"><span>Herstelgevoel</span><div className="recovery-select">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={draft.recoveryScore === String(value)} className={draft.recoveryScore === String(value) ? 'selected' : ''} onClick={() => setDraft({ ...draft, recoveryScore: draft.recoveryScore === String(value) ? '' : String(value) })}><span>{value}</span><small>{['Slecht', 'Matig', 'Neutraal', 'Goed', 'Heel goed'][value - 1]}</small></button>)}</div></div>
          <label className="field full"><span>Korte opmerking <small>optioneel</small></span><textarea rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Bijvoorbeeld: drukke werkweek, voelde me fris tijdens het lopen" /></label>
          <label className="privacy-toggle full"><input type="checkbox" checked={draft.visibleToCoach} onChange={(event) => setDraft({ ...draft, visibleToCoach: event.target.checked })} /><span><strong>Deel deze gegevens met mijn coach</strong><small>Je kunt dit per invoer aanpassen.</small></span><Icon name="shield" size={18} /></label>
          <div className="form-actions full"><button className="button button-primary">Opslaan</button><span>Alle velden zijn optioneel.</span></div>
        </form>
      </section>
      <aside className="wellness-side">
        <div className="privacy-card">
          <span className="aside-icon light"><Icon name="shield" /></span><h3>Jij bepaalt wat je deelt</h3>
          <p>Herstelgegevens zijn ondersteunende context voor het coachgesprek. Ze zijn geen medische beoordeling of diagnose.</p>
          <div className="privacy-points"><span><Icon name="check" size={15} /> Geen dagelijkse verplichting</span><span><Icon name="check" size={15} /> Geen herinneringen bij lege velden</span><span><Icon name="check" size={15} /> Zelf kiezen of de coach meekijkt</span></div>
        </div>
        <div className="wellness-history">
          <div className="small-label">LAATSTE INVOER</div>
          {todayWellness ? <div className="wellness-entry">
            <strong>{dateLabel(todayWellness.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            <span>{todayWellness.sleepHours ? todayWellness.sleepHours + ' uur slaap' : 'Slaap niet ingevuld'}</span>
            {todayWellness.restingHeartRate ? <span>{todayWellness.restingHeartRate} bpm rusthartslag</span> : null}
            {todayWellness.recoveryScore ? <div className="wellness-entry-score"><EffortDots value={todayWellness.recoveryScore} /><small>herstelgevoel</small></div> : null}
          </div> : <p className="muted">Je hebt vandaag nog niets ingevuld.</p>}
          {wellness.filter((entry) => entry.date !== todayWellness?.date).slice(0, 4).map((entry) => (
            <div className="wellness-entry compact" key={entry.id}>
              <strong>{dateLabel(entry.date, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
              <span>{entry.recoveryScore ? 'Herstelgevoel ' + entry.recoveryScore + '/5' : entry.sleepHours ? entry.sleepHours + ' uur slaap' : 'Invoer opgeslagen'}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function ProfileView({ data, draft, setDraft, paces, onSubmit, onConnect, onSync, syncingStrava, onDisconnect, demoMode }: { data: DashboardData; draft: ProfileDraft; setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>; paces: ReturnType<typeof calculateTrainingPaces>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onConnect: () => void; onSync: () => void; syncingStrava: boolean; onDisconnect: () => void; demoMode: boolean }) {
  return (
    <div className="profile-layout">
      <form className="profile-form-card" onSubmit={onSubmit}>
        <div className="section-heading">
          <div><p className="eyebrow">MARATHONINSTELLINGEN</p><h2>Jouw startpunt</h2></div>
          <span className="profile-avatar">{data.profile.name.charAt(0)}</span>
        </div>
        <label className="field full"><span>Naam</span><input value={data.profile.name} readOnly /></label>
        <div className="form-row">
          <label className="field"><span>Marathondatum</span><input type="date" min={todayDateISO()} required value={draft.marathonDate} onChange={(event) => setDraft({ ...draft, marathonDate: event.target.value })} /></label>
          <label className="field"><span>Gewenste streeftijd <small>uu:mm:ss</small></span><input required pattern="\d{2}:\d{2}:\d{2}" value={draft.goalTime} onChange={(event) => setDraft({ ...draft, goalTime: event.target.value })} placeholder="04:00:00" /></label>
        </div>
        <PlanTimingNote draft={draft} />
        <div className="field full">
          <span>Planlengte</span>
          <div className="plan-length-options">{([12, 16, 20] as const).map((length) => <button type="button" key={length} aria-pressed={draft.planLength === length} className={draft.planLength === length ? 'selected' : ''} onClick={() => setDraft({ ...draft, planLength: length })}><strong>{length}</strong><span>weken</span></button>)}</div>
        </div>
        <TrainingDaysControl draft={draft} setDraft={setDraft} />
        <div className="field full">
          <span>Recente wedstrijdtijd <small>voor een eerste tempo-indicatie</small></span>
          <div className="form-row">
            <input type="number" min="1" step="0.1" aria-label="Wedstrijdafstand in kilometers" value={draft.raceDistance} onChange={(event) => setDraft({ ...draft, raceDistance: event.target.value })} />
            <input value={draft.raceTime} aria-label="Wedstrijdtijd" onChange={(event) => setDraft({ ...draft, raceTime: event.target.value })} placeholder="00:50:00" />
          </div>
        </div>
        <div className="pace-preview">
          <div><span className="small-label">EERSTE TEMPO-INDICATIE</span><span className="pace-preview-note">Richtlijn op basis van je wedstrijdresultaat; pas aan op gevoel en omstandigheden.</span></div>
          {paces ? <div className="pace-preview-grid"><span><small>E</small><b>{formatPace(paces.easy[0])}–{formatPace(paces.easy[1])}</b></span><span><small>M</small><b>{formatPace(paces.marathon)}</b></span><span><small>T</small><b>{formatPace(paces.threshold[0])}–{formatPace(paces.threshold[1])}</b></span><span><small>I</small><b>{formatPace(paces.interval[0])}–{formatPace(paces.interval[1])}</b></span></div> : <p className="muted">Vul een geldig resultaat in om een indicatie te zien.</p>}
        </div>
        <button className="button button-primary">Plan opslaan <Icon name="arrow" size={16} /></button>
      </form>
      <aside className="profile-side">
        <div className="strava-card">
          <div className="strava-logo"><span className="strava-mark">S</span><div><strong>Strava</strong><span>{data.stravaConnected ? 'Verbonden' : demoMode && data.activities.some((activity) => activity.source === 'strava') ? 'Verbonden in voorbeeld' : 'Nog niet gekoppeld'}</span></div></div>
          <p>Activiteiten worden automatisch opgehaald. Beschikbare laps of blokken worden getoond; zonder die gegevens blijft de totale training zichtbaar.</p>
          {data.stravaConnected && !demoMode
            ? <div className="strava-actions"><button type="button" className="button button-outline full-width" onClick={onSync} disabled={syncingStrava}><Icon name="history" size={16} /> {syncingStrava ? 'Synchroniseren…' : 'Nu synchroniseren'}</button><button type="button" className="text-button subtle" onClick={onDisconnect}>Koppeling verwijderen</button></div>
            : <button type="button" className="button button-outline full-width" onClick={onConnect}><Icon name="link" size={16} /> Strava koppelen</button>}
          <small>Je Strava-wachtwoord wordt nooit opgeslagen.</small>
        </div>
        <div className="profile-help"><span className="aside-icon lime"><Icon name="spark" /></span><h3>Gebruik je tempozones flexibel</h3><p>Tempo is een hulpmiddel. Hartslag, praattempo, ervaren inspanning en omstandigheden geven extra context.</p><PaceStrip /></div>
        <details className="zone-reference"><summary><span><strong>Hartslagzones volgens All4Running</strong><small>Open voor uitleg en praattempo</small></span><Icon name="chevron" size={18} /></summary><div className="zone-reference-list"><div><b>Z1</b><span><strong>Rustig</strong><small>&lt;75% · makkelijk praten</small></span></div><div><b>Z2</b><span><strong>Gecontroleerd</strong><small>75–82% · zinnen worden korter</small></span></div><div><b>Z3</b><span><strong>Vlot / drempel</strong><small>82–88% · korte zinnen</small></span></div><div><b>Z4</b><span><strong>Intensief</strong><small>89–92% · enkele woorden</small></span></div><div><b>Z5</b><span><strong>Korte versnelling</strong><small>&gt;92% · zwaar hijgen</small></span></div></div><p className="zone-note">Percentages zijn een richtlijn op basis van maximale hartslag. Gebruik ook je ademhaling en ervaren inspanning; hartslag hoeft niet ingevuld te zijn.</p><a className="zone-source" href="https://all4running.nl/blog/app/uploads/2025/05/HardloopschemaMarathonGevorderd.pdf" target="_blank" rel="noreferrer">Bekijk het All4Running-uitgangsschema <span>↗</span></a></details>
        <div className="profile-footnote"><Icon name="shield" size={16} /><span>Je account en trainingsgegevens zijn alleen zichtbaar volgens de coach-atleettoewijzing.</span></div>
      </aside>
    </div>
  )
}

function CoachView({ data, onAthlete, onSuggestions, onUpdateSuggestion }: { data: DashboardData; onAthlete: (athlete: AthleteSummary) => void; onSuggestions: () => void; onUpdateSuggestion: (suggestion: CoachSuggestion, status: CoachSuggestion['status']) => void }) {
  const planned = data.athletes.reduce((sum, athlete) => sum + athlete.plannedThisWeek, 0)
  const completed = data.athletes.reduce((sum, athlete) => sum + athlete.completedThisWeek, 0)
  const attention = data.athletes.filter((athlete) => athlete.risk !== 'green').length
  const pending = data.suggestions.filter((suggestion) => suggestion.status === 'pending')
  return <><div className="stat-grid"><StatCard label="Actieve atleten" value={String(data.athletes.length)} detail="toegewezen aan jou" icon="people" /><StatCard label="Trainingen deze week" value={completed + ' / ' + planned} detail="uitgevoerd / gepland" icon="week" tone="lime" /><StatCard label="Aandacht nodig" value={String(attention)} detail="coachgesprek kan helpen" icon="heart" tone="orange" /><StatCard label="Open voorstellen" value={String(pending.length)} detail="wachten op beoordeling" icon="spark" tone="lavender" /></div><div className="coach-dashboard-grid"><section className="coach-athletes-panel"><div className="section-heading"><div><p className="eyebrow">JOUW GROEP</p><h2>Atleten</h2></div><button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('open-invite'))}>Atleet uitnodigen <Icon name="arrow" size={16} /></button></div><AthleteRows athletes={data.athletes} onAthlete={onAthlete} /></section><aside className="suggestions-panel"><div className="section-heading"><div><p className="eyebrow">KLINISCHE AFWEGING</p><h2>Voorstellen</h2></div><button className="icon-quiet" aria-label="Alle voorstellen" onClick={onSuggestions}><Icon name="arrow" size={16} /></button></div>{pending.slice(0, 2).map((item) => <SuggestionCard key={item.id} suggestion={item} onUpdate={onUpdateSuggestion} compact />)}{pending.length === 0 && <div className="empty-small"><strong>Geen open voorstellen</strong><span>Er staat niets te beoordelen.</span></div>}<p className="coach-hint"><Icon name="shield" size={16} /> De app geeft signalen. Jij houdt de regie over iedere wijziging.</p></aside></div></>
}

function AthleteRows({ athletes, onAthlete }: { athletes: AthleteSummary[]; onAthlete: (athlete: AthleteSummary) => void }) {
  return <div className="athlete-rows">{athletes.map((athlete) => <button className="athlete-row" key={athlete.id} onClick={() => onAthlete(athlete)}><span className="athlete-avatar">{athlete.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="athlete-row-main"><strong>{athlete.name}</strong><small>Week {String(athlete.currentWeek).padStart(2, '0')} · {athlete.phase}</small></span><span className="athlete-row-progress"><span><b>{athlete.completedThisWeek}</b>/{athlete.plannedThisWeek} trainingen</span><i><em style={{ width: Math.min(100, Math.round((athlete.completedThisWeek / athlete.plannedThisWeek) * 100)) + '%' }} /></i></span><span className={'risk-indicator risk-' + athlete.risk}><i />{athlete.risk === 'green' ? 'Op schema' : athlete.risk === 'orange' ? 'Aandacht' : 'Actie nodig'}</span><Icon name="arrow" size={17} /></button>)}</div>
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

function AthleteDetail({ athlete, data, onBack, onSetupPlan, onAddNote }: { athlete: AthleteSummary; data: DashboardData; onBack: () => void; onSetupPlan: () => void; onAddNote: (note: string) => Promise<boolean> }) {
  const [noteDraft, setNoteDraft] = useState('')
  const recent = (athlete.activities ?? data.activities).slice(0, 30)
  const planWeeks = athlete.planWeeks ?? []

  async function submitCoachNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = noteDraft.trim()
    if (note && await onAddNote(note)) setNoteDraft('')
  }

  return <section className="athlete-detail-page">
    <button className="text-button back-button" onClick={onBack}>← Terug naar atleten</button>
    <div className="athlete-detail-hero">
      <span className="athlete-avatar large">{athlete.name.split(' ').map((part) => part[0]).join('')}</span>
      <div><p className="eyebrow">ATLEETPROFIEL</p><h2>{athlete.name}</h2><span>{athlete.marathonDate ? 'Marathon ' + dateLabel(athlete.marathonDate, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Nog geen schema ingesteld'}{athlete.goalTime ? ' · doel ' + formatTime(athlete.goalTime) : ''}</span></div>
      <span className={'risk-indicator risk-' + athlete.risk}><i />{athlete.risk === 'green' ? 'Op schema' : athlete.risk === 'orange' ? 'Aandacht' : 'Actie nodig'}</span>
    </div>
    <div className="detail-plan-actions"><button className="button button-outline button-small" onClick={onSetupPlan}><Icon name="plan" size={15} /> Plan instellen of bijwerken</button></div>
    <div className="stat-grid detail-stats">
      <StatCard label="Trainingsweek" value={String(athlete.currentWeek).padStart(2, '0') + ' / ' + athlete.planLength} detail={athlete.phase} icon="plan" />
      <StatCard label="Deze week" value={athlete.completedThisWeek + ' / ' + athlete.plannedThisWeek} detail="trainingen uitgevoerd" icon="week" tone="lime" />
      <StatCard label="Lange duurloop" value={athlete.lastLongRun?.split('·').pop()?.trim() ?? '—'} detail={athlete.lastLongRun ?? 'nog niet geregistreerd'} icon="run" tone="lavender" />
      <StatCard label="Laatste feedback" value={athlete.lastFeedback ?? 'Nog geen feedback'} detail={athlete.lastActivity ?? 'Geen recente activiteit'} icon="heart" tone="orange" />
    </div>
    {athlete.reason && <div className="attention-note"><Icon name="spark" size={18} /><span><strong>Coachcontext</strong>{athlete.reason}</span></div>}
    {athlete.wellness && athlete.wellness.length > 0 && <div className="shared-wellness"><strong>Gedeelde herstelgegevens</strong>{athlete.wellness.slice(0, 3).map((item) => <span key={item.id}>{dateLabel(item.date, { day: 'numeric', month: 'short' })}{item.sleepHours ? ' · ' + item.sleepHours + ' uur slaap' : ''}{item.restingHeartRate ? ' · ' + item.restingHeartRate + ' bpm rusthartslag' : ''}{item.recoveryScore ? ' · herstel ' + item.recoveryScore + '/5' : ''}</span>)}</div>}
    {planWeeks.length > 0 && <section className="coach-plan-timeline">
      <div className="section-heading"><div><p className="eyebrow">PLANNING</p><h2>Volledig trainingsplan</h2></div></div>
      <div className="plan-week-list">{planWeeks.map((week) => {
        const completed = week.workouts.filter((workout) => workout.status === 'completed').length
        return <details className="plan-week" key={week.weekNumber} open={week.weekNumber === athlete.currentWeek}>
          <summary><span className="plan-week-number">{String(week.weekNumber).padStart(2, '0')}</span><span className="plan-week-copy"><strong>Week {week.weekNumber} · {phaseLabel(week.phase)}{week.isRecoveryWeek ? ' · Herstelweek' : ''}</strong><small>{week.goal}</small></span><span className="plan-week-count">{completed}/{week.workouts.length}<Icon name="chevron" size={16} /></span></summary>
          <div className="plan-week-workouts">{week.workouts.map((workout) => <div key={workout.id}><div className="plan-row"><div><span className="plan-row-date">{dateLabel(workout.date)}</span><strong>{workout.title}{workout.optional && <span className="optional-tag"> Optioneel</span>}</strong></div><span className="plan-row-duration">{workout.durationMinutes ? workout.durationMinutes + ' min' : workout.distanceKm + ' km'}</span><StatusPill status={workout.status} /></div><div className="plan-row-detail">{workout.goal}{workout.intensity ? ' · ' + workout.intensity : ''}</div>{workout.feedback && <div className="coach-workout-feedback"><strong>Atleetfeedback</strong>{workout.feedback.effort && <span>{effortLabel(workout.feedback.effort)}</span>}{workout.feedback.note && <p>{workout.feedback.note}</p>}{workout.feedback.completedAt && <small>Ingevuld {dateLabel(workout.feedback.completedAt)}</small>}</div>}{recent.filter((activity) => activity.plannedWorkoutId === workout.id).slice(0, 1).map((activity) => <LinkedActivitySummary key={activity.id} activity={activity} />)}</div>)}</div>
        </details>
      })}</div>
    </section>}
    <section className="wellness-history coach-notes">
      <div className="section-heading"><div><p className="eyebrow">ALLEEN VOOR DE COACH</p><h2>Coachnotities</h2></div></div>
      <p className="muted">Deze notities zijn alleen zichtbaar voor jou en worden bij dit atletenprofiel bewaard.</p>
      <form className="form-grid" onSubmit={submitCoachNote}><label className="field full"><span>Nieuwe notitie <small>max. 1000 tekens</small></span><textarea rows={3} maxLength={1000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Bijvoorbeeld: bespreken hoe de lange duurloop voelde." /></label><div className="form-actions full"><button className="button button-primary button-small" disabled={!noteDraft.trim()}>Notitie opslaan</button></div></form>
      {(athlete.coachNotes ?? []).length === 0 ? <p className="muted">Nog geen notities toegevoegd.</p> : (athlete.coachNotes ?? []).map((item) => <div className="wellness-entry" key={item.id}><strong>{dateLabel(item.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</strong><span>{item.note}</span></div>)}
    </section>
    <div className="section-heading"><div><p className="eyebrow">LAATSTE 30 DAGEN</p><h2>Trainingsgeschiedenis</h2></div></div>
    <div className="history-list compact-history">{recent.map((activity) => <div className="history-card" key={activity.id}><div className="history-activity-icon"><Icon name="run" size={18} /></div><div className="history-main"><div className="history-title-row"><h3>{activity.name}</h3><span className={'source-pill source-' + activity.source}>{activitySourceLabel(activity.source)}</span></div><div className="history-meta"><span>{dateLabel(activity.startedAt)}</span><span>{activity.distanceKm ? activity.distanceKm.toFixed(1).replace('.', ',') + ' km' : '—'}</span><span>{activity.durationMinutes} min</span>{activity.pace && <span>{activity.pace} /km</span>}</div>{activity.effort && <p className="history-feedback"><span>Gevoel</span>{effortLabel(activity.effort)}</p>}{activity.note && <p className="history-note">{activity.note}</p>}</div></div>)}</div>
    <p className="plan-disclaimer"><Icon name="shield" size={16} /> Herstelgegevens zijn alleen zichtbaar als de atleet deze met jou deelt.</p>
  </section>
}
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">MARATHON COACH</p><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-quiet modal-close" aria-label="Venster sluiten" onClick={onClose}><Icon name="close" /></button></div>{children}</section></div>
}
