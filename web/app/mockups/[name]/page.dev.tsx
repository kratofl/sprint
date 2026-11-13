import { notFound } from 'next/navigation'
import Backdrop from '@/components/Backdrop'
import { AppShell } from '@/components/app/app-shell'
import { ErrorState } from '@/components/app/states'
import { isMockupVariant, type Mockup } from '@/lib/mockup'
import type { ViewerState } from '@/lib/records'

// One option of a design mockup (lib/mockup.ts), /mockups/<name>?variant=A|B|C. A `.dev.tsx` page:
// next.config.ts only reads that extension under `next dev`, so no other build has this route.
// Public in lib/auth/route.ts: it shows made-up data and calls no API.

// The made-up account in the shell's profile row.
const SAMPLE_VIEWER: ViewerState = {
  kind: 'signed-in',
  viewer: { id: 'mockup', email: 'alex@example.com', displayName: 'Alex Driver', avatarUrl: null, isAdmin: false, createdAt: '2026-01-01T00:00:00Z' },
}

export default async function MockupPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { name } = await params
  const { variant } = await searchParams
  if (!/^[a-z0-9-]+$/.test(name)) notFound()

  // Typed by the mockup file's own `satisfies Mockup`, which tsc checks with the app.
  const mockup = await import(`../../../mockups/${name}.tsx`).then(
    (module: { default: Mockup }) => module.default,
    () => null,
  )
  if (mockup === null) return <MockupProblem text={`No mockup web/mockups/${name}.tsx`} />
  if (!isMockupVariant(variant)) return <MockupProblem text={`variant must be A, B or C (got ${String(variant ?? 'none')})`} />

  const Variant = mockup.variants[variant]
  if ('bare' in mockup) return <Variant />
  return (
    <AppShell viewer={SAMPLE_VIEWER} backdrop={<Backdrop tone="ambient" />} page={mockup.page}>
      <Variant />
    </AppShell>
  )
}

function MockupProblem({ text }: { text: string }) {
  return <ErrorState title="Mockup not shown" body={text} className="min-h-screen" />
}
