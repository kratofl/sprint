import {
  Badge,
  Button,
  PageHeader,
  cn,
} from '@sprint/ui'
import {
  type DashLayout,
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
} from '@/lib/dash'
import { DashCanvas } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties } from './WidgetProperties'
import { ConfirmDialog } from './ConfirmDialog'
import { AdditionalSettingsPanel } from './AdditionalSettingsPanel'
import { AlertsEditor } from './AlertsEditor'
import { WidgetPalette } from './dash-editor/WidgetPalette'
import { useDashEditorController } from './dash-editor/useDashEditorController'

interface DashEditModeProps {
  layout: DashLayout
  onSave: (layout: DashLayout) => Promise<void>
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}

export function DashEditMode({ layout: initialLayout, onSave, onBack, onDirtyChange }: DashEditModeProps) {
  const controller = useDashEditorController({
    initialLayout,
    onSave,
    onBack,
    onDirtyChange,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        heading={controller.renamingDash ? (
          <input
            autoFocus
            value={controller.dashNameValue}
            onChange={event => controller.setDashNameValue(event.target.value)}
            onBlur={() => controller.commitDashName(controller.dashNameValue)}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                controller.setDashNameValue(controller.layout.name)
                controller.setRenamingDash(false)
              }
              event.stopPropagation()
            }}
            className="min-w-0 bg-background px-1 text-sm font-bold outline outline-1 outline-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              controller.setDashNameValue(controller.layout.name)
              controller.setRenamingDash(true)
            }}
            className="group flex items-center gap-1.5 text-left"
            aria-label="Rename dash layout"
          >
            <span className="truncate text-sm font-bold transition-colors group-hover:text-accent">
              {controller.layout.name}
            </span>
            <PencilIcon className="flex-shrink-0 text-text-disabled transition-colors group-hover:text-accent" />
          </button>
        )}
        caption="DASH_STUDIO"
        status={(
          <>
            {controller.isDirty && <Badge variant="warning" className="terminal-header">DIRTY</Badge>}
            {controller.saveStatus === 'saved' && <Badge variant="success" className="terminal-header">SAVED</Badge>}
            {controller.saveStatus === 'error' && <Badge variant="destructive" className="terminal-header">FAILED</Badge>}
          </>
        )}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={controller.handleBack}>
              BACK
            </Button>
            <Button variant="primary" size="sm" onClick={controller.handleSave} disabled={controller.saving}>
              {controller.saving ? 'SAVING…' : 'SAVE'}
            </Button>
          </>
        )}
      />

      <ConfirmDialog
        open={controller.showDialog}
        title="Discard changes?"
        message="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={controller.confirm}
        onCancel={controller.cancel}
      />

      <div className="flex flex-shrink-0 items-stretch border-b border-border bg-background">
        <button
          onClick={() => controller.setEditorTab('designer')}
          className={cn(
            'flex h-9 items-center whitespace-nowrap border-b-2 px-4 font-mono text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
            controller.editorTab === 'designer'
              ? 'border-accent text-accent bg-accent/[0.06]'
              : 'border-transparent text-text-muted hover:bg-white/[0.02] hover:text-foreground',
          )}
        >
          DESIGNER
        </button>
        <button
          onClick={() => controller.setEditorTab('settings')}
          className={cn(
            'flex h-9 items-center whitespace-nowrap border-b-2 px-4 font-mono text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
            controller.editorTab === 'settings'
              ? 'border-accent text-accent bg-accent/[0.06]'
              : 'border-transparent text-text-muted hover:bg-white/[0.02] hover:text-foreground',
          )}
        >
          SETTINGS
        </button>
      </div>

      {controller.editorTab === 'designer' && (
        <PageTabs
          idlePage={controller.layout.idlePage}
          pages={controller.layout.pages}
          activeTab={controller.activeTab}
          livePageIndex={controller.livePageIndex}
          onSelectTab={controller.selectCanvasTab}
          onSelectAlerts={() => controller.selectCanvasTab('alerts')}
          onAddPage={controller.handleAddPage}
          onDeletePage={controller.handleDeletePage}
          onRenamePage={controller.handleRenamePage}
        />
      )}

      {controller.editorTab === 'settings' ? (
        <AdditionalSettingsPanel
          theme={controller.layout.theme ?? {}}
          domainPalette={controller.layout.domainPalette ?? {}}
          hardcodedDefaults={{ theme: DEFAULT_DASH_THEME, domain: DEFAULT_DOMAIN_PALETTE }}
          globalDefaults={controller.globalDefaults}
          formatPreferences={controller.layout.formatPreferences ?? {}}
          globalFormatPreferences={controller.globalDefaults?.formatPreferences}
          onChange={controller.handleSettingsChange}
          onFormatPreferencesChange={controller.handleFormatPreferencesChange}
        />
      ) : controller.activeTab === 'alerts' ? (
        <AlertsEditor
          instances={controller.layout.alerts ?? []}
          catalog={controller.alertCatalog}
          domainPalette={controller.layout.domainPalette}
          onChange={controller.handleAlertsChange}
        />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-r border-border">
            <div className="border-b border-border px-4 py-3">
              <h4 className="terminal-header text-[10px] font-bold text-text-muted">WIDGET_PALETTE</h4>
            </div>
            <div className="flex-1 overflow-y-auto">
              <WidgetPalette
                catalog={controller.paletteWidgets}
                previewUrls={controller.widgetPreviewUrls}
                onDragStart={(type, previewUrl) => {
                  controller.setPaletteDropType(type)
                  controller.setPaletteDropPreviewUrl(previewUrl ?? null)
                }}
                onDragEnd={() => {
                  controller.setPaletteDropType(null)
                  controller.setPaletteDropPreviewUrl(null)
                }}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-6">
            <div
              ref={controller.canvasPaneRef}
              className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            >
              <div style={controller.fittedCanvas ? { width: controller.fittedCanvas.w, height: controller.fittedCanvas.h } : { width: '100%' }}>
                <DashCanvas
                  widgets={controller.canvasWidgets}
                  gridCols={controller.layout.gridCols}
                  gridRows={controller.layout.gridRows}
                  selectedId={controller.selectedId}
                  catalog={controller.catalog}
                  screenW={controller.screenW}
                  screenH={controller.screenH}
                  theme={controller.layout.theme ?? DEFAULT_DASH_THEME}
                  domainPalette={controller.layout.domainPalette ?? DEFAULT_DOMAIN_PALETTE}
                  paletteDropType={controller.paletteDropType}
                  palettePreviewUrl={controller.paletteDropPreviewUrl}
                  previewUrl={controller.previewUrl ?? undefined}
                  onSelect={controller.setSelectedId}
                  onUpdate={controller.handleUpdate}
                />
              </div>
            </div>

            <div className="flex h-7 flex-shrink-0 items-center gap-4 font-mono text-[10px]">
              {controller.selectedWidget ? (
                <>
                  <Badge variant="active" className="terminal-header">{controller.selectedWidget.type}</Badge>
                  <span className="text-text-muted">
                    COL:{controller.selectedWidget.col} ROW:{controller.selectedWidget.row} W:{controller.selectedWidget.colSpan} H:{controller.selectedWidget.rowSpan}
                  </span>
                </>
              ) : (
                <span className="text-text-muted">DRAG_WIDGET_TO_CANVAS</span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <Button
                  onClick={controller.handleClearPage}
                  variant="ghost"
                  size="xs"
                  className="h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-foreground"
                >
                  CLEAR
                </Button>
                {controller.selectedWidget && (
                  <Button
                    onClick={() => controller.setConfirmRemoveWidget(true)}
                    variant="ghost"
                    size="xs"
                    className="h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-destructive"
                  >
                    REMOVE
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-l border-border">
            <div className="border-b border-border px-4 py-3">
              <h4 className="terminal-header text-[10px] font-bold text-text-muted">PROPERTIES</h4>
            </div>
            <div className="flex-1 overflow-y-auto">
              <WidgetProperties
                widget={controller.selectedWidget}
                catalog={controller.catalog}
                onUpdate={controller.updateSelectedWidget}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={controller.confirmRemoveWidget}
        title="Remove widget?"
        message={controller.selectedWidget ? `Remove "${controller.selectedWidget.type}" widget from this page?` : 'Remove selected widget?'}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          controller.doRemoveSelectedWidget()
          controller.setConfirmRemoveWidget(false)
        }}
        onCancel={() => controller.setConfirmRemoveWidget(false)}
      />
    </div>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7.5 1.5 9.5 3.5 3.5 9.5H1.5v-2z" />
    </svg>
  )
}
