'use client'

import { useState, useTransition } from 'react'
import { IconHeadset } from '@tabler/icons-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { acceptEngineerInvite } from '@/lib/server/actions'

// The accept button of an invite link for a signed-in visitor. Success goes on to
// the engineers page (the Server Action redirects); a failure shows inline.
export default function AcceptInvite({ token, signedInAs }: { token: string; signedInAs: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        size="lg"
        className="mt-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const result = await acceptEngineerInvite(token)
            if (result.kind === 'failed') setError(result.message)
          })
        }
      >
        <IconHeadset />
        {pending ? 'Accepting…' : 'Accept invite'}
      </Button>
      <p className="text-footnote text-label-secondary">Signed in as {signedInAs}</p>
    </div>
  )
}
