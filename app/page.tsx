import { Dashboard } from './dashboard'
import { createDemoData } from '@/lib/demo-data'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data'
import { redirect } from 'next/navigation'
import { SetupRequired } from '@/components/setup-required'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!isSupabaseConfigured()) return <Dashboard initialData={createDemoData()} demoMode />
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  let data: Awaited<ReturnType<typeof loadDashboardData>>
  try {
    data = await loadDashboardData()
  } catch {
    return <SetupRequired />
  }
  return <Dashboard initialData={data} demoMode={false} />
}
