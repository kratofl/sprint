import { IconMinus, IconSquareDashed, IconX } from '@tabler/icons-react'
import { windowAPI } from '@/lib/window'

/**
 * Window traffic-light cluster — lives at the top-right of the content header
 * (Figma "Frame 4": minimise 44, maximise 44, close 40; Tabler icons 16). The
 * whole shell header is a Wails drag region; these buttons opt out via no-drag.
 */
export function WindowControls() {
  return (
    <div app-region="no-drag" className="flex h-[32px] items-center">
      <button
        type="button"
        onClick={() => { void windowAPI.minimise() }}
        aria-label="Minimise"
        className="flex h-[32px] w-[44px] items-center justify-center rounded-[8px] text-[var(--text3)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] focus-visible:bg-[var(--panel2)] focus-visible:text-[var(--text)] focus-visible:outline-none"
      >
        <IconMinus size={16} />
      </button>
      <button
        type="button"
        onClick={() => { void windowAPI.toggleMaximise() }}
        aria-label="Maximise"
        className="flex h-[32px] w-[44px] items-center justify-center rounded-[8px] text-[var(--text3)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] focus-visible:bg-[var(--panel2)] focus-visible:text-[var(--text)] focus-visible:outline-none"
      >
        <IconSquareDashed size={16} />
      </button>
      <button
        type="button"
        onClick={() => { void windowAPI.close() }}
        aria-label="Close"
        className="flex h-[32px] w-[40px] items-center justify-center rounded-[8px] text-[var(--text3)] transition-colors hover:bg-[var(--red)] hover:text-white focus-visible:bg-[var(--red)] focus-visible:text-white focus-visible:outline-none"
      >
        <IconX size={16} />
      </button>
    </div>
  )
}
