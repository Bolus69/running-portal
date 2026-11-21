import { Dashboard } from '../dashboard'
import { createDemoData } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'

export default function DemoPage() {
  return <Dashboard initialData={createDemoData()} demoMode />
}
