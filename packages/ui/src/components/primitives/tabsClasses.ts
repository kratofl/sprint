export const tabsRootBaseClassName =
  "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row"

export const tabsListBaseClassName = "group/tabs-list"

// Figma "Tab View": pill container bg Neutral/800 (#1F1F1F), 1px border
// Neutral/700 (#2E2E2E), radius xl (18), padding 4. Triggers separated by 1px
// Neutral/700 dividers (left border on every trigger after the first).
export const tabsListVariantClassNames = {
  default:
    "inline-flex w-fit items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-1 text-[var(--muted)] group-data-[orientation=horizontal]/tabs:h-[33px] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col [&>*+*]:border-l [&>*+*]:border-[var(--line)] group-data-[orientation=vertical]/tabs:[&>*+*]:border-l-0 group-data-[orientation=vertical]/tabs:[&>*+*]:border-t group-data-[orientation=vertical]/tabs:[&>*+*]:border-[var(--line)]",
  line:
    "inline-flex w-full items-center justify-start gap-[2px] rounded-none border-b border-[var(--border)] bg-transparent p-0 text-[var(--muted)] group-data-[orientation=horizontal]/tabs:h-[35px] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  top:
    "inline-flex w-full items-stretch justify-start gap-[2px] rounded-alert border-b border-[var(--border)] bg-[var(--panel-2)] p-1 text-[var(--muted)]",
  compact:
    "inline-flex w-fit items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-1 text-[var(--muted)] [&>*+*]:border-l [&>*+*]:border-[var(--line)]",
  vertical:
    "inline-flex h-full flex-col items-stretch justify-start gap-[2px] rounded-control border border-[var(--border)] bg-[var(--panel)] p-1 text-[var(--muted)]",
} as const

export type TabsListVariant = keyof typeof tabsListVariantClassNames

// Figma "Tab View" items: Inter Medium 13, title-case (no uppercase / wordmark).
export const tabsTriggerBaseClassName =
  "relative inline-flex h-[25px] flex-1 items-center justify-center gap-1.5 rounded-pill border border-transparent px-[14px] py-[6px] font-sans text-[13px] font-medium normal-case tracking-[0] whitespace-nowrap text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start group-data-[variant=line]/tabs-list:h-[25px] group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-x-0 group-data-[variant=line]/tabs-list:border-t-0 group-data-[variant=top]/tabs-list:h-[25px] group-data-[variant=top]/tabs-list:flex-none group-data-[variant=top]/tabs-list:rounded-tile group-data-[variant=compact]/tabs-list:h-[25px] group-data-[variant=vertical]/tabs-list:h-[25px] group-data-[variant=vertical]/tabs-list:flex-none group-data-[variant=vertical]/tabs-list:rounded-tile [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[10px]"

// Figma "Tab View" active item: NOT an orange-filled segment (that is the
// Segmented Control). The active tab keeps the flat pill and is marked by the
// subtle Surface/Tile-2 (#2E2E2E) selected fill + Orange/500 accent text — the
// same selected treatment as a NavigationItem.
export const tabsTriggerActiveClassName =
  "data-[state=active]:bg-[var(--panel3)] data-[state=active]:text-[var(--accent)] data-[state=active]:border-transparent group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:text-[var(--orange)] group-data-[variant=line]/tabs-list:data-[state=active]:border-b-2 group-data-[variant=line]/tabs-list:data-[state=active]:border-b-[var(--orange)] group-data-[variant=top]/tabs-list:data-[state=active]:bg-[var(--panel-4)] group-data-[variant=top]/tabs-list:data-[state=active]:text-[var(--orange)] group-data-[variant=top]/tabs-list:data-[state=active]:border-[var(--orange)] group-data-[variant=top]/tabs-list:data-[state=active]:shadow-none group-data-[variant=compact]/tabs-list:data-[state=active]:bg-[var(--panel3)] group-data-[variant=compact]/tabs-list:data-[state=active]:text-[var(--accent)] group-data-[variant=compact]/tabs-list:data-[state=active]:border-transparent group-data-[variant=vertical]/tabs-list:data-[state=active]:bg-[var(--panel-3)] group-data-[variant=vertical]/tabs-list:data-[state=active]:text-[var(--orange)] group-data-[variant=vertical]/tabs-list:data-[state=active]:border-[var(--orange)]"
