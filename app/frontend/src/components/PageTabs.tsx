import { useState } from 'react'
import { IconLock, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import {
  Button,
  cn,
  ConfirmDialog,
  IconButton,
  Input,
  tabsListBaseClassName,
  tabsListVariantClassNames,
  tabsRootBaseClassName,
  tabsTriggerActiveClassName,
  tabsTriggerBaseClassName,
} from '@sprint/ui'
import type { DashPage } from '@/lib/dash'

export interface PageTabsProps {
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

export function PageTabs({
  idlePage,
  pages,
  activeTab,
  livePageIndex,
  onSelectTab,
  onSelectAlerts,
  onAddPage,
  onDeletePage,
  onRenamePage,
  embedded = false,
}: PageTabsProps) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null)

  const topTriggerClassName = embedded
    ? 'flex min-h-[34px] w-full cursor-pointer items-center justify-start gap-2 rounded-[calc(var(--r)-2px)] border border-[var(--line)] bg-[var(--panel)] px-3 text-[11px] font-medium text-[var(--text2)] transition-colors hover:border-[var(--line2)] hover:bg-[var(--panel2)] data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent)]'
    : cn(
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
          <Button
            type="button"
            onClick={() => onSelectTab('idle')}
            data-state={activeTab === 'idle' ? 'active' : 'inactive'}
            className={cn(topTriggerClassName, embedded && activeTab === 'idle' && 'sel')}
          >
            <IconLock size={12} className="flex-shrink-0 opacity-60" />
            <span>{idlePage.name || 'Idle'}</span>
          </Button>

          {!embedded && (
            <Button
              type="button"
              onClick={onSelectAlerts}
              data-state={activeTab === 'alerts' ? 'active' : 'inactive'}
              className={topTriggerClassName}
            >
              <IconLock size={12} className="flex-shrink-0 opacity-60" />
              <span>Alerts</span>
            </Button>
          )}

          <div className={embedded ? 'h-px w-full bg-[var(--line)]' : 'my-1.5 w-px self-stretch bg-border'} />

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
                  !embedded && 'group min-h-full cursor-pointer select-none px-3',
                  embedded && isActive && 'sel',
                )}
              >
                {isLive && (
                  <span className="h-1.5 w-1.5 flex-shrink-0 bg-secondary" title="Currently rendering" />
                )}

                {renamingIdx === idx ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingIdx(null)
                      e.stopPropagation()
                    }}
                    onClick={e => e.stopPropagation()}
                    className="h-7 w-28"
                  />
                ) : (
                  <span>{page.name}</span>
                )}

                {isActive && renamingIdx !== idx && (
                  <span className="ml-1 flex items-center gap-1">
                    <IconButton
                      label={`Rename ${page.name}`}
                      icon={<IconPencil size={11} />}
                      onClick={e => { e.stopPropagation(); startRename(idx) }}
                      size="icon-xs"
                      variant="ghost"
                      className="opacity-60 hover:opacity-100"
                    />
                    <IconButton
                      label={pages.length > 1 ? `Delete ${page.name}` : `Cannot delete ${page.name}`}
                      icon={<IconTrash size={11} />}
                      onClick={e => { e.stopPropagation(); if (pages.length > 1) setDeleteIdx(idx) }}
                      title={pages.length > 1 ? 'Delete page' : 'Cannot delete the only page'}
                      disabled={pages.length <= 1}
                      size="icon-xs"
                      variant="ghost"
                      className={cn(
                        pages.length > 1
                          ? 'text-destructive opacity-75 hover:opacity-100'
                          : 'cursor-not-allowed text-text-disabled opacity-20'
                      )}
                    />
                  </span>
                )}
              </div>
            )
          })}

          <Button
            type="button"
            onClick={onAddPage}
            data-state="inactive"
            size="sm"
            variant="outline"
            className={embedded ? 'min-h-full justify-center gap-1.5 px-3' : cn(topTriggerClassName, 'ml-1 gap-1.5 px-3')}
            title="Add page"
          >
            <IconPlus size={12} />
            <span>Page</span>
          </Button>
        </>
      )

          return embedded
            ? <div className="flex flex-col gap-2">{tabContent}</div>
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
