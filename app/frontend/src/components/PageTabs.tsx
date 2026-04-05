import { useState, useRef, useEffect } from 'react'
import { cn } from '@sprint/ui'
import type { DashPage } from '@/lib/dash'
import { ConfirmDialog } from './ConfirmDialog'

export interface PageTabsProps {
  idlePage: DashPage
  pages: DashPage[]
  activeTab: 'idle' | number
  livePageIndex?: number | null
  onSelectTab: (tab: 'idle' | number) => void
  onAddPage: () => void
  onDeletePage: (index: number) => void
  onRenamePage: (index: number, name: string) => void
}

export function PageTabs({
  pages,
  activeTab,
  livePageIndex,
  onSelectTab,
  onAddPage,
  onDeletePage,
  onRenamePage,
}: PageTabsProps) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingIdx !== null) inputRef.current?.select()
  }, [renamingIdx])

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
    <div className="flex items-stretch gap-0 border-b border-border bg-background flex-shrink-0 overflow-x-auto">
      {/* Idle tab — always present, distinct styling */}
      <button
        onClick={() => onSelectTab('idle')}
        className={cn(
          'flex items-center gap-2 px-4 h-10 font-mono text-[11px] font-medium transition-colors whitespace-nowrap border-b-2 flex-shrink-0',
          activeTab === 'idle'
            ? 'border-text-muted text-foreground bg-white/[0.04]'
            : 'border-transparent text-text-muted hover:text-foreground hover:bg-white/[0.02]'
        )}
      >
        <LockIcon />
        <span>IDLE</span>
      </button>

      <div className="w-px bg-border self-stretch my-1.5" />

      {/* Active pages */}
      {pages.map((page, idx) => {
        const isActive = activeTab === idx
        const isLive = livePageIndex === idx

        return (
          <div
            key={page.id}
            onClick={() => onSelectTab(idx)}
            className={cn(
              'group flex items-center gap-2 px-3 h-10 font-mono text-[11px] font-medium transition-colors whitespace-nowrap border-b-2 flex-shrink-0 cursor-pointer select-none',
              isActive
                ? 'border-accent text-foreground bg-white/[0.04]'
                : 'border-transparent text-text-muted hover:text-foreground hover:bg-white/[0.02]'
            )}
          >
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" title="Currently rendering" />
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
                className="bg-transparent outline-none w-24 font-mono text-[11px] border-b border-accent text-foreground"
              />
            ) : (
              <span>{page.name}</span>
            )}

            {/* Actions — only on active tab */}
            {isActive && renamingIdx !== idx && (
              <span className="flex items-center gap-1 ml-1">
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); startRename(idx) }}
                  className="opacity-40 hover:opacity-100 transition-opacity cursor-pointer text-text-muted hover:text-foreground"
                  title="Rename page"
                >
                  <PencilIcon />
                </span>
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); if (pages.length > 1) setDeleteIdx(idx) }}
                  className={cn(
                    'transition-opacity cursor-pointer',
                    pages.length > 1
                      ? 'opacity-40 hover:opacity-100 hover:text-destructive text-text-muted'
                      : 'opacity-20 cursor-not-allowed text-text-disabled'
                  )}
                  title={pages.length > 1 ? 'Delete page' : 'Cannot delete the only page'}
                >
                  <TrashIcon />
                </span>
              </span>
            )}
          </div>
        )
      })}

      {/* Add page button */}
      <button
        onClick={onAddPage}
        className="flex items-center gap-1.5 px-3 h-10 font-mono text-[11px] text-text-muted hover:text-foreground hover:bg-white/[0.02] transition-colors border-b-2 border-transparent flex-shrink-0 ml-1"
        title="Add page"
      >
        <span className="text-base leading-none">+</span>
        <span>Page</span>
      </button>
    </div>

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
