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
  type DashWidgetStack,
  type RGBAColor,
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
} from '@/lib/dash'
import type { AppSettings, DashEditorUIPreferences } from '@sprint/types'
import { DashCanvas } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties, WidgetStyleProperties } from './WidgetProperties'
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
  const [styleOpen, setStyleOpen] = useState(false)
  const savedSettingsRef = useRef<AppSettings | null>(null)
  const persistPanelPreferencesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentPageName = controller.currentPage?.name ?? controller.layout.idlePage.name
  const inspectorState = createInspectorSheetState({
    mode: controller.editorMode,
    selectedWidget: controller.selectedWidget,
    selectedWidgetStack: controller.selectedWidgetStack,
    pageName: currentPageName,
  })
  const layerStripState = createLayerStripState({
    mode: controller.editorMode,
    selectedWidgetStack: controller.selectedWidgetStack,
    selectedLayerId: controller.selectedLayerId,
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
    setStyleOpen(false)
  }, [controller.activeTab, controller.selectedId, controller.selectedWidgetStackId, controller.selectedLayerId, controller.editorMode])

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
  const paletteContent = (
    <WidgetPalette
      catalog={controller.paletteWidgets}
      previewUrls={controller.widgetPreviewUrls}
      includeWidgetStack={controller.editorMode === 'page'}
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
  const widgetInspectorContent = controller.selectedWidget ? (
    <WidgetInspectorPanel
      widget={controller.selectedWidget}
      catalog={controller.catalog}
      onUpdate={controller.updateSelectedWidget}
      styleOpen={styleOpen}
      onToggleStyle={() => setStyleOpen(current => !current)}
      advancedGeometryOpen={advancedGeometryOpen}
      onToggleAdvancedGeometry={() => setAdvancedGeometryOpen(current => !current)}
      onUpdateGeometry={updateSelectedWidgetGeometry}
      onDelete={() => controller.setConfirmRemoveWidget(true)}
    />
  ) : null
  const pageInspectorContent = controller.currentPage && controller.editorMode === 'page' && !controller.selectedWidget ? (
    <PagePropertiesPanel
      page={controller.currentPage}
      themeBackground={controller.resolvedTheme.bg}
      onBackgroundChange={controller.handlePageBackgroundChange}
      onClearPage={controller.handleClearPage}
    />
  ) : null
  const inspectorContent = widgetInspectorContent ?? pageInspectorContent
  const stackCanvasGridCols = controller.selectedWidgetStack?.colSpan ?? controller.layout.gridCols
  const stackCanvasGridRows = controller.selectedWidgetStack?.rowSpan ?? controller.layout.gridRows

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
          {controller.isDirty && <Badge variant="warning" className="ui-label">Unsaved</Badge>}
          {controller.saveStatus === 'saved' && <Badge variant="success" className="ui-label">Saved</Badge>}
          {controller.saveStatus === 'error' && <Badge variant="destructive" className="ui-label">Failed</Badge>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={controller.handleBack}>
            BACK
          </Button>
          <Button variant="primary" size="sm" onClick={controller.handleSave} disabled={controller.saving}>
            {controller.saving ? 'Saving…' : 'Save'}
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
            Designer
          </button>
          <button
            type="button"
            onClick={() => controller.setEditorTab('settings')}
            data-state={controller.editorTab === 'settings' ? 'active' : 'inactive'}
            className={topTabTriggerClassName}
          >
            Settings
          </button>
          {controller.editorTab === 'designer' && (
            <>
              {controller.editorMode === 'stack' && (
                <button
                  type="button"
                  onClick={controller.exitWidgetStackEditMode}
                  data-state="inactive"
                  className={cn(topTabTriggerClassName, 'gap-1.5 px-3')}
                >
                  <span className="text-text-disabled">←</span>
                  <span>Page</span>
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {controller.editorMode === 'stack' && controller.currentPage && controller.selectedWidgetStack && (
            <FocusModeHeader
              pageName={controller.currentPage.name}
              stackName={controller.selectedWidgetStack.name}
              compareEnabled={controller.compareEnabled}
              compareDisabled={(controller.selectedWidgetStack.layers.length ?? 0) < 2}
              onBack={controller.exitWidgetStackEditMode}
              onToggleCompare={controller.handleToggleCompare}
              onAddLayer={controller.handleAddLayer}
            />
          )}

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

              {controller.editorMode === 'page' && !panelPreferences.inspector.open && (
                <EditorEdgeHandle
                  side="right"
                  label="INSPECTOR"
                  onClick={() => handleTogglePanelOpen('inspector')}
                />
              )}

              <div
                ref={controller.canvasPaneRef}
                className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-sm"
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    controller.handleCanvasBackgroundClick()
                  }
                }}
              >
                {controller.editorMode === 'stack' && controller.selectedWidgetStack ? (
                  controller.compareEnabled && controller.referenceLayer ? (
                    <div className="grid h-full w-full min-h-0 min-w-0 grid-cols-2 gap-3">
                      <CanvasStage title="ACTIVE LAYER" subtitle={controller.selectedLayer?.name}>
                        <CanvasViewport screenW={controller.screenW} screenH={controller.screenH}>
                          <DashCanvas
                            fillParent
                            widgets={controller.canvasWidgets}
                            gridCols={stackCanvasGridCols}
                            gridRows={stackCanvasGridRows}
                            selectedId={controller.selectedId}
                            catalog={controller.catalog}
                            screenW={controller.screenW}
                            screenH={controller.screenH}
                            theme={controller.resolvedTheme}
                            domainPalette={controller.resolvedDomainPalette}
                            blockedAreas={[]}
                            placementBounds={null}
                            overlayRects={[]}
                            overlayBlockedAreas={[]}
                            overlayEditMode={false}
                            paletteDropType={controller.paletteDropType}
                            palettePreviewUrl={controller.paletteDropPreviewUrl}
                            previewUrl={controller.previewUrl ?? undefined}
                            onBackgroundClick={controller.handleCanvasBackgroundClick}
                            onSelect={controller.handleCanvasSelectWidget}
                            onUpdate={controller.handleUpdate}
                          />
                        </CanvasViewport>
                      </CanvasStage>
                      <button
                        type="button"
                        onClick={controller.handlePromoteReferenceLayer}
                        className="flex min-h-0 min-w-0 text-left"
                      >
                        <CanvasStage title="REFERENCE LAYER" subtitle={`${controller.referenceLayer.name} · click to edit`}>
                          <div className="pointer-events-none h-full w-full">
                            <CanvasViewport screenW={controller.screenW} screenH={controller.screenH}>
                              <DashCanvas
                                readOnly
                                fillParent
                                widgets={controller.referenceLayer.widgets}
                                gridCols={stackCanvasGridCols}
                                gridRows={stackCanvasGridRows}
                                selectedId={null}
                                catalog={controller.catalog}
                                screenW={controller.screenW}
                                screenH={controller.screenH}
                                theme={controller.resolvedTheme}
                                domainPalette={controller.resolvedDomainPalette}
                                blockedAreas={[]}
                                placementBounds={null}
                                overlayRects={[]}
                                overlayBlockedAreas={[]}
                                overlayEditMode={false}
                                onSelect={() => {}}
                                onUpdate={() => {}}
                              />
                            </CanvasViewport>
                          </div>
                        </CanvasStage>
                      </button>
                    </div>
                  ) : (
                    <CanvasStage title="ACTIVE LAYER" subtitle={controller.selectedLayer?.name}>
                      <CanvasViewport screenW={controller.screenW} screenH={controller.screenH}>
                        <DashCanvas
                          fillParent
                          widgets={controller.canvasWidgets}
                          gridCols={stackCanvasGridCols}
                          gridRows={stackCanvasGridRows}
                          selectedId={controller.selectedId}
                          catalog={controller.catalog}
                          screenW={controller.screenW}
                          screenH={controller.screenH}
                          theme={controller.resolvedTheme}
                          domainPalette={controller.resolvedDomainPalette}
                          blockedAreas={[]}
                          placementBounds={null}
                          overlayRects={[]}
                          overlayBlockedAreas={[]}
                          overlayEditMode={false}
                          paletteDropType={controller.paletteDropType}
                          palettePreviewUrl={controller.paletteDropPreviewUrl}
                          previewUrl={controller.previewUrl ?? undefined}
                          onBackgroundClick={controller.handleCanvasBackgroundClick}
                          onSelect={controller.handleCanvasSelectWidget}
                          onUpdate={controller.handleUpdate}
                        />
                      </CanvasViewport>
                    </CanvasStage>
                  )
                ) : (
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
                      overlayEditMode={false}
                      paletteDropType={controller.paletteDropType}
                      palettePreviewUrl={controller.paletteDropPreviewUrl}
                      previewUrl={controller.previewUrl ?? undefined}
                      onBackgroundClick={controller.handleCanvasBackgroundClick}
                      onSelect={controller.handleCanvasSelectWidget}
                      onSelectOverlay={controller.handleCanvasSelectWidgetStack}
                      onUpdateOverlay={controller.handleCanvasUpdateWidgetStack}
                      onEnterOverlay={controller.handleCanvasEnterWidgetStack}
                      onDropWidgetStack={controller.handleCanvasCreateWidgetStack}
                      onUpdate={controller.handleUpdate}
                    />
                  </div>
                )}
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

              {controller.editorMode === 'page' && inspectorOverlay && inspectorContent && (
                <div className="pointer-events-none absolute inset-y-2 right-0 z-20 flex w-80 max-w-[calc(100%-1rem)]">
                  <EditorSidebar
                    side="right"
                    mode="overlay"
                    className="pointer-events-auto flex-1"
                    title={inspectorState.title}
                    pinned={panelPreferences.inspector.pinned}
                    onTogglePinned={() => handleTogglePanelPinned('inspector')}
                    onClose={() => handleSetPanelOpen('inspector', false)}
                  >
                    {inspectorContent}
                  </EditorSidebar>
                </div>
              )}

              {controller.editorMode === 'stack' && widgetInspectorContent && (
                <div className="pointer-events-none absolute inset-y-2 right-0 z-20 flex w-80 max-w-[calc(100%-1rem)]">
                  <EditorSidebar
                    side="right"
                    mode="overlay"
                    className="pointer-events-auto flex-1"
                    title={inspectorState.title}
                    pinned={false}
                    onTogglePinned={() => {}}
                    onClose={() => controller.setSelectedId(null)}
                    showPinButton={false}
                  >
                    {widgetInspectorContent}
                  </EditorSidebar>
                </div>
              )}
            </div>

            {controller.editorMode === 'stack' && controller.selectedWidgetStack && layerStripState && (
              <EditorSidebar
                side="right"
                mode="docked"
                className="w-80 flex-shrink-0"
                title={`STACK · ${controller.selectedWidgetStack.name}`}
                pinned
                onTogglePinned={() => {}}
                onClose={() => {}}
                showPinButton={false}
                showCloseButton={false}
              >
                <LayerListPanel
                  stack={controller.selectedWidgetStack}
                  layers={layerStripState.layers}
                  selectedLayerId={controller.selectedLayerId}
                  compareEnabled={controller.compareEnabled}
                  referenceLayerId={controller.referenceLayer?.id ?? null}
                  onRenameStack={controller.handleRenameWidgetStack}
                  onAddLayer={controller.handleAddLayer}
                  onSelectLayer={controller.handleSelectLayer}
                  onRenameLayer={controller.handleRenameLayer}
                  onSetReferenceLayer={controller.handleSelectReferenceLayer}
                  onSetDefaultLayer={controller.handleSetDefaultLayer}
                  onDuplicateLayer={controller.handleDuplicateLayer}
                  onMoveLayerUp={layerId => controller.handleMoveLayer(layerId, -1)}
                  onMoveLayerDown={layerId => controller.handleMoveLayer(layerId, 1)}
                  onDeleteLayer={controller.handleDeleteLayer}
                  onDeleteStack={controller.handleDeleteSelectedWidgetStack}
                  onClearLayer={controller.handleClearPage}
                  disableDelete={(controller.selectedWidgetStack.layers.length ?? 0) <= 1}
                />
              </EditorSidebar>
            )}

            {controller.editorMode === 'page' && inspectorDocked && inspectorContent && (
              <EditorSidebar
                side="right"
                mode="docked"
                className="w-80 flex-shrink-0"
                title={inspectorState.title}
                pinned={panelPreferences.inspector.pinned}
                onTogglePinned={() => handleTogglePanelPinned('inspector')}
                onClose={() => handleSetPanelOpen('inspector', false)}
              >
                {inspectorContent}
              </EditorSidebar>
            )}
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

function FocusModeHeader({
  pageName,
  stackName,
  compareEnabled,
  compareDisabled,
  onBack,
  onToggleCompare,
  onAddLayer,
}: {
  pageName: string
  stackName: string
  compareEnabled: boolean
  compareDisabled: boolean
  onBack: () => void
  onToggleCompare: () => void
  onAddLayer: () => void
}) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-shell px-3 py-2">
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-wide text-text-disabled">
          {pageName} / Widget Stack
        </div>
        <div className="truncate text-sm font-medium text-foreground">{stackName}</div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Button variant="outline" size="xs" onClick={onBack} className="font-mono text-[9px]">
          BACK_TO_PAGE
        </Button>
        <Button
          variant={compareEnabled ? 'primary' : 'outline'}
          size="xs"
          onClick={onToggleCompare}
          disabled={compareDisabled}
          className="font-mono text-[9px]"
        >
          COMPARE
        </Button>
        <Button variant="outline" size="xs" onClick={onAddLayer} className="font-mono text-[9px]">
          ADD_LAYER
        </Button>
      </div>
    </div>
  )
}

function CanvasStage({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-bg-shell">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-wide text-text-disabled">{title}</span>
        {subtitle && <span className="truncate font-mono text-[10px] text-foreground">{subtitle}</span>}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-3">
        {children}
      </div>
    </div>
  )
}

function CanvasViewport({
  screenW,
  screenH,
  children,
}: {
  screenW: number
  screenH: number
  children: ReactNode
}) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    if (!containerEl) return

    const ratio = screenW / screenH
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width <= 0 || height <= 0) return
      if (width / height > ratio) {
        setFit({ w: Math.floor(height * ratio), h: Math.floor(height) })
      } else {
        setFit({ w: Math.floor(width), h: Math.floor(width / ratio) })
      }
    })

    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [containerEl, screenH, screenW])

  return (
    <div ref={setContainerEl} className="flex h-full w-full items-center justify-center">
      {fit && (
        <div style={{ width: fit.w, height: fit.h }}>
          {children}
        </div>
      )}
    </div>
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
  showPinButton = true,
  showCloseButton = true,
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
  showPinButton?: boolean
  showCloseButton?: boolean
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
          {showPinButton && (
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
          )}
          {showCloseButton && (
            <button
              type="button"
              title="Hide panel"
              onClick={onClose}
              className="rounded p-1 text-text-muted transition-colors hover:text-foreground"
            >
              <CloseIcon />
            </button>
          )}
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
      <h5 className="ui-label text-[9px] font-bold text-text-muted">{title}</h5>
      {children}
    </section>
  )
}

function SidebarDisclosureSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden border border-border/80">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-bg-shell px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="terminal-header text-[9px] font-bold text-text-muted">{title}</span>
        <DisclosureChevron open={open} />
      </button>
      {open && (
        <div className="border-t border-border/80">
          {children}
        </div>
      )}
    </section>
  )
}

function LayerListPanel({
  stack,
  layers,
  selectedLayerId,
  compareEnabled,
  referenceLayerId,
  onRenameStack,
  onAddLayer,
  onSelectLayer,
  onRenameLayer,
  onSetReferenceLayer,
  onSetDefaultLayer,
  onDuplicateLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onDeleteLayer,
  onDeleteStack,
  onClearLayer,
  disableDelete,
}: {
  stack: DashWidgetStack
  layers: DashLayerChipState[]
  selectedLayerId: string | null
  compareEnabled: boolean
  referenceLayerId: string | null
  onRenameStack: (name: string) => void
  onAddLayer: () => void
  onSelectLayer: (layerId: string) => void
  onRenameLayer: (layerId: string, name: string) => void
  onSetReferenceLayer: (layerId: string) => void
  onSetDefaultLayer: (layerId: string) => void
  onDuplicateLayer: (layerId: string) => void
  onMoveLayerUp: (layerId: string) => void
  onMoveLayerDown: (layerId: string) => void
  onDeleteLayer: (layerId: string) => void
  onDeleteStack: () => void
  onClearLayer: () => void
  disableDelete: boolean
}) {
  return (
    <div className="space-y-4">
      <SidebarSection title="STACK">
        <div className="space-y-3">
          <FieldRow label="NAME">
            <input
              type="text"
              value={stack.name}
              onChange={event => onRenameStack(event.target.value)}
              className="w-full border border-border bg-bg-shell px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
            />
          </FieldRow>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="xs" onClick={onClearLayer} className="font-mono text-[9px]">
              CLEAR_LAYER
            </Button>
            <Button variant="destructive" size="xs" onClick={onDeleteStack} className="font-mono text-[9px]">
              DELETE_STACK
            </Button>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="LAYERS">
        <div className="space-y-2">
        {layers.map(layer => (
          <LayerListItem
            key={layer.id}
            layer={layer}
            selectedLayerId={selectedLayerId}
            compareEnabled={compareEnabled}
            referenceLayerId={referenceLayerId}
            onSelect={() => onSelectLayer(layer.id)}
            onRename={name => onRenameLayer(layer.id, name)}
            onSetReference={() => onSetReferenceLayer(layer.id)}
            onSetDefault={() => onSetDefaultLayer(layer.id)}
            onDuplicate={() => onDuplicateLayer(layer.id)}
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
    </div>
  )
}

function LayerListItem({
  layer,
  selectedLayerId,
  compareEnabled,
  referenceLayerId,
  onSelect,
  onRename,
  onSetReference,
  onSetDefault,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  disableDelete,
}: {
  layer: DashLayerChipState
  selectedLayerId: string | null
  compareEnabled: boolean
  referenceLayerId: string | null
  onSelect: () => void
  onRename: (name: string) => void
  onSetReference: () => void
  onSetDefault: () => void
  onDuplicate: () => void
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
        <div className="min-w-0 flex-1 space-y-2">
          <button type="button" onClick={onSelect} className="flex min-w-0 w-full flex-col items-start text-left">
            <span className={cn('truncate font-mono text-[10px]', layer.selected ? 'text-foreground' : 'text-text-muted')}>
              {layer.name}
            </span>
          </button>
          <input
            type="text"
            value={layer.name}
            onChange={event => onRename(event.target.value)}
            className="w-full border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-1">
          {layer.isDefault && (
            <span className="mt-1 rounded border border-border/80 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-text-disabled">
              default
            </span>
          )}
            {compareEnabled && !layer.selected && (
              <button
                type="button"
                onClick={onSetReference}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide transition-colors',
                  referenceLayerId === layer.id
                    ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                    : 'border-border text-text-disabled hover:text-foreground',
                )}
              >
                {referenceLayerId === layer.id ? 'REF' : 'SET_REF'}
              </button>
            )}
            {selectedLayerId === layer.id && (
              <span className="rounded border border-accent/50 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-foreground">
                active
              </span>
            )}
          </div>
        </div>
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
            onClick={onDuplicate}
            className="rounded border border-border px-1 text-[9px] text-text-disabled transition-colors hover:text-foreground"
            title="Duplicate layer"
          >
            +
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
    <SidebarSection title="Page">
      <div className="space-y-3">
        <FieldRow label="Name">
          <span className="font-mono text-[10px] text-foreground">{page.name}</span>
        </FieldRow>
        <ColorField
          label="Background"
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
  styleOpen,
  onToggleStyle,
  advancedGeometryOpen,
  onToggleAdvancedGeometry,
  onUpdateGeometry,
  onDelete,
}: {
  widget: DashWidget
  catalog: DashLayout extends never ? never : Parameters<typeof WidgetProperties>[0]['catalog']
  onUpdate: (widget: DashWidget) => void
  styleOpen: boolean
  onToggleStyle: () => void
  advancedGeometryOpen: boolean
  onToggleAdvancedGeometry: () => void
  onUpdateGeometry: (patch: Partial<Pick<DashWidget, 'col' | 'row' | 'colSpan' | 'rowSpan'>>) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <WidgetProperties
        widget={widget}
        catalog={catalog}
        onUpdate={onUpdate}
      />

      <SidebarDisclosureSection title="STYLE" open={styleOpen} onToggle={onToggleStyle}>
        <WidgetStyleProperties
          widget={widget}
          onUpdate={onUpdate}
        />
      </SidebarDisclosureSection>

      <SidebarDisclosureSection
        title="ADVANCED_GEOMETRY"
        open={advancedGeometryOpen}
        onToggle={onToggleAdvancedGeometry}
      >
        <div className="px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Col" value={widget.col} min={0} max={999} onChange={value => onUpdateGeometry({ col: value })} />
            <NumberField label="Row" value={widget.row} min={0} max={999} onChange={value => onUpdateGeometry({ row: value })} />
            <NumberField label="Width" value={widget.colSpan} min={1} max={999} onChange={value => onUpdateGeometry({ colSpan: value })} />
            <NumberField label="Height" value={widget.rowSpan} min={1} max={999} onChange={value => onUpdateGeometry({ rowSpan: value })} />
          </div>
        </div>
      </SidebarDisclosureSection>

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

function DisclosureChevron({ open }: { open: boolean }) {
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
      className={cn('text-text-disabled transition-transform', open && 'rotate-90')}
      aria-hidden="true"
    >
      <polyline points="4,2.5 7.5,5.5 4,8.5" />
    </svg>
  )
}
