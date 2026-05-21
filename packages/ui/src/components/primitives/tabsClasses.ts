export const tabsRootBaseClassName =
  "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row"

export const tabsListBaseClassName = "group/tabs-list"

export const tabsListVariantClassNames = {
  default:
    "surface-inline inline-flex w-fit items-center justify-center gap-1 rounded-sm p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  line:
    "inline-flex w-full items-center justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  top:
    "inline-flex w-full items-stretch justify-start gap-0 rounded-none border-b border-border bg-bg-shell p-0 text-muted-foreground",
  compact:
    "surface-inline inline-flex w-fit items-center justify-center gap-1 rounded-sm p-[3px] text-muted-foreground",
  vertical:
    "inline-flex h-full flex-col items-stretch justify-start gap-0 rounded-none bg-bg-shell p-0 text-muted-foreground",
} as const

export type TabsListVariant = keyof typeof tabsListVariantClassNames

export const tabsTriggerBaseClassName =
  "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap text-text-muted transition-colors hover:bg-white/[0.03] hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start group-data-[orientation=vertical]/tabs:py-[calc(--spacing(1.25))] group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-x-0 group-data-[variant=line]/tabs-list:border-t-0 group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:font-mono group-data-[variant=line]/tabs-list:text-[10px] group-data-[variant=line]/tabs-list:tracking-[0.08em] group-data-[variant=top]/tabs-list:h-full group-data-[variant=top]/tabs-list:flex-none group-data-[variant=top]/tabs-list:rounded-none group-data-[variant=top]/tabs-list:border-x-0 group-data-[variant=top]/tabs-list:border-t-0 group-data-[variant=top]/tabs-list:px-4 group-data-[variant=top]/tabs-list:font-mono group-data-[variant=top]/tabs-list:text-[11px] group-data-[variant=top]/tabs-list:tracking-[0.08em] group-data-[variant=compact]/tabs-list:px-3 group-data-[variant=compact]/tabs-list:py-1 group-data-[variant=compact]/tabs-list:font-mono group-data-[variant=compact]/tabs-list:text-[9px] group-data-[variant=compact]/tabs-list:tracking-[0.08em] group-data-[variant=vertical]/tabs-list:h-auto group-data-[variant=vertical]/tabs-list:w-7 group-data-[variant=vertical]/tabs-list:min-w-7 group-data-[variant=vertical]/tabs-list:flex-none group-data-[variant=vertical]/tabs-list:justify-center group-data-[variant=vertical]/tabs-list:rounded-none group-data-[variant=vertical]/tabs-list:border-y-0 group-data-[variant=vertical]/tabs-list:px-1 group-data-[variant=vertical]/tabs-list:py-5 group-data-[variant=vertical]/tabs-list:font-mono group-data-[variant=vertical]/tabs-list:text-[9px] group-data-[variant=vertical]/tabs-list:tracking-[0.12em] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"

export const tabsTriggerActiveClassName =
  "data-[state=active]:bg-bg-panel data-[state=active]:text-foreground data-[state=active]:border-border group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground group-data-[variant=line]/tabs-list:data-[state=active]:border-b-2 group-data-[variant=line]/tabs-list:data-[state=active]:border-b-accent group-data-[variant=top]/tabs-list:data-[state=active]:bg-accent/10 group-data-[variant=top]/tabs-list:data-[state=active]:text-accent group-data-[variant=top]/tabs-list:data-[state=active]:border-b-2 group-data-[variant=top]/tabs-list:data-[state=active]:border-b-accent group-data-[variant=top]/tabs-list:data-[state=active]:shadow-none group-data-[variant=compact]/tabs-list:data-[state=active]:bg-bg-panel group-data-[variant=compact]/tabs-list:data-[state=active]:text-foreground group-data-[variant=compact]/tabs-list:data-[state=active]:border-border group-data-[variant=vertical]/tabs-list:data-[state=active]:bg-bg-panel group-data-[variant=vertical]/tabs-list:data-[state=active]:text-foreground group-data-[variant=vertical]/tabs-list:data-[state=active]:border-border"
