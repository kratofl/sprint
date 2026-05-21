import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  cn,
  tabsListBaseClassName,
  tabsListVariantClassNames,
  tabsRootBaseClassName,
  tabsTriggerActiveClassName,
  tabsTriggerBaseClassName,
} from '@sprint/ui'
import {
  type DashLayout,
  type DashPage,
  type DashWidget,
  type DashWrapperGroup,
  type DashWrapperVariant,
  type RGBAColor,
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
} from '@/lib/dash'
import type { AppSettings, DashEditorUIPreferences } from '@sprint/types'
import { DashCanvas } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties } from './WidgetProperties'
import { ConfirmDialog } from './ConfirmDialog'
import { AdditionalSettingsPanel, hexToRgba, rgbaToHex } from './AdditionalSettingsPanel'
import { AlertsEditor } from './AlertsEditor'
import { WidgetPalette } from './dash-editor/WidgetPalette'
import { settingsAPI } from '@/lib/settings'
import { useDashEditorController } from './dash-editor/useDashEditorController'
import { EditorEdgeHandle } from './dash-editor/EditorEdgeHandle'
import {
  type DashLayerChipState,
  createInspectorSheetState,
  createLayerStripState,
} from './dash-editor/layoutViewModel'
import {
  DEFAULT_DASH_EDITOR_UI_PREFERENCES,
  normalizeDashEditorUIPreferences,
} from './dash-editor/dashEditorUIPreferences'

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

  const [panelPreferences, setPanelPreferences] = useState<DashEditorUIPreferences>(DEFAULT_DASH_EDITOR_UI_PREFERENCES)
  const [advancedGeometryOpen, setAdvancedGeometryOpen] = useState(false)
  const savedSettingsRef = useRef<AppSettings | null>(null)
  const persistPanelPreferencesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentPageName = controller.currentPage?.name ?? controller.layout.idlePage.name
  const inspectorState = createInspectorSheetState({
    mode: controller.editorMode,
    selectedWidget: controller.selectedWidget,
    selectedWrapperGroup: controller.selectedWrapperGroup,
    pageName: currentPageName,
  })
  const layerStripState = createLayerStripState({
    mode: controller.editorMode,
    selectedWrapperGroup: controller.selectedWrapperGroup,
    selectedVariantId: controller.selectedVariantId,
  })

  const persistPanelPreferences = useCallback((nextPreferences: DashEditorUIPreferences) => {
    const nextSettings: AppSettings = {
      ...(savedSettingsRef.current ?? { updateChannel: 'stable' }),
      dashEditorUI: nextPreferences,
    }
    savedSettingsRef.current = nextSettings
    if (persistPanelPreferencesTimeoutRef.current) {
      clearTimeout(persistPanelPreferencesTimeoutRef.current)
    }
    persistPanelPreferencesTimeoutRef.current = setTimeout(() => {
      void settingsAPI.saveSettings(nextSettings).catch(() => {})
    }, 150)
  }, [])

  const updatePanelPreferences = useCallback((updater: (current: DashEditorUIPreferences) => DashEditorUIPreferences) => {
    setPanelPreferences(current => {
      const next = updater(current)
      persistPanelPreferences(next)
      return next
    })
  }, [persistPanelPreferences])

  useEffect(() => {
    let cancelled = false

    void settingsAPI.getSettings()
      .then(settings => {
        if (cancelled) return
        savedSettingsRef.current = settings
        setPanelPreferences(normalizeDashEditorUIPreferences(settings.dashEditorUI))
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (persistPanelPreferencesTimeoutRef.current) {
        clearTimeout(persistPanelPreferencesTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (controller.editorMode === 'page') {
      setAdvancedGeometryOpen(false)
    }
  }, [controller.editorMode])

  useEffect(() => {
    setAdvancedGeometryOpen(false)
  }, [controller.activeTab, controller.selectedId, controller.selectedWrapperGroupId, controller.selectedVariantId, controller.editorMode])

  const handleSetPanelOpen = useCallback((panel: keyof DashEditorUIPreferences, open: boolean) => {
    updatePanelPreferences(current => ({
      ...current,
      [panel]: {
        ...current[panel],
        open,
      },
    }))
  }, [updatePanelPreferences])

  const handleTogglePanelOpen = useCallback((panel: keyof DashEditorUIPreferences) => {
    updatePanelPreferences(current => ({
      ...current,
      [panel]: {
        ...current[panel],
        open: !current[panel].open,
      },
    }))
  }, [updatePanelPreferences])

  const handleTogglePanelPinned = useCallback((panel: keyof DashEditorUIPreferences) => {
    updatePanelPreferences(current => ({
      ...current,
      [panel]: {
        ...current[panel],
        open: true,
        pinned: !current[panel].pinned,
      },
    }))
  }, [updatePanelPreferences])

  const updateSelectedWidgetGeometry = (patch: Partial<Pick<DashWidget, 'col' | 'row' | 'colSpan' | 'rowSpan'>>) => {
    if (!controller.selectedWidget) return
    controller.updateSelectedWidget({
      ...controller.selectedWidget,
      ...patch,
    })
  }

  const paletteDocked = panelPreferences.palette.open && panelPreferences.palette.pinned
  const inspectorDocked = panelPreferences.inspector.open && panelPreferences.inspector.pinned
  const paletteOverlay = panelPreferences.palette.open && !paletteDocked
  const inspectorOverlay = panelPreferences.inspector.open && !inspectorDocked
  const topTabTriggerClassName = cn(
    tabsTriggerBaseClassName,
    tabsTriggerActiveClassName,
  )
  const inspectorHeaderAction = inspectorState.showAdvancedGeometry ? (
    <Button
      variant={advancedGeometryOpen ? 'active' : 'ghost'}
      size="xs"
      onClick={() => setAdvancedGeometryOpen(current => !current)}
    >
      ADVANCED_GEOMETRY
    </Button>
  ) : null
  const paletteContent = (
    <WidgetPalette
      catalog={controller.paletteWidgets}
      previewUrls={controller.widgetPreviewUrls}
      includeMultiFunctionWidget={controller.editorMode === 'page'}
      onDragStart={(type, previewUrl) => {
        controller.setPaletteDropType(type)
        controller.setPaletteDropPreviewUrl(previewUrl ?? null)
      }}
      onDragEnd={() => {
        controller.setPaletteDropType(null)
        controller.setPaletteDropPreviewUrl(null)
      }}
    />
  )
  const inspectorContent = (
    <div className="space-y-4">
      {layerStripState && (
        <LayerListPanel
          groupName={layerStripState.groupName}
          layers={layerStripState.layers}
          onAddLayer={controller.handleAddWrapperVariant}
          onSelectLayer={controller.handleSelectWrapperVariant}
          onSetDefaultLayer={controller.handleSetDefaultWrapperVariant}
          onMoveLayerUp={layerId => controller.handleMoveWrapperVariant(layerId, -1)}
          onMoveLayerDown={layerId => controller.handleMoveWrapperVariant(layerId, 1)}
          onDeleteLayer={controller.handleDeleteWrapperVariant}
          disableDelete={(controller.selectedWrapperGroup?.variants.length ?? 0) <= 1}
        />
      )}

      {controller.currentPage && controller.editorMode === 'page' && !controller.selectedWidget && (
        <PagePropertiesPanel
          page={controller.currentPage}
          themeBackground={controller.resolvedTheme.bg}
          onBackgroundChange={controller.handlePageBackgroundChange}
          onClearPage={controller.handleClearPage}
        />
      )}

      {controller.editorMode === 'mfw' && controller.selectedWrapperGroup && controller.selectedWrapperVariant && (
        <WrapperGroupPropertiesPanel
          group={controller.selectedWrapperGroup}
          selectedVariant={controller.selectedWrapperVariant}
          gridCols={controller.layout.gridCols}
          gridRows={controller.layout.gridRows}
          onUpdateGroup={controller.updateSelectedWrapperGroup}
          onDeleteGroup={controller.handleDeleteSelectedWrapperGroup}
          onUpdateVariant={controller.updateSelectedVariant}
          onClearLayer={controller.handleClearPage}
          showAdvancedGeometry={advancedGeometryOpen}
        />
      )}

      {controller.selectedWidget && (
        <WidgetInspectorPanel
          widget={controller.selectedWidget}
          catalog={controller.catalog}
          onUpdate={controller.updateSelectedWidget}
          showAdvancedGeometry={advancedGeometryOpen}
          onUpdateGeometry={updateSelectedWidgetGeometry}
          onDelete={() => controller.setConfirmRemoveWidget(true)}
        />
      )}
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-shell px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {controller.renamingDash ? (
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
              className="surface-inline min-w-0 px-2 text-sm font-bold outline-none focus:border-accent"
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
          {controller.isDirty && <Badge variant="warning" className="terminal-header">DIRTY</Badge>}
          {controller.saveStatus === 'saved' && <Badge variant="success" className="terminal-header">SAVED</Badge>}
          {controller.saveStatus === 'error' && <Badge variant="destructive" className="terminal-header">FAILED</Badge>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={controller.handleBack}>
            BACK
          </Button>
          <Button variant="primary" size="sm" onClick={controller.handleSave} disabled={controller.saving}>
            {controller.saving ? 'SAVING…' : 'SAVE'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={controller.showDialog}
        title="Discard changes?"
        message="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={controller.confirm}
        onCancel={controller.cancel}
      />

      <div className={cn(tabsRootBaseClassName, 'gap-0')} data-orientation="horizontal">
        <div
          className={cn(
            tabsListBaseClassName,
            tabsListVariantClassNames.top,
            'min-w-0 overflow-x-auto',
          )}
          data-variant="top"
        >
          <button
            type="button"
            onClick={() => controller.setEditorTab('designer')}
            data-state={controller.editorTab === 'designer' ? 'active' : 'inactive'}
            className={topTabTriggerClassName}
          >
            DESIGNER
          </button>
          <button
            type="button"
            onClick={() => controller.setEditorTab('settings')}
            data-state={controller.editorTab === 'settings' ? 'active' : 'inactive'}
            className={topTabTriggerClassName}
          >
            SETTINGS
          </button>
          {controller.editorTab === 'designer' && (
            <>
              {controller.editorMode === 'mfw' && (
                <button
                  type="button"
                  onClick={controller.exitMultiFunctionWidgetEditMode}
                  data-state="inactive"
                  className={cn(topTabTriggerClassName, 'gap-1.5 px-3')}
                >
                  <span className="text-text-disabled">←</span>
                  <span>PAGE</span>
                </button>
              )}
              <div className="my-1 w-px self-stretch bg-border" />
              <PageTabs
                embedded
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
            </>
          )}
        </div>
      </div>

      {controller.editorTab === 'settings' ? (
        <AdditionalSettingsPanel
          theme={controller.layout.theme ?? {}}
          domainPalette={controller.layout.domainPalette ?? {}}
          hardcodedDefaults={{ theme: DEFAULT_DASH_THEME, domain: DEFAULT_DOMAIN_PALETTE }}
          globalDefaults={controller.globalDefaults}
          typography={controller.layout.typography ?? {}}
          globalTypography={controller.globalDefaults?.typography}
          formatPreferences={controller.layout.formatPreferences ?? {}}
          globalFormatPreferences={controller.globalDefaults?.formatPreferences}
          onChange={controller.handleSettingsChange}
          onTypographyChange={controller.handleTypographyChange}
          onFormatPreferencesChange={controller.handleFormatPreferencesChange}
        />
      ) : controller.activeTab === 'alerts' ? (
        <AlertsEditor
          instances={controller.layout.alerts ?? []}
          catalog={controller.alertCatalog}
          domainPalette={controller.resolvedDomainPalette}
          onChange={controller.handleAlertsChange}
        />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {paletteDocked && (
            <EditorSidebar
              side="left"
              mode="docked"
              className="w-72 flex-shrink-0"
              title="WIDGETS"
              pinned={panelPreferences.palette.pinned}
              onTogglePinned={() => handleTogglePanelPinned('palette')}
              onClose={() => handleSetPanelOpen('palette', false)}
            >
              {paletteContent}
            </EditorSidebar>
          )}

          <div className="relative flex min-h-0 min-w-0 flex-1 items-stretch p-2">
            {!panelPreferences.palette.open && (
              <EditorEdgeHandle
                side="left"
                label="WIDGETS"
                onClick={() => handleTogglePanelOpen('palette')}
              />
            )}

            {!panelPreferences.inspector.open && (
              <EditorEdgeHandle
                side="right"
                label="INSPECTOR"
                onClick={() => handleTogglePanelOpen('inspector')}
              />
            )}

            <div
              ref={controller.canvasPaneRef}
              className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-sm"
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
                  theme={controller.resolvedTheme}
                  domainPalette={controller.resolvedDomainPalette}
                  blockedAreas={controller.blockedAreas}
                  placementBounds={controller.placementBounds}
                  overlayRects={controller.overlayRects}
                  overlayBlockedAreas={controller.currentPage?.widgets ?? []}
                  overlayEditMode={controller.editingMultiFunctionWidget}
                  paletteDropType={controller.paletteDropType}
                  palettePreviewUrl={controller.paletteDropPreviewUrl}
                  previewUrl={controller.previewUrl ?? undefined}
                  onBackgroundClick={controller.handleCanvasBackgroundClick}
                  onSelect={controller.handleCanvasSelectWidget}
                  onSelectOverlay={controller.handleCanvasSelectWrapperGroup}
                  onUpdateOverlay={controller.handleCanvasUpdateWrapperGroup}
                  onEnterOverlay={controller.handleCanvasEnterWrapperGroup}
                  onDropMultiFunctionWidget={controller.handleCanvasCreateMultiFunctionWidget}
                  onUpdate={controller.handleUpdate}
                />
              </div>
            </div>

            {paletteOverlay && (
              <div className="pointer-events-none absolute inset-y-2 left-0 z-20 flex w-72 max-w-[calc(100%-1rem)]">
                <EditorSidebar
                  side="left"
                  mode="overlay"
                  className="pointer-events-auto flex-1"
                  title="WIDGETS"
                  pinned={panelPreferences.palette.pinned}
                  onTogglePinned={() => handleTogglePanelPinned('palette')}
                  onClose={() => handleSetPanelOpen('palette', false)}
                >
                  {paletteContent}
                </EditorSidebar>
              </div>
            )}

            {inspectorOverlay && (
              <div className="pointer-events-none absolute inset-y-2 right-0 z-20 flex w-80 max-w-[calc(100%-1rem)]">
                <EditorSidebar
                  side="right"
                  mode="overlay"
                  className="pointer-events-auto flex-1"
                  title={inspectorState.title}
                  pinned={panelPreferences.inspector.pinned}
                  onTogglePinned={() => handleTogglePanelPinned('inspector')}
                  onClose={() => handleSetPanelOpen('inspector', false)}
                  headerAction={inspectorHeaderAction}
                >
                  {inspectorContent}
                </EditorSidebar>
              </div>
            )}
          </div>

          {inspectorDocked && (
            <EditorSidebar
              side="right"
              mode="docked"
              className="w-80 flex-shrink-0"
              title={inspectorState.title}
              pinned={panelPreferences.inspector.pinned}
              onTogglePinned={() => handleTogglePanelPinned('inspector')}
              onClose={() => handleSetPanelOpen('inspector', false)}
              headerAction={inspectorHeaderAction}
            >
              {inspectorContent}
            </EditorSidebar>
          )}

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

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function EditorSidebar({
  side,
  mode,
  title,
  pinned,
  onTogglePinned,
  onClose,
  headerAction,
  className,
  children,
}: {
  side: 'left' | 'right'
  mode: 'docked' | 'overlay'
  title: string
  pinned: boolean
  onTogglePinned: () => void
  onClose: () => void
  headerAction?: ReactNode
  className?: string
  children: ReactNode
}) {
  const dotIndex = title.indexOf(' · ')
  const prefix = dotIndex >= 0 ? title.slice(0, dotIndex) : null
  const label = dotIndex >= 0 ? title.slice(dotIndex + 3) : title

  return (
    <aside
      data-slot="editor-sidebar"
      data-side={side}
      data-mode={mode}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden',
        mode === 'overlay' ? 'surface-overlay-panel shadow-overlay' : 'surface-panel shadow-none',
        side === 'left'
          ? 'border-y-0 border-l-0 border-r border-border'
          : 'border-y-0 border-r-0 border-l border-border',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {prefix && (
            <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-wider text-text-muted">{prefix}</span>
          )}
          <h2 className="truncate font-mono text-[10px] font-medium uppercase tracking-wide text-foreground">{label}</h2>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {headerAction}
          <button
            type="button"
            title={pinned ? 'Unpin panel' : 'Pin panel'}
            onClick={onTogglePinned}
            className={cn(
              'rounded p-1 transition-colors',
              pinned ? 'text-accent' : 'text-text-muted hover:text-foreground',
            )}
          >
            <PinIcon />
          </button>
          <button
            type="button"
            title="Hide panel"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </aside>
  )
}

function SidebarSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h5 className="terminal-header text-[9px] font-bold text-text-muted">{title}</h5>
      {children}
    </section>
  )
}

function LayerListPanel({
  layers,
  onAddLayer,
  onSelectLayer,
  onSetDefaultLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onDeleteLayer,
  disableDelete,
}: {
  groupName: string
  layers: DashLayerChipState[]
  onAddLayer: () => void
  onSelectLayer: (layerId: string) => void
  onSetDefaultLayer: (layerId: string) => void
  onMoveLayerUp: (layerId: string) => void
  onMoveLayerDown: (layerId: string) => void
  onDeleteLayer: (layerId: string) => void
  disableDelete: boolean
}) {
  return (
    <SidebarSection title="LAYERS">
      <div className="space-y-2">
        {layers.map(layer => (
          <LayerListItem
            key={layer.id}
            layer={layer}
            onSelect={() => onSelectLayer(layer.id)}
            onSetDefault={() => onSetDefaultLayer(layer.id)}
            onMoveUp={() => onMoveLayerUp(layer.id)}
            onMoveDown={() => onMoveLayerDown(layer.id)}
            onDelete={() => onDeleteLayer(layer.id)}
            disableDelete={disableDelete}
          />
        ))}
        <Button variant="outline" size="xs" onClick={onAddLayer} className="w-full justify-center font-mono text-[9px]">
          + LAYER
        </Button>
      </div>
    </SidebarSection>
  )
}

function LayerListItem({
  layer,
  onSelect,
  onSetDefault,
  onMoveUp,
  onMoveDown,
  onDelete,
  disableDelete,
}: {
  layer: DashLayerChipState
  onSelect: () => void
  onSetDefault: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  disableDelete: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-sm border px-3 py-2 transition-colors',
        layer.selected
          ? 'border-primary bg-accent/10'
          : 'surface-panel',
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col items-start text-left">
          <span className={cn('truncate font-mono text-[10px]', layer.selected ? 'text-foreground' : 'text-text-muted')}>
            {layer.name}
          </span>
          {layer.isDefault && (
            <span className="mt-1 rounded border border-border/80 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-text-disabled">
              default
            </span>
          )}
        </button>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSetDefault}
            disabled={layer.isDefault}
            className="rounded border border-border px-1 text-[9px] text-text-disabled transition-colors hover:text-foreground disabled:opacity-25"
            title="Set default layer"
          >
            D
          </button>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!layer.canMoveLeft}
            className="rounded border border-border px-1 text-[9px] text-text-disabled transition-colors hover:text-foreground disabled:opacity-25"
            title="Move layer up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!layer.canMoveRight}
            className="rounded border border-border px-1 text-[9px] text-text-disabled transition-colors hover:text-foreground disabled:opacity-25"
            title="Move layer down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disableDelete}
            className="rounded border border-destructive/60 bg-destructive/10 px-1 text-[9px] text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-25"
            title="Delete layer"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

function PagePropertiesPanel({
  page,
  themeBackground,
  onBackgroundChange,
  onClearPage,
}: {
  page: DashPage
  themeBackground: RGBAColor
  onBackgroundChange: (background?: RGBAColor) => void
  onClearPage: () => void
}) {
  return (
    <SidebarSection title="PAGE">
      <div className="space-y-3">
        <FieldRow label="NAME">
          <span className="font-mono text-[10px] text-foreground">{page.name}</span>
        </FieldRow>
        <ColorField
          label="BACKGROUND"
          value={page.background}
          fallback={themeBackground}
          inheritedLabel="Using the dash theme background."
          onChange={onBackgroundChange}
          onReset={() => onBackgroundChange(undefined)}
        />
        <div className="flex justify-end">
          <Button variant="ghost" size="xs" onClick={onClearPage} className="font-mono text-[9px]">
            CLEAR_PAGE
          </Button>
        </div>
      </div>
    </SidebarSection>
  )
}

function WidgetInspectorPanel({
  widget,
  catalog,
  onUpdate,
  showAdvancedGeometry,
  onUpdateGeometry,
  onDelete,
}: {
  widget: DashWidget
  catalog: DashLayout extends never ? never : Parameters<typeof WidgetProperties>[0]['catalog']
  onUpdate: (widget: DashWidget) => void
  showAdvancedGeometry: boolean
  onUpdateGeometry: (patch: Partial<Pick<DashWidget, 'col' | 'row' | 'colSpan' | 'rowSpan'>>) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <SidebarSection title="WIDGET">
        <div className="space-y-3">
          <WidgetProperties
            widget={widget}
            catalog={catalog}
            onUpdate={onUpdate}
          />
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="xs"
              onClick={onDelete}
              className="inline-flex items-center gap-1 font-mono text-[9px]"
            >
              <TrashIcon />
              REMOVE_WIDGET
            </Button>
          </div>
        </div>
      </SidebarSection>

      {showAdvancedGeometry && (
        <SidebarSection title="ADVANCED_GEOMETRY">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="COL" value={widget.col} min={0} max={999} onChange={value => onUpdateGeometry({ col: value })} />
            <NumberField label="ROW" value={widget.row} min={0} max={999} onChange={value => onUpdateGeometry({ row: value })} />
            <NumberField label="WIDTH" value={widget.colSpan} min={1} max={999} onChange={value => onUpdateGeometry({ colSpan: value })} />
            <NumberField label="HEIGHT" value={widget.rowSpan} min={1} max={999} onChange={value => onUpdateGeometry({ rowSpan: value })} />
          </div>
        </SidebarSection>
      )}
    </div>
  )
}

function WrapperGroupPropertiesPanel({
  group,
  selectedVariant,
  gridCols,
  gridRows,
  onUpdateGroup,
  onDeleteGroup,
  onUpdateVariant,
  onClearLayer,
  showAdvancedGeometry,
}: {
  group: DashWrapperGroup
  selectedVariant: DashWrapperVariant
  gridCols: number
  gridRows: number
  onUpdateGroup: (patch: Partial<DashWrapperGroup>) => void
  onDeleteGroup: () => void
  onUpdateVariant: (patch: { name?: string; defaultVariantId?: string }) => void
  onClearLayer: () => void
  showAdvancedGeometry: boolean
}) {
  return (
    <div className="space-y-4">
      <SidebarSection title="MFW">
        <div className="space-y-3">
          <FieldRow label="NAME">
            <input
              type="text"
              value={group.name}
              onChange={event => onUpdateGroup({ name: event.target.value })}
              className="w-full border border-border bg-bg-shell px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
            />
          </FieldRow>

          <FieldRow label="ACTIVE_LAYER">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={selectedVariant.name}
                onChange={event => onUpdateVariant({ name: event.target.value })}
                className="w-full border border-border bg-bg-shell px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
              />
              {group.defaultVariantId === selectedVariant.id && (
                <span className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-text-disabled">
                  DEFAULT
                </span>
              )}
            </div>
          </FieldRow>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={onClearLayer}
              className="font-mono text-[9px]"
            >
              CLEAR_LAYER
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={onDeleteGroup}
              className="inline-flex items-center gap-1 font-mono text-[9px]"
            >
              <TrashIcon />
              DELETE_MFW
            </Button>
          </div>
        </div>
      </SidebarSection>

      {showAdvancedGeometry && (
        <SidebarSection title="ADVANCED_GEOMETRY">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="COL"
              value={group.col}
              min={0}
              max={Math.max(0, gridCols - group.colSpan)}
              onChange={value => onUpdateGroup({ col: value })}
            />
            <NumberField
              label="ROW"
              value={group.row}
              min={0}
              max={Math.max(0, gridRows - group.rowSpan)}
              onChange={value => onUpdateGroup({ row: value })}
            />
            <NumberField
              label="WIDTH"
              value={group.colSpan}
              min={1}
              max={gridCols}
              onChange={value => onUpdateGroup({ colSpan: value })}
            />
            <NumberField
              label="HEIGHT"
              value={group.rowSpan}
              min={1}
              max={gridRows}
              onChange={value => onUpdateGroup({ rowSpan: value })}
            />
          </div>
        </SidebarSection>
      )}
    </div>
  )
}

function FieldRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] text-text-muted">{label}</span>
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <FieldRow label={label}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={event => {
          const next = parseInt(event.target.value, 10)
          if (!Number.isNaN(next)) onChange(next)
        }}
        className="w-full border border-border bg-bg-shell px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
      />
    </FieldRow>
  )
}

function ColorField({
  label,
  value,
  fallback,
  inheritedLabel,
  onChange,
  onReset,
}: {
  label: string
  value?: RGBAColor
  fallback: RGBAColor
  inheritedLabel: string
  onChange: (value: RGBAColor) => void
  onReset: () => void
}) {
  const effective = value ?? fallback
  const hex = rgbaToHex(effective)

  const applyHex = (raw: string) => {
    const clean = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      onChange(hexToRgba(clean, effective.A))
    }
  }

  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-2">
        <label
          className="h-8 w-8 cursor-pointer rounded border border-border"
          style={{ backgroundColor: hex }}
          title={hex}
        >
          <input
            type="color"
            value={hex}
            onChange={event => onChange(hexToRgba(event.target.value, effective.A))}
            className="sr-only"
          />
        </label>
        <input
          type="text"
          maxLength={7}
          defaultValue={hex}
          key={hex}
          onBlur={event => applyHex(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') applyHex(event.currentTarget.value)
          }}
          className="w-24 border border-border bg-bg-shell px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
        />
        <Button
          variant="ghost"
          size="xs"
          onClick={onReset}
          disabled={!value}
          className="font-mono text-[9px]"
        >
          RESET
        </Button>
      </div>
      {!value && (
        <span className="font-mono text-[9px] text-text-disabled">{inheritedLabel}</span>
      )}
    </FieldRow>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
