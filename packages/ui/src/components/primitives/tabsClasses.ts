export const tabsRootBaseClassName =
  "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row"

export const tabsListBaseClassName = "group/tabs-list"

export const tabsListVariantClassNames = {
  default:
    "inline-flex w-fit items-center justify-center gap-[2px] rounded-control border border-[var(--border)] bg-[var(--panel)] p-1 text-[var(--muted)] group-data-[orientation=horizontal]/tabs:h-[35px] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  line:
    "inline-flex w-full items-center justify-start gap-[2px] rounded-none border-b border-[var(--border)] bg-transparent p-0 text-[var(--muted)] group-data-[orientation=horizontal]/tabs:h-[35px] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  top:
    "inline-flex w-full items-stretch justify-start gap-[2px] rounded-alert border-b border-[var(--border)] bg-[var(--panel-2)] p-1 text-[var(--muted)]",
  compact:
    "inline-flex w-fit items-center justify-center gap-[2px] rounded-control border border-[var(--border)] bg-[var(--panel)] p-1 text-[var(--muted)]",
  vertical:
    "inline-flex h-full flex-col items-stretch justify-start gap-[2px] rounded-control border border-[var(--border)] bg-[var(--panel)] p-1 text-[var(--muted)]",
} as const

export type TabsListVariant = keyof typeof tabsListVariantClassNames

export const tabsTriggerBaseClassName =
  "ui-control relative inline-flex h-[25px] flex-1 items-center justify-center gap-1.5 rounded-tile border border-transparent px-[14px] py-[6px] font-wordmark text-[13px] font-medium whitespace-nowrap text-[var(--muted)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)] focus-visible:border-[var(--orange)] focus-visible:ring-0 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start group-data-[variant=line]/tabs-list:h-[25px] group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-x-0 group-data-[variant=line]/tabs-list:border-t-0 group-data-[variant=top]/tabs-list:h-[25px] group-data-[variant=top]/tabs-list:flex-none group-data-[variant=compact]/tabs-list:h-[25px] group-data-[variant=vertical]/tabs-list:h-[25px] group-data-[variant=vertical]/tabs-list:flex-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[10px]"

export const tabsTriggerActiveClassName =
  "data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--panel2)] data-[state=active]:border-[var(--accent)] group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:text-[var(--orange)] group-data-[variant=line]/tabs-list:data-[state=active]:border-b-2 group-data-[variant=line]/tabs-list:data-[state=active]:border-b-[var(--orange)] group-data-[variant=top]/tabs-list:data-[state=active]:bg-[var(--accent)] group-data-[variant=top]/tabs-list:data-[state=active]:text-[var(--panel2)] group-data-[variant=top]/tabs-list:data-[state=active]:border-[var(--accent)] group-data-[variant=top]/tabs-list:data-[state=active]:shadow-none group-data-[variant=compact]/tabs-list:data-[state=active]:bg-[var(--accent)] group-data-[variant=compact]/tabs-list:data-[state=active]:text-[var(--panel2)] group-data-[variant=compact]/tabs-list:data-[state=active]:border-[var(--accent)] group-data-[variant=vertical]/tabs-list:data-[state=active]:bg-[var(--accent)] group-data-[variant=vertical]/tabs-list:data-[state=active]:text-[var(--panel2)] group-data-[variant=vertical]/tabs-list:data-[state=active]:border-[var(--accent)]"
