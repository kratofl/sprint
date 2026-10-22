import { IconCheck } from '@tabler/icons-react'
import type { SaveState } from '@/lib/settings'

// Inline result of a settings save: a short-lived "Saved" confirmation (it
// replays on every save, keyed by when it landed) or the API's error. The
// region stays mounted so screen readers announce what appears in it.
export default function SaveFeedback({ state }: { state: SaveState }) {
  return (
    <div className="save-feedback" role="status" aria-live="polite">
      {state.kind === 'saved' && (
        <span key={state.at} className="save-note">
          <IconCheck size={14} stroke={2.4} aria-hidden />
          Saved
        </span>
      )}
      {state.kind === 'failed' && <span className="alert save-error">{state.message}</span>}
    </div>
  )
}
