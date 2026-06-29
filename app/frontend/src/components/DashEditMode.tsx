import { useEffect, useState, type ReactNode } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconChevronUp,
  IconChevronDown,
  IconPencil,
  IconTargetArrow,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  SegmentedControl,
  SettingsCard,
  Stepper,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@sprint/ui'
import { HeaderPortal } from '@/components/shell/shellHeader'
import {
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
  type DashLayout,
  type DashPage,
  type DashWidget,
  type DashWidgetStack,
  type RGBAColor,
} from '@/lib/dash'
import { DashCanvas } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties, WidgetStyleProperties } from './WidgetProperties'
import { AdditionalSettingsPanel, hexToRgba, rgbaToHex } from './AdditionalSettingsPanel'
import { AlertsEditor } from './AlertsEditor'
import { WidgetPalette } from './dash-editor/WidgetPalette'
import { useDashEditorController } from './dash-editor/useDashEditorController'
import {
  type DashLayerChipState,
  createLayerStripState,
} from './dash-editor/layoutViewModel'

interface DashEditModeProps {
  layout: DashLayout
  onSave: (layout: DashLayout) => Promise<void>
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}

type EditorLeftRailView = 'pages' | 'widgets'
type EditorScale = '50' | '75' | '100' | '125'

const EDITOR_SCALE_OPTIONS = [
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
] as const

// Sentinel for the "no themeId — inherit the global default" option, since Radix
// Select forbids an empty-string item value.
const GLOBAL_THEME_VALUE = '__global__'

