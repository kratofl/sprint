'use client'

import { useState } from 'react'
import { FormSelect } from '@/components/app/form-select'
import { SettingsRow, SettingsSection } from '@/components/app/settings-surface'
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

const sliderClass = 'h-4 min-w-0 flex-1 accent-brand-500'

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
    <SettingsSection title="Appearance" aside={<span className="text-footnote text-label-secondary">Saved in this browser</span>}>
      <SettingsRow title={<label htmlFor="theme">Theme</label>} description="System follows your device’s light or dark mode.">
        <FormSelect
          id="theme"
          className="w-36"
          value={preferences.theme}
          options={THEMES}
          onValueChange={(theme) => update({ ...preferences, theme })}
        />
      </SettingsRow>

      <SettingsRow title={<label htmlFor="motion">Motion</label>} description="How long animations take. All the way left turns them off.">
        <div className="flex w-72 flex-wrap items-center gap-x-2.5 gap-y-2">
          <input
            id="motion"
            type="range"
            className={sliderClass}
            min={motionRange.min}
            max={motionRange.max}
            step={motionRange.step}
            value={preferences.motion}
            aria-valuetext={motionText(preferences.motion)}
            onChange={(event) => update({ ...preferences, motion: event.currentTarget.valueAsNumber })}
            onPointerUp={replay}
            onKeyUp={replay}
          />
          <output htmlFor="motion" className="min-w-12 text-right text-label-secondary tabular-nums">
            {motionText(preferences.motion)}
          </output>
          {/* A dot that glides across once at the chosen motion length when the slider is released. */}
          <span aria-hidden className="relative h-2 basis-full before:absolute before:inset-x-0 before:top-[3px] before:h-0.5 before:rounded-full before:bg-fill-strong">
            <span
              key={preview}
              className="absolute top-0 left-[calc(100%-8px)] size-2 rounded-full bg-brand-500 [animation:glide_calc(var(--motion)*2)_var(--ease-out)_both]"
            />
          </span>
        </div>
      </SettingsRow>

      <SettingsRow title={<label htmlFor="glass">Glass</label>} description="How much the sidebar and toolbar let through what’s behind them.">
        <div className="flex w-72 items-center gap-2.5">
          <span aria-hidden className="text-footnote text-label-secondary">
            Clear
          </span>
          <input
            id="glass"
            type="range"
            className={sliderClass}
            min={glassRange.min}
            max={glassRange.max}
            step={glassRange.step}
            value={preferences.glass}
            aria-valuetext={`${preferences.glass}% opaque`}
            onChange={(event) => update({ ...preferences, glass: event.currentTarget.valueAsNumber })}
          />
          <span aria-hidden className="text-footnote text-label-secondary">
            Tinted
          </span>
        </div>
      </SettingsRow>
    </SettingsSection>
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
