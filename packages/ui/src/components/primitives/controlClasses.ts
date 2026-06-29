// Figma "Button" component recipes — flat fills, design tokens only.
// Primary: bg Orange/500, text Neutral/900 (text on accent fill).
export const buttonPrimaryClassName =
  "border-[var(--accent)] bg-[var(--accent)] text-[var(--panel)] hover:border-[var(--accent)] hover:bg-[var(--accent)]"

// Secondary: bg Neutral/800 (Surface/Tile), text Neutral/50, 1px Neutral/700 border.
export const buttonNeutralClassName =
  "border-[var(--line)] bg-[var(--panel2)] text-[var(--text)] hover:border-[var(--line2)] hover:bg-[var(--panel3)] hover:text-[var(--text)]"

export const buttonSecondaryClassName =
  "border-[var(--line)] bg-[var(--panel2)] text-[var(--text)] hover:border-[var(--line2)] hover:bg-[var(--panel3)] hover:text-[var(--text)]"

export const buttonGhostClassName =
  "border-transparent text-[var(--text2)] hover:border-[var(--line)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"

// Destructive: bg Neutral/800 (Surface/Tile), text Red/500, 1px Neutral/700 border.
export const buttonDestructiveClassName =
  "border-[var(--line)] bg-[var(--panel2)] text-[var(--red)] hover:border-[var(--line2)] hover:bg-[var(--panel3)] hover:text-[var(--red)]"

export const buttonActiveClassName =
  "border-[var(--accent)] bg-[var(--panel3)] text-[var(--accent)] hover:bg-[var(--panel3)]"

// Figma "Primary_Success" / "Primary_Error" message buttons — solid status fills.
export const buttonSuccessClassName =
  "border-[var(--green)] bg-[var(--green)] text-[var(--panel)] hover:border-[var(--green)] hover:bg-[var(--green)] hover:text-[var(--panel)]"

export const buttonErrorClassName =
  "border-[var(--red)] bg-[var(--red)] text-[var(--panel)] hover:border-[var(--red)] hover:bg-[var(--red)] hover:text-[var(--panel)]"

export const cardDefaultClassName = "border-[var(--line)] bg-[var(--panel)] shadow-none"
export const cardAccentClassName = "border-[var(--accent)] bg-[var(--panel)]"
export const cardSecondaryClassName = "border-[var(--line)] bg-[var(--panel2)] shadow-none"
export const cardElevatedClassName = "border-[var(--line)] bg-[var(--panel)] shadow-none"
export const cardDestructiveClassName = "border-[var(--red)] bg-[var(--red-soft)]"
