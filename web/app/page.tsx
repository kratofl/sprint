import { monthOf } from '@/lib/period'
import Overview from './Overview'

// Rendered per request so the stepper opens on the current month.
export const dynamic = 'force-dynamic'

export default function Home() {
  return <Overview initialMonth={monthOf(new Date())} />
}
