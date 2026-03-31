import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * Sprint logo — "The Sector Spike"
 *
 * Icon mark: a forward-leaning triangular spike (orange #ff906c) over a teal
 * baseline (#1EA58C). Asymmetric geometry — steep left rise, gradual right
 * fall — creates directionality (speed, forward motion).
 *
 * Orange = driver/primary. Teal = engineer/analytical.
 */

const SIZES = {
  sm: { iconH: 20, fontSize: 13, gap: 7,  letterSpacing: 2 },
  md: { iconH: 26, fontSize: 17, gap: 9,  letterSpacing: 2.5 },
  lg: { iconH: 34, fontSize: 22, gap: 12, letterSpacing: 3 },
} as const

export interface SprintLogoProps {
  iconOnly?: boolean
  size?: keyof typeof SIZES
  className?: string
}

/**
 * Full Sprint logo (icon mark + "SPRINT" wordmark) or icon-only variant.
 * Renders as an inline SVG — no external file dependency.
 */
export function SprintLogo({ iconOnly = false, size = 'md', className }: SprintLogoProps) {
  const { iconH, fontSize, gap, letterSpacing } = SIZES[size]
  const scale = iconH / 32
  const iconW = Math.round(48 * scale)

  if (iconOnly) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 32"
        width={iconW}
        height={iconH}
        fill="none"
        aria-label="Sprint"
        className={cn('shrink-0', className)}
      >
        <SprintMark />
      </svg>
    )
  }

  // Estimate wordmark width: Space Grotesk Bold ≈ 0.60× fontSize per char
  const textW = Math.ceil('SPRINT'.length * fontSize * 0.60 + 5 * letterSpacing)
  const totalW = iconW + gap + textW

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalW} ${iconH}`}
      width={totalW}
      height={iconH}
      fill="none"
      aria-label="Sprint"
      className={cn('shrink-0', className)}
    >
      <g transform={`scale(${scale})`}>
        <SprintMark />
      </g>
      <text
        x={iconW + gap}
        y={iconH - 1}
        fontFamily="Space Grotesk, system-ui, sans-serif"
        fontWeight="700"
        fontSize={fontSize}
        letterSpacing={letterSpacing}
        fill="#F4F4F5"
      >
        SPRINT
      </text>
    </svg>
  )
}

/**
 * Standalone icon mark — the sector spike only.
 * Use for favicons, small avatars, collapsed nav.
 */
export function SprintIcon({ size = 24, className }: { size?: number; className?: string }) {
  const scale = size / 32
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 32"
      width={Math.round(48 * scale)}
      height={size}
      fill="none"
      aria-label="Sprint"
      className={cn('shrink-0', className)}
    >
      <SprintMark />
    </svg>
  )
}

/**
 * The raw icon mark geometry, designed in a 48×32 coordinate space.
 *
 * Teal baseline at y=28 + orange forward-leaning spike.
 * Spike rise: x 4→19 (span 15px, steep)
 * Spike fall: x 19→42 (span 23px, gradual = forward lean / speed)
 */
function SprintMark() {
  return (
    <>
      {/* Teal baseline */}
      <line
        x1="0" y1="28" x2="48" y2="28"
        stroke="#1EA58C"
        strokeWidth="2"
        strokeLinecap="square"
      />
      {/* Orange spike — forward-leaning asymmetric triangle */}
      <polygon points="4,28 19,4 42,28" fill="#ff906c" />
    </>
  )
}