export function DashEditMode({ layout: initialLayout, onSave, onBack, onDirtyChange }: DashEditModeProps) {
  const controller = useDashEditorController({
    initialLayout,
    onSave,
    onBack,
    onDirtyChange,
  })

  const [leftRailView, setLeftRailView] = useState<EditorLeftRailView>('widgets')
  const [editorScale, setEditorScale] = useState<EditorScale>('100')
  const [advancedGeometryOpen, setAdvancedGeometryOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [showGrid, setShowGrid] = useState(true)

  const layerStripState = createLayerStripState({
    mode: controller.editorMode,
    selectedWidgetStack: controller.selectedWidgetStack,
    selectedLayerId: controller.selectedLayerId,
  })

  useEffect(() => {
    if (controller.editorMode === 'page') {
      setAdvancedGeometryOpen(false)
    }
  }, [controller.editorMode])

  useEffect(() => {
    setAdvancedGeometryOpen(false)
    setStyleOpen(false)
  }, [controller.activeTab, controller.selectedId, controller.selectedWidgetStackId, controller.selectedLayerId, controller.editorMode])

  const updateSelectedWidgetGeometry = (patch: Partial<Pick<DashWidget, 'col' | 'row' | 'colSpan' | 'rowSpan'>>) => {
    if (!controller.selectedWidget) return
    controller.updateSelectedWidget({
      ...controller.selectedWidget,
      ...patch,
    })
  }

  const activeEditorView = controller.editorTab === 'settings'
    ? 'settings'
    : controller.activeTab === 'alerts'
      ? 'alerts'
      : 'layout'
  const modeLabel = controller.layout.name.toLowerCase().includes('basic') ? 'Basic' : 'Advanced'
  const resolutionLabel = `${controller.screenW}x${controller.screenH}`
  const handleSelectEditorView = (view: 'layout' | 'alerts' | 'settings') => {
    if (view === 'settings') {
      controller.setEditorTab('settings')
      return
    }
    controller.setEditorTab('designer')
    if (view === 'alerts') {
      controller.selectCanvasTab('alerts')
      return
    }
    if (controller.activeTab === 'alerts') {
      controller.selectCanvasTab(0)
    }
  }
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
  const propertiesContent = controller.editorMode === 'stack' && controller.selectedWidgetStack && layerStripState
    ? (
      <div className="space-y-4">
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
        {widgetInspectorContent}
      </div>
    )
    : inspectorContent

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <HeaderPortal>
        <div className="flex min-w-0 items-center gap-[10px]">
          {/* Figma "Back_Button": 32 circle #1F1F1F / #2E2E2E, returns to the dash list. */}
          <IconButton
            app-region="no-drag"
            label="Back to dashboards"
            tone="secondary"
            size="icon"
            icon={<IconChevronLeft size={16} />}
            onClick={controller.handleBack}
          />

          <div app-region="no-drag" className="flex min-w-0 items-center gap-[8px]">
            {controller.renamingDash ? (
              <Input
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
                className="h-[28px] w-[200px] text-[13px] font-bold"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  controller.setDashNameValue(controller.layout.name)
                  controller.setRenamingDash(true)
                }}
                className="inline-flex min-w-0 max-w-[260px] items-center gap-[6px] rounded-[10px] border border-transparent px-2 py-1 text-[14px] font-bold text-[var(--text)] transition-colors hover:bg-[var(--panel2)]"
                aria-label="Rename dashboard"
              >
                <span className="truncate">{controller.layout.name}</span>
                <IconPencil size={14} className="shrink-0 text-[var(--text3)]" />
              </button>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={modeLabel === 'Basic' ? 'success' : 'tertiary'}>
                {modeLabel}
              </Badge>
              {controller.layout.id === 'default' && <Badge variant="active">System</Badge>}
              {controller.isDirty && <Badge variant="warning">Unsaved</Badge>}
              {controller.saveStatus === 'saved' && <Badge variant="success">Saved</Badge>}
              {controller.saveStatus === 'error' && <Badge variant="destructive">Failed</Badge>}
            </div>
          </div>
        </div>

        {/* Figma "Tab View": bordered pill with 1px dividers (not a segmented control). */}
        <div className="flex flex-1 items-center justify-center">
          <Tabs
            app-region="no-drag"
            value={activeEditorView}
            onValueChange={view => handleSelectEditorView(view as 'layout' | 'alerts' | 'settings')}
          >
            <TabsList>
              <TabsTrigger value="layout">Layout</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Figma "Save_Button": 32 circle #FF6A00 / #FF8636, tabler/check glyph. */}
        <div app-region="no-drag" className="flex shrink-0 items-center">
          <IconButton
            label={controller.saving ? 'Saving…' : controller.saveDisabledReason ?? 'Save dashboard'}
            tone="primary"
            size="icon"
            icon={<IconCheck size={16} />}
            onClick={controller.handleSave}
            disabled={!controller.canSave}
          />
        </div>
      </HeaderPortal>

      <ConfirmDialog
        open={controller.showDialog}
        title="Discard changes?"
        message="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={controller.confirm}
        onCancel={controller.cancel}
      />

      {!controller.layoutValid && (
        <div
          role="alert"
          data-testid="layout-validation-banner"
          className="flex shrink-0 items-center gap-2 border-b border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_14%,transparent)] px-4 py-2 text-[12px] font-medium text-[var(--text)]"
        >
          <IconAlertTriangle size={14} className="shrink-0 text-[var(--red)]" />
          <span>{controller.validationMessages.join(' · ')} — resolve before saving.</span>
        </div>
      )}

      {activeEditorView === 'alerts' ? (
        <div className="ds-settings-scroll">
          <div className="ds-settings-wrap">
            <SettingsCard className="min-h-[420px] overflow-hidden p-0">
              <AlertsEditor
                config={controller.layout.alertConfig ?? {}}
                catalog={controller.alertCatalog}
                domainPalette={controller.resolvedDomainPalette}
                onChange={controller.handleAlertConfigChange}
              />
            </SettingsCard>
            <DashEditorPreviewCard
              title="Live preview"
              controller={controller}
            />
          </div>
        </div>
      ) : activeEditorView === 'settings' ? (
        <div className="ds-settings-scroll">
          <div className="ds-settings-wrap">
            <SettingsCard className="min-h-[420px] overflow-hidden p-0">
              {/* Theme is chosen by reference — a row of preset buttons with a
                  colour dot (Figma "Appearance" pattern). Per-dashboard colour
                  editing is intentionally absent; colours live in the global
                  theme editor so editing a preset updates every dash using it. */}
              <div className="border-b border-border px-6 py-4">
                <p className="ui-label text-[11px] font-semibold text-[var(--text2)]">Theme</p>
                <p className="mb-3 font-sans tabular-nums text-[9px] leading-relaxed text-[var(--text2)]">
                  Base palette for this dashboard. Edit colours in the global theme editor.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      id: GLOBAL_THEME_VALUE,
                      name: 'Global default',
                      dot: controller.themeDefaults?.theme?.primary
                        ? rgbaToHex(controller.themeDefaults.theme.primary)
                        : 'var(--accent)',
                    },
                    ...controller.themes.map(t => ({
                      id: t.id,
                      name: t.name,
                      dot: t.theme?.primary ? rgbaToHex(t.theme.primary) : 'var(--accent)',
                    })),
                  ].map(opt => {
                    const active = opt.id === (controller.themeId || GLOBAL_THEME_VALUE)
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-active={active}
                        aria-pressed={active}
                        onClick={() => controller.handleThemeIdChange(opt.id === GLOBAL_THEME_VALUE ? '' : opt.id)}
                        className="inline-flex items-center gap-2 rounded-pill border border-[var(--line)] bg-[var(--panel2)] px-3 py-1.5 text-[13px] font-medium text-[var(--text2)] transition-colors hover:border-[var(--line2)] hover:text-[var(--text)] focus-visible:border-[var(--accent)] focus-visible:outline-none data-[active=true]:border-[var(--accent)] data-[active=true]:bg-[var(--orange-soft)] data-[active=true]:text-[var(--text)]"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black/40"
                          style={{ backgroundColor: opt.dot }}
                        />
                        {opt.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <AdditionalSettingsPanel
                theme={controller.layout.theme ?? {}}
                domainPalette={controller.layout.domainPalette ?? {}}
                hardcodedDefaults={{ theme: DEFAULT_DASH_THEME, domain: DEFAULT_DOMAIN_PALETTE }}
                globalDefaults={controller.themeDefaults}
                typography={controller.layout.typography}
                globalTypography={controller.themeDefaults?.typography}
                formatPreferences={controller.layout.formatPreferences}
                globalFormatPreferences={controller.themeDefaults?.formatPreferences}
                onChange={controller.handleSettingsChange}
                onTypographyChange={controller.handleTypographyChange}
                onFormatPreferencesChange={controller.handleFormatPreferencesChange}
                showColors={false}
              />
            </SettingsCard>
            <DashEditorPreviewCard
              title="Live preview"
              controller={controller}
            />
          </div>
        </div>
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

          <div className="flex min-h-0 flex-1 gap-[10px] overflow-hidden">
            <EditorLeftRail
              view={leftRailView}
              onViewChange={setLeftRailView}
              pages={(
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
              )}
              widgets={paletteContent}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Badge variant="outline">{resolutionLabel}</Badge>
                <SegmentedControl
                  label="Editor scale"
                  value={editorScale}
                  variant="neutral"
                  options={EDITOR_SCALE_OPTIONS}
                  onChange={value => setEditorScale(value as EditorScale)}
                />
                <IconButton
                  label={showGrid ? 'Hide grid overlay' : 'Show grid overlay'}
                  title={showGrid ? 'Hide grid overlay' : 'Show grid overlay'}
                  icon={<IconTargetArrow size={15} />}
                  size="icon-sm"
                  variant={showGrid ? 'active' : 'outline'}
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid(current => !current)}
                />
              </div>
              <div
                ref={controller.canvasPaneRef}
                className="ds-canvas-stage"
                data-scale={editorScale}
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
                            invalidIds={controller.invalidWidgetIds}
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
                            showGrid={showGrid}
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
                          invalidIds={controller.invalidWidgetIds}
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
                          showGrid={showGrid}
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
                  <div className="ds-reference-canvas">
                    <DashCanvas
                      widgets={controller.canvasWidgets}
                      invalidIds={controller.invalidWidgetIds}
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
                      showGrid={showGrid}
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
            </div>

            <EditorPropertiesRail>
              {propertiesContent ?? (
                <p className="text-[12px] text-[var(--text3)]">Select a widget or page to edit its properties.</p>
              )}
            </EditorPropertiesRail>
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

function DashEditorPreviewCard({
  title,
  controller,
}: {
  title: string
  controller: ReturnType<typeof useDashEditorController>
}) {
  const previewPage = controller.layout.pages[0] ?? controller.layout.idlePage

  return (
    <SettingsCard>
      <h3>{title}</h3>
      <div className="mt-3 aspect-[2.25/1] overflow-hidden rounded-[calc(var(--r)-2px)] border border-[var(--line)] bg-black">
        <CanvasViewport screenW={controller.screenW} screenH={controller.screenH}>
          <DashCanvas
            readOnly
            fillParent
            widgets={previewPage.widgets}
            gridCols={controller.layout.gridCols}
            gridRows={controller.layout.gridRows}
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
            previewUrl={controller.previewUrl ?? undefined}
            onSelect={() => {}}
            onUpdate={() => {}}
          />
        </CanvasViewport>
      </div>
      <p className="mt-3 text-[11px] text-[var(--text3)]">
        {controller.screenW}x{controller.screenH} · {controller.layout.gridCols}x{controller.layout.gridRows} grid
      </p>
    </SettingsCard>
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
    <div className="flex flex-shrink-0 items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--panel2)] px-3 py-2">
      <div className="min-w-0">
            <div className="ui-label text-[10px] uppercase text-[var(--muted)]">
          {pageName} / Widget Stack
        </div>
        <div className="truncate text-sm font-medium text-foreground">{stackName}</div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" size="xs" onClick={onBack}>
            Back to page
        </Button>
        <Button
          variant={compareEnabled ? 'primary' : 'outline'}
          size="xs"
          onClick={onToggleCompare}
          disabled={compareDisabled}
              className="text-[12px]"
        >
          COMPARE
        </Button>
          <Button variant="outline" size="xs" onClick={onAddLayer}>
            Add layer
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
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--bg-deep)]">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel2)] px-3 py-2">
      <span className="ui-label text-[10px] uppercase text-[var(--muted)]">{title}</span>
        {subtitle && <span className="truncate font-inter text-[11px] text-foreground">{subtitle}</span>}
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

function EditorLeftRail({
  view,
  onViewChange,
  pages,
  widgets,
}: {
  view: EditorLeftRailView
  onViewChange: (view: EditorLeftRailView) => void
  pages: ReactNode
  widgets: ReactNode
}) {
  return (
    <aside className="flex w-[248px] shrink-0 flex-col gap-[14px] overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-[14px]">
      <SegmentedControl
        label="Editor left rail"
        value={view}
        variant="accent"
        options={[
          { value: 'pages', label: 'Pages' },
          { value: 'widgets', label: 'Widgets' },
        ]}
        onChange={value => onViewChange(value as EditorLeftRailView)}
        className="w-full justify-center [&>button]:flex-1"
      />
      <div className="-mr-[8px] min-h-0 flex-1 overflow-y-auto pr-[8px]">
        {view === 'pages' ? pages : widgets}
      </div>
    </aside>
  )
}

function EditorPropertiesRail({ children }: { children: ReactNode }) {
  return (
    // Figma "Properties": #141414, radius 18, pad 14, "PROPERTIES" title.
    // Widened from the 155px Figma mock to 240px so the live inspector
    // (color fields, steppers) stays usable — a deliberate usability deviation.
    <aside className="flex w-[240px] shrink-0 flex-col gap-[14px] overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-[14px]">
      <div className="flex flex-col gap-[4px]">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text2)]">Properties</h2>
        <p className="text-[10px] text-[var(--text3)]">Selected widget and page settings</p>
      </div>
      <div className="-mr-[8px] min-h-0 flex-1 overflow-y-auto pr-[8px]">
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
      <h5 className="ui-label text-[10px] font-bold text-text-muted">{title}</h5>
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
    <section className="overflow-hidden rounded-control border border-border/80">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-[var(--panel2)] px-3 py-2 text-left transition-colors hover:bg-[var(--panel3)]"
      >
            <span className="ui-label text-[10px] font-semibold text-text-muted">{title}</span>
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
        <SidebarSection title="Stack">
        <div className="space-y-3">
          <FieldRow label="Name">
            <Input
              type="text"
              value={stack.name}
              onChange={event => onRenameStack(event.target.value)}
              className="h-8"
            />
          </FieldRow>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="xs" onClick={onClearLayer}>
              Clear layer
            </Button>
            <Button variant="destructive" size="xs" onClick={onDeleteStack}>
              Delete stack
            </Button>
          </div>
        </div>
      </SidebarSection>

        <SidebarSection title="Layers">
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
        <Button variant="outline" size="xs" onClick={onAddLayer} className="w-full justify-center">
          Add layer
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
        'rounded-control border px-3 py-2 transition-colors',
        layer.selected
          ? 'border-[var(--accent)]/40 bg-[var(--orange-soft)]'
          : 'border-[var(--line)] bg-[var(--panel)]',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onSelect}
            className="flex h-auto min-w-0 w-full flex-col items-start justify-start px-0 py-0 text-left"
          >
            <span className={cn('truncate font-inter text-[13px]', layer.selected ? 'text-foreground' : 'text-[var(--muted)]')}>
              {layer.name}
            </span>
          </Button>
          <Input
            type="text"
            value={layer.name}
            onChange={event => onRename(event.target.value)}
            className="h-8"
          />
          <div className="flex flex-wrap items-center gap-1">
          {layer.isDefault && (
            <span className="mt-1 rounded border border-border/80 px-1 py-0.5 font-inter text-[10px] uppercase tracking-wide text-[var(--muted)]">
              default
            </span>
          )}
            {compareEnabled && !layer.selected && (
              <Button
                type="button"
                onClick={onSetReference}
                variant={referenceLayerId === layer.id ? 'active' : 'outline'}
                size="xs"
                className={cn(
                  'h-6 px-1.5 font-inter text-[10px]',
                  referenceLayerId === layer.id
                    ? 'text-success'
                    : 'text-[var(--muted)] hover:text-foreground',
                )}
              >
                {referenceLayerId === layer.id ? 'Reference' : 'Use as reference'}
              </Button>
            )}
            {selectedLayerId === layer.id && (
              <span className="rounded-tag border border-primary/50 px-1.5 py-0.5 font-inter text-[10px] uppercase tracking-wide text-primary">
                active
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <IconButton
            label="Set default layer"
            icon={<IconTargetArrow size={14} />}
            onClick={onSetDefault}
            disabled={layer.isDefault}
            size="icon-xs"
            variant="outline"
          />
          <IconButton
            label="Duplicate layer"
            icon={<IconCopy size={14} />}
            onClick={onDuplicate}
            size="icon-xs"
            variant="outline"
          />
          <IconButton
            label="Move layer up"
            icon={<IconChevronUp size={14} />}
            onClick={onMoveUp}
            disabled={!layer.canMoveLeft}
            size="icon-xs"
            variant="outline"
          />
          <IconButton
            label="Move layer down"
            icon={<IconChevronDown size={14} />}
            onClick={onMoveDown}
            disabled={!layer.canMoveRight}
            size="icon-xs"
            variant="outline"
          />
          <IconButton
            label="Delete layer"
            icon={<IconX size={14} />}
            onClick={onDelete}
            disabled={disableDelete}
            size="icon-xs"
            variant="destructive"
          />
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
          <span className="font-inter text-[13px] text-foreground">{page.name}</span>
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
          <Button variant="ghost" size="xs" onClick={onClearPage}>
            Clear page
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

        <SidebarDisclosureSection title="Style" open={styleOpen} onToggle={onToggleStyle}>
        <WidgetStyleProperties
          widget={widget}
          onUpdate={onUpdate}
        />
      </SidebarDisclosureSection>

      <SidebarDisclosureSection
          title="Advanced geometry"
        open={advancedGeometryOpen}
        onToggle={onToggleAdvancedGeometry}
      >
        <div className="px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Col">
              <Stepper inputLabel="Column" value={widget.col} min={0} max={999} onChange={value => onUpdateGeometry({ col: value })} />
            </FieldRow>
            <FieldRow label="Row">
              <Stepper inputLabel="Row" value={widget.row} min={0} max={999} onChange={value => onUpdateGeometry({ row: value })} />
            </FieldRow>
            <FieldRow label="Width">
              <Stepper inputLabel="Width" value={widget.colSpan} min={1} max={999} onChange={value => onUpdateGeometry({ colSpan: value })} />
            </FieldRow>
            <FieldRow label="Height">
              <Stepper inputLabel="Height" value={widget.rowSpan} min={1} max={999} onChange={value => onUpdateGeometry({ rowSpan: value })} />
            </FieldRow>
          </div>
        </div>
      </SidebarDisclosureSection>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          size="xs"
          onClick={onDelete}
          className="inline-flex items-center gap-1"
        >
          <IconTrash size={14} />
          Remove widget
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
    <label className="flex flex-col gap-[6px]">
      <span className="ui-label text-[11px] text-[var(--muted)]">{label}</span>
      {children}
    </label>
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
          className="h-8 w-8 cursor-pointer rounded-[8px] border border-[var(--border)]"
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
            <Input
              type="text"
              maxLength={7}
              defaultValue={hex}
          key={hex}
          onBlur={event => applyHex(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') applyHex(event.currentTarget.value)
          }}
              className="h-8 w-24"
            />
        <Button
          variant="ghost"
          size="xs"
          onClick={onReset}
          disabled={!value}
          className="font-inter text-[11px]"
        >
          RESET
        </Button>
      </div>
      {!value && (
        <span className="font-inter text-[11px] text-[var(--muted)]">{inheritedLabel}</span>
      )}
    </FieldRow>
  )
}

function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <IconChevronRight
      size={14}
      className={cn('text-[var(--muted)] transition-transform', open && 'rotate-90')}
      aria-hidden="true"
    />
  )
}
