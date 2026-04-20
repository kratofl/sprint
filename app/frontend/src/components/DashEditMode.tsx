import type { ReactNode } from 'react'
import {
  Badge,
  Button,
  PageHeader,
  cn,
} from '@sprint/ui'
import {
  type DashLayout,
  type DashPage,
  type DashWrapperGroup,
  type DashWrapperVariant,
  type RGBAColor,
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
} from '@/lib/dash'
import { DashCanvas } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties } from './WidgetProperties'
import { ConfirmDialog } from './ConfirmDialog'
import { AdditionalSettingsPanel, hexToRgba, rgbaToHex } from './AdditionalSettingsPanel'
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
          domainPalette={controller.layout.domainPalette}
          onChange={controller.handleAlertsChange}
        />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-64 flex-shrink-0 flex-col overflow-hidden border-r border-border">
            <div className="border-b border-border px-4 py-3">
              <h4 className="terminal-header text-[10px] font-bold text-text-muted">EDITOR_TARGET</h4>
            </div>
            <div className="overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Button
                    variant={controller.selectedWrapperGroup ? 'outline' : 'secondary'}
                    size="sm"
                    onClick={() => controller.selectWrapperGroup(null)}
                    className="justify-start font-mono text-[10px]"
                  >
                    PAGE_WIDGETS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={controller.handleAddWrapperGroup}
                    className="justify-start font-mono text-[10px]"
                  >
                    ADD_WRAPPER_GROUP
                  </Button>
                </div>

                <SidebarSection
                  title="WRAPPER_GROUPS"
                  note={controller.wrapperGroups.length === 0 ? 'Create a wrapper to stack alternate widget variants in one region.' : undefined}
                >
                  <div className="space-y-1.5">
                    {controller.wrapperGroups.map(group => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => controller.selectWrapperGroup(group.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded border px-2 py-2 text-left font-mono text-[10px] transition-colors',
                          controller.selectedWrapperGroupId === group.id
                            ? 'border-accent bg-accent/[0.08] text-accent'
                            : 'border-border text-text-muted hover:border-border-strong hover:text-foreground',
                        )}
                      >
                        <span className="truncate">{group.name}</span>
                        <span className="text-[9px] opacity-70">
                          {group.col},{group.row} {group.colSpan}x{group.rowSpan}
                        </span>
                      </button>
                    ))}
                  </div>
                </SidebarSection>

                {controller.selectedWrapperGroup && (
                  <SidebarSection title="VARIANTS">
                    <div className="space-y-1.5">
                      {controller.selectedWrapperGroup.variants.map(variant => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => controller.handleSelectWrapperVariant(variant.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded border px-2 py-2 text-left font-mono text-[10px] transition-colors',
                            controller.selectedVariantId === variant.id
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border text-text-muted hover:border-border-strong hover:text-foreground',
                          )}
                        >
                          <span className="truncate">{variant.name}</span>
                          {controller.selectedWrapperGroup?.defaultVariantId === variant.id && (
                            <Badge variant="neutral" className="terminal-header">DEFAULT</Badge>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={controller.handleAddWrapperVariant}
                        className="font-mono text-[9px]"
                      >
                        ADD_VARIANT
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={controller.handleDeleteSelectedVariant}
                        disabled={!controller.selectedWrapperVariant || controller.selectedWrapperGroup.variants.length <= 1}
                        className="font-mono text-[9px]"
                      >
                        DROP_VARIANT
                      </Button>
                    </div>
                  </SidebarSection>
                )}
              </div>
            </div>
            <div className="border-y border-border px-4 py-3">
              <h4 className="terminal-header text-[10px] font-bold text-text-muted">
                {controller.selectedWrapperGroup ? 'WRAPPER_WIDGETS' : 'WIDGET_PALETTE'}
              </h4>
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
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <Badge variant={controller.selectedWrapperGroup ? 'active' : 'neutral'} className="terminal-header">
                {controller.selectedWrapperGroup ? 'WRAPPER_EDIT' : 'PAGE_EDIT'}
              </Badge>
              {controller.selectedWrapperGroup ? (
                <>
                  <Badge variant="neutral" className="terminal-header">{controller.selectedWrapperGroup.name}</Badge>
                  {controller.selectedWrapperVariant && (
                    <Badge variant="connected" className="terminal-header">{controller.selectedWrapperVariant.name}</Badge>
                  )}
                  <span className="text-text-muted">
                    BOUNDS {controller.selectedWrapperGroup.col},{controller.selectedWrapperGroup.row} / {controller.selectedWrapperGroup.colSpan}x{controller.selectedWrapperGroup.rowSpan}
                  </span>
                </>
              ) : (
                <span className="text-text-muted">
                  PAGE widgets cannot overlap wrapper-group regions.
                </span>
              )}
            </div>

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
                  blockedAreas={controller.blockedAreas}
                  placementBounds={controller.placementBounds}
                  overlayRects={controller.overlayRects}
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
                <span className="text-text-muted">
                  {controller.selectedWrapperGroup ? 'DRAG_WIDGET_TO_WRAPPER_VARIANT' : 'DRAG_WIDGET_TO_CANVAS'}
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <Button
                  onClick={controller.handleClearPage}
                  variant="ghost"
                  size="xs"
                  className="h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-foreground"
                >
                  {controller.selectedWrapperGroup ? 'CLEAR_VARIANT' : 'CLEAR_PAGE'}
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

          <div className="flex w-72 flex-shrink-0 flex-col overflow-hidden border-l border-border">
            <div className="border-b border-border px-4 py-3">
              <h4 className="terminal-header text-[10px] font-bold text-text-muted">PROPERTIES</h4>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {controller.currentPage && (
                  <PagePropertiesPanel
                    page={controller.currentPage}
                    themeBackground={(controller.layout.theme ?? DEFAULT_DASH_THEME).bg}
                    editingWrapper={Boolean(controller.selectedWrapperGroup)}
                    onBackgroundChange={controller.handlePageBackgroundChange}
                  />
                )}

                {controller.selectedWrapperGroup && controller.selectedWrapperVariant && (
                  <WrapperGroupPropertiesPanel
                    group={controller.selectedWrapperGroup}
                    selectedVariant={controller.selectedWrapperVariant}
                    gridCols={controller.layout.gridCols}
                    gridRows={controller.layout.gridRows}
                    onUpdateGroup={controller.updateSelectedWrapperGroup}
                    onDeleteGroup={controller.handleDeleteSelectedWrapperGroup}
                    onMoveVariant={controller.handleMoveSelectedVariant}
                    onUpdateVariant={controller.updateSelectedVariant}
                    onDeleteVariant={controller.handleDeleteSelectedVariant}
                  />
                )}

                <SidebarSection title="WIDGET_PROPERTIES">
                  <WidgetProperties
                    widget={controller.selectedWidget}
                    catalog={controller.catalog}
                    onUpdate={controller.updateSelectedWidget}
                  />
                </SidebarSection>
              </div>
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

function SidebarSection({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="rounded border border-border/80 bg-background/40 p-3">
      <div className="mb-3">
        <h5 className="terminal-header text-[9px] font-bold text-text-muted">{title}</h5>
        {note && (
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-text-disabled">
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function PagePropertiesPanel({
  page,
  themeBackground,
  editingWrapper,
  onBackgroundChange,
}: {
  page: DashPage
  themeBackground: RGBAColor
  editingWrapper: boolean
  onBackgroundChange: (background?: RGBAColor) => void
}) {
  return (
    <SidebarSection
      title="PAGE"
      note={editingWrapper ? 'Wrapper variants render inside the selected bounds while the page background still applies globally.' : 'Page widgets draw directly on the page grid.'}
    >
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
      </div>
    </SidebarSection>
  )
}

function WrapperGroupPropertiesPanel({
  group,
  selectedVariant,
  gridCols,
  gridRows,
  onUpdateGroup,
  onDeleteGroup,
  onMoveVariant,
  onUpdateVariant,
  onDeleteVariant,
}: {
  group: DashWrapperGroup
  selectedVariant: DashWrapperVariant
  gridCols: number
  gridRows: number
  onUpdateGroup: (patch: Partial<DashWrapperGroup>) => void
  onDeleteGroup: () => void
  onMoveVariant: (direction: -1 | 1) => void
  onUpdateVariant: (patch: { name?: string; defaultVariantId?: string }) => void
  onDeleteVariant: () => void
}) {
  const selectedVariantIndex = group.variants.findIndex(variant => variant.id === selectedVariant.id)

  return (
    <SidebarSection
      title="WRAPPER_GROUP"
      note="Bounds are page-relative. Widgets inside each variant stay relative to the wrapper origin."
    >
      <div className="space-y-3">
        <FieldRow label="GROUP_NAME">
          <input
            type="text"
            value={group.name}
            onChange={event => onUpdateGroup({ name: event.target.value })}
            className="w-full bg-background border border-border px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
          />
        </FieldRow>

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

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="terminal-header text-[9px] font-bold text-text-muted">SELECTED_VARIANT</span>
            {group.defaultVariantId === selectedVariant.id && (
              <Badge variant="neutral" className="terminal-header">DEFAULT</Badge>
            )}
          </div>

          <div className="space-y-3">
            <FieldRow label="VARIANT_NAME">
              <input
                type="text"
                value={selectedVariant.name}
                onChange={event => onUpdateVariant({ name: event.target.value })}
                className="w-full bg-background border border-border px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => onUpdateVariant({ defaultVariantId: selectedVariant.id })}
                disabled={group.defaultVariantId === selectedVariant.id}
                className="font-mono text-[9px]"
              >
                SET_DEFAULT
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={onDeleteVariant}
                disabled={group.variants.length <= 1}
                className="font-mono text-[9px]"
              >
                DELETE_VARIANT
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onMoveVariant(-1)}
                disabled={selectedVariantIndex <= 0}
                className="font-mono text-[9px]"
              >
                MOVE_UP
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onMoveVariant(1)}
                disabled={selectedVariantIndex < 0 || selectedVariantIndex >= group.variants.length - 1}
                className="font-mono text-[9px]"
              >
                MOVE_DOWN
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <Button
            variant="ghost"
            size="xs"
            onClick={onDeleteGroup}
            className="font-mono text-[9px] text-destructive hover:text-destructive"
          >
            DELETE_WRAPPER_GROUP
          </Button>
        </div>
      </div>
    </SidebarSection>
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
        className="w-full bg-background border border-border px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
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
          className="w-24 bg-background border border-border px-2 py-1.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
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
