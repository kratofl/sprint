import { useState, useCallback, useEffect } from 'react'
import type { ReleaseInfo } from '@sprint/types'
import { UPDATE_EVENTS } from '@/lib/desktopEvents'
import { updateAPI } from '@/lib/settings'
import { onEvent } from '@/lib/wails'

interface UseUpdateCheckResult {
  releaseInfo: ReleaseInfo | null
  installing: boolean
  dismiss: () => void
  install: () => void
}

export function useUpdateCheck(): UseUpdateCheckResult {
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const unsub = onEvent(UPDATE_EVENTS.available, (info) => {
      setReleaseInfo(info)
      setDismissed(false)
    })
    return unsub
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  const install = useCallback(() => {
    if (!releaseInfo) return
    setInstalling(true)
    updateAPI.install(releaseInfo.downloadURL).catch(() => {
      setInstalling(false)
    })
  }, [releaseInfo])

  return {
    releaseInfo: dismissed ? null : releaseInfo,
    installing,
    dismiss,
    install,
  }
}
