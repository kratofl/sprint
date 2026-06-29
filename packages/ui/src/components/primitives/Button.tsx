import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"
import {
  buttonActiveClassName,
  buttonDestructiveClassName,
  buttonErrorClassName,
  buttonGhostClassName,
  buttonNeutralClassName,
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  buttonSuccessClassName,
} from "./controlClasses"

// Figma "Button": Inter Medium 13, gap 4 (icon↔label), radius xl (18), pad 6×16.
// Visible accent focus ring (focus-visible border Orange/500), disabled chrome,
// macOS HIG min hit target. Icon size = 32×32 circle with a per-variant inner border.
const buttonVariants = cva(
  "btn group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-sans text-[13px] font-medium tracking-[0] whitespace-nowrap normal-case transition-colors outline-none select-none focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--panel)] disabled:text-[var(--text3)] aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-invalid:border-[var(--red)] aria-invalid:ring-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: buttonPrimaryClassName,
        primary: buttonPrimaryClassName,
        outline: buttonNeutralClassName,
        neutral: buttonNeutralClassName,
        secondary: buttonSecondaryClassName,
        ghost: cn("ghost", buttonGhostClassName),
        destructive: cn("danger", buttonDestructiveClassName),
        active: buttonActiveClassName,
        success: buttonSuccessClassName,
        error: buttonErrorClassName,
        link: "border-transparent text-[var(--text2)] underline-offset-4 hover:text-[var(--accent)] hover:underline",
      },
      size: {
        default:
          "h-[28px] gap-1 rounded-[18px] px-4 py-1.5 [&_svg:not([class*='size-'])]:size-[13px]",
        xs: "h-[24px] gap-1 rounded-[18px] px-2.5 py-1 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[26px] gap-1 rounded-[18px] px-3 py-1 text-[12px] [&_svg:not([class*='size-'])]:size-[13px]",
        lg: "h-[32px] gap-1.5 rounded-[18px] px-5 py-2 text-[14px] [&_svg:not([class*='size-'])]:size-4",
        icon: "size-[32px] rounded-[999px] p-1 [&_svg:not([class*='size-'])]:size-6",
        "icon-xs": "size-6 rounded-[999px] p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[28px] rounded-[999px] p-1 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-lg": "size-[40px] rounded-[999px] p-1 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        className: "h-auto px-0 py-0",
      },
      // Figma icon-button stroke treatment: primary inner border Orange/400,
      // secondary/destructive/neutral/outline inner border Neutral/700.
      {
        variant: ["primary", "default"],
        size: ["icon", "icon-xs", "icon-sm", "icon-lg"],
        className: "border-[var(--primitive-color-orange-400)]",
      },
      {
        variant: ["secondary", "neutral", "outline", "destructive"],
        size: ["icon", "icon-xs", "icon-sm", "icon-lg"],
        className: "border-[var(--line)] bg-[var(--panel2)]",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

// Group variants by fill colour so the pop only fires on a real colour change
// (e.g. primary→success / primary→error), not on every variant swap.
function fillColorGroup(variant: ButtonProps["variant"]): string {
  switch (variant) {
    case "primary":
    case "default":
    case "active":
      return "accent"
    case "success":
      return "success"
    case "error":
      return "error"
    case "destructive":
      return "destructive"
    default:
      return "neutral"
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}
export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Optional leading/trailing Tabler icon. */
    icon?: React.ReactNode
    iconPosition?: "left" | "right"
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  icon,
  iconPosition = "left",
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  // Subtle spring "pop" when the fill colour changes (orange→green/red), e.g. a
  // primary action confirming as success or failing as error. Reduced-motion safe.
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const prevColorGroup = React.useRef(fillColorGroup(variant))
  React.useEffect(() => {
    const group = fillColorGroup(variant)
    if (prevColorGroup.current === group) return
    prevColorGroup.current = group
    const node = buttonRef.current
    if (asChild || !node || typeof node.animate !== "function" || prefersReducedMotion()) return
    node.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
      { duration: 300, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
    )
  }, [variant, asChild])

  // asChild requires a single child; skip the icon wrapper so Slot stays valid.
  const content =
    asChild || !icon ? (
      children
    ) : iconPosition === "right" ? (
      <>
        {children}
        <span data-icon="inline-end" className="inline-flex shrink-0">
          {icon}
        </span>
      </>
    ) : (
      <>
        <span data-icon="inline-start" className="inline-flex shrink-0">
          {icon}
        </span>
        {children}
      </>
    )

  return (
    <Comp
      ref={asChild ? undefined : buttonRef}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
