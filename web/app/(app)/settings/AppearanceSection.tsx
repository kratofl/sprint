'use client'

import { useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { Card } from '@/components/Card'
import {
  appearanceStyle,
  glassRange,
  motionRange,
  preferencesCookie,
  themeAttribute,
  type Preferences,
  type Theme,
} from '@/lib/preferences'

const THEMES: readonly { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// This browser's look: theme, motion and glass. Every change applies to the
// page at once (so the sliders preview live while dragging) and is stored in
// the preferences cookie the root layout reads on the next load.
export default function AppearanceSection({ initial }: { initial: Preferences }) {
  const [preferences, setPreferences] = useState(initial)
  // Bumped when a motion change is committed, to replay the preview once.
  const [preview, setPreview] = useState(0)
  const update = (next: Preferences) => {
    setPreferences(next)
    apply(next)
  }
  const replay = () => setPreview((count) => count + 1)

  return (
    <Card title="Appearance" action={<span className="card-meta">Saved in this browser</span>}>
      <div className="setting">
        <label className="setting-text" htmlFor="theme">
          <span className="setting-label">Theme</span>
          <span className="setting-hint">System follows your device’s light or dark mode.</span>
        </label>
        <span className="select">
          <select
            id="theme"
            value={preferences.theme}
            onChange={(event) => {
              const theme = THEMES.find((option) => option.value === event.currentTarget.value)
              if (theme) update({ ...preferences, theme: theme.value })
            }}
          >
            {THEMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <IconChevronDown className="select-chevron" size={12} stroke={2.4} aria-hidden />
        </span>
      </div>

      <div className="setting setting-divided">
        <label className="setting-text" htmlFor="motion">
          <span className="setting-label">Motion</span>
          <span className="setting-hint">How long animations take. All the way left turns them off.</span>
        </label>
        <div className="slider-control">
          <input
            id="motion"
            type="range"
            min={motionRange.min}
            max={motionRange.max}
            step={motionRange.step}
            value={preferences.motion}
            aria-valuetext={motionText(preferences.motion)}
            onChange={(event) => update({ ...preferences, motion: event.currentTarget.valueAsNumber })}
            onPointerUp={replay}
            onKeyUp={replay}
          />
          <output htmlFor="motion" className="slider-value">
            {motionText(preferences.motion)}
          </output>
          <span className="motion-preview" aria-hidden>
            <span key={preview} className="motion-preview-dot" />
          </span>
        </div>
      </div>

      <div className="setting setting-divided">
        <label className="setting-text" htmlFor="glass">
          <span className="setting-label">Glass</span>
          <span className="setting-hint">How much the sidebar and toolbar let through what’s behind them.</span>
        </label>
        <div className="slider-control">
          <span className="slider-end" aria-hidden>
            Clear
          </span>
          <input
            id="glass"
            type="range"
            min={glassRange.min}
            max={glassRange.max}
            step={glassRange.step}
            value={preferences.glass}
            aria-valuetext={`${preferences.glass}% opaque`}
            onChange={(event) => update({ ...preferences, glass: event.currentTarget.valueAsNumber })}
          />
          <span className="slider-end" aria-hidden>
            Tinted
          </span>
        </div>
      </div>
    </Card>
  )
}

// "220 ms", or "Off" at zero.
function motionText(motion: number): string {
  return motion === 0 ? 'Off' : `${motion} ms`
}

// Applies preferences to the live document and stores them for the next load.
function apply(preferences: Preferences) {
  const root = document.documentElement
  for (const [name, value] of Object.entries(appearanceStyle(preferences))) root.style.setProperty(name, value)
  const theme = themeAttribute(preferences.theme)
  if (theme === undefined) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  document.cookie = preferencesCookie(preferences)
}
