import { useState, useRef, useEffect } from 'react'
import {
  cn,
  tabsListBaseClassName,
  tabsListVariantClassNames,
  tabsRootBaseClassName,
  tabsTriggerActiveClassName,
  tabsTriggerBaseClassName,
} from '@sprint/ui'
import type { DashPage } from '@/lib/dash'
import { ConfirmDialog } from './ConfirmDialog'

type ShellView = 'telemetry' | 'dash' | 'devices' | 'settings' | 'help'

interface ShellPageTabsProps {
  activeView: ShellView
  onSelect: (view: ShellView) => void
}

interface DashPageTabsProps {
  idlePage: DashPage
  pages: DashPage[]
  activeTab: 'idle' | 'alerts' | number
  livePageIndex?: number | null
  onSelectTab: (tab: 'idle' | 'alerts' | number) => void
  onSelectAlerts: () => void
  onAddPage: () => void
  onDeletePage: (index: number) => void
  onRenamePage: (index: number, name: string) => void
  embedded?: boolean
}

export type PageTabsProps = ShellPageTabsProps | DashPageTabsProps

const SHELL_TABS: Array<{ id: ShellView; label: string; locked?: boolean; closable?: boolean }> = [
  { id: 'telemetry', label: 'Dashboard' },
  { id: 'dash', label: 'Dash Editor' },
  { id: 'devices', label: 'Devices' },
  { id: 'settings', label: 'Settings', locked: true },
  { id: 'help', label: 'Help', locked: true },
]

export function PageTabs(props: PageTabsProps) {
  if ('activeView' in props) {
    return <ShellPageTabs {...props} />
  }

  return <DashEditorPageTabs {...props} />
}

function ShellPageTabs({ activeView, onSelect }: ShellPageTabsProps) {
  return (
    <div className="mx-auto flex min-w-0 items-center gap-[2px] rounded-alert bg-[var(--panel-2)] p-1">
      {SHELL_TABS.map((tab) => {
        const selected = activeView === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex h-[25px] items-center gap-1 rounded-control border px-[10px] py-[6px] font-wordmark text-[13px] font-medium transition-colors",
              selected
                ? "border-[var(--orange)] bg-[var(--panel-4)] text-[var(--orange)]"
                : "border-transparent text-[var(--muted)] hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
            )}
          >
            {tab.locked ? <LockIcon /> : null}
            <span>{tab.label}</span>
            {tab.closable ? <span className="text-[10px] text-[var(--muted)]">x</span> : null}
          </button>
        )
      })}
      <button
        type="button"
        className="flex size-[18px] items-center justify-center rounded-badge border border-dashed border-[var(--border)] text-[var(--muted)] hover:border-[var(--orange)] hover:text-[var(--orange)]"
        aria-label="Add tab"
      >
        +
      </button>
    </div>
  )
}

function DashEditorPageTabs({
  pages,
  activeTab,
  livePageIndex,
  onSelectTab,
  onSelectAlerts,
  onAddPage,
  onDeletePage,
  onRenamePage,
  embedded = false,
}: DashPageTabsProps) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingIdx !== null) inputRef.current?.select()
  }, [renamingIdx])

  const topTriggerClassName = cn(
    tabsTriggerBaseClassName,
    tabsTriggerActiveClassName,
    'flex-shrink-0 gap-2',
  )

  const startRename = (idx: number) => {
    setRenamingIdx(idx)
    setRenameValue(pages[idx].name)
  }

  const commitRename = () => {
    if (renamingIdx !== null && renameValue.trim()) {
      onRenamePage(renamingIdx, renameValue.trim())
    }
    setRenamingIdx(null)
  }

  return (
    <>
    {(() => {
      const tabContent = (
        <>
          <button
            type="button"
            onClick={() => onSelectTab('idle')}
            data-state={activeTab === 'idle' ? 'active' : 'inactive'}
            className={topTriggerClassName}
          >
            <LockIcon />
            <span>Idle</span>
          </button>

          <button
            type="button"
            onClick={onSelectAlerts}
            data-state={activeTab === 'alerts' ? 'active' : 'inactive'}
            className={topTriggerClassName}
          >
            <LockIcon />
            <span>Alerts</span>
          </button>

          <div className="my-1.5 w-px self-stretch bg-border" />

          {pages.map((page, idx) => {
            const isActive = activeTab === idx
            const isLive = livePageIndex === idx

            return (
              <div
                key={page.id}
                onClick={() => onSelectTab(idx)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectTab(idx)
                  }
                }}
                role="button"
                tabIndex={0}
                data-state={isActive ? 'active' : 'inactive'}
                className={cn(
                  topTriggerClassName,
                  'group min-h-full cursor-pointer select-none px-3',
                )}
              >
                {isLive && (
                  <span className="h-1.5 w-1.5 flex-shrink-0 bg-secondary" title="Currently rendering" />
                )}

                {renamingIdx === idx ? (
                  <input
                    ref={inputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingIdx(null)
                      e.stopPropagation()
                    }}
                    onClick={e => e.stopPropagation()}
                    className="w-24 border-b border-primary bg-transparent font-mono text-[11px] text-foreground outline-none"
                  />
                ) : (
                  <span>{page.name}</span>
                )}

                {isActive && renamingIdx !== idx && (
                  <span className="ml-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); startRename(idx) }}
                      className="cursor-pointer rounded-sm p-1 text-text-muted opacity-50 transition-colors transition-opacity hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80"
                      title="Rename page"
                      aria-label={`Rename ${page.name}`}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); if (pages.length > 1) setDeleteIdx(idx) }}
                      className={cn(
                        'cursor-pointer rounded-sm p-1 transition-colors transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
                        pages.length > 1
                          ? 'text-destructive opacity-75 hover:bg-destructive/10 hover:opacity-100'
                          : 'cursor-not-allowed text-text-disabled opacity-20'
                      )}
                      title={pages.length > 1 ? 'Delete page' : 'Cannot delete the only page'}
                      aria-label={pages.length > 1 ? `Delete ${page.name}` : `Cannot delete ${page.name}`}
                      disabled={pages.length <= 1}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                )}
              </div>
            )
          })}

          <button
            type="button"
            onClick={onAddPage}
            data-state="inactive"
            className={cn(topTriggerClassName, 'ml-1 gap-1.5 px-3')}
            title="Add page"
          >
            <span className="text-base leading-none">+</span>
            <span>Page</span>
          </button>
        </>
      )

      return embedded
        ? tabContent
        : (
          <div className={cn(tabsRootBaseClassName, 'gap-0')} data-orientation="horizontal">
            <div
              className={cn(
                tabsListBaseClassName,
                tabsListVariantClassNames.top,
                'min-w-0 overflow-x-auto',
              )}
              data-variant="top"
            >
              {tabContent}
            </div>
          </div>
        )
    })()}

    <ConfirmDialog
      open={deleteIdx !== null}
      title="Delete page?"
      message={deleteIdx !== null ? `"${pages[deleteIdx]?.name}" and all its widgets will be removed.` : ''}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={() => { if (deleteIdx !== null) { onDeletePage(deleteIdx); setDeleteIdx(null) } }}
      onCancel={() => setDeleteIdx(null)}
    />
    </>
  )
}

function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
      <rect x="1" y="5" width="8" height="6" rx="1" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1.5 9.5 3.5 3.5 9.5H1.5v-2z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h7M4.5 3V2h2v1M3.5 3v5.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V3" />
    </svg>
  )
}
