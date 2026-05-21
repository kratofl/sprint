import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type AlertInstance,
  type AlertMeta,
  type DashLayout,
  type DashPage,
  type DashTheme,
  type DashThemeOverrides,
  type DashWidget,
  type DashWrapperGroup,
  type DomainPalette,
  type FormatPreferences,
  type RGBAColor,
  type TypographySettings,
  type WidgetCatalogEntry,
  alertCatalogAPI,
  dashAPI,
  deviceAPI,
  deviceHasScreen,
  normalizeDomainPaletteOverrides,
  normalizeThemeOverrides,
  resolveDashTheme,
  resolveDomainPalette,
  widgetCatalogAPI,
} from '@/lib/dash'
import { createDashLayerId, createDashPageId } from '@/lib/dash/ids'
import { DASH_EVENTS } from '@/lib/desktopEvents'
import { onEvent } from '@/lib/wails'
import { useNavigationGuard, useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { DEFAULT_SCREEN_H, DEFAULT_SCREEN_W } from '@/components/DashCanvas'
import {
  clampWidgetToLayerBounds,
  createClearedWrapperGroupSelectionState,
  createMultiFunctionWidgetOnDrop,
  createPageEditContext,
  createWrapperGroupEditState,
  createWrapperGroupSelectionState,
  enterMultiFunctionWidgetMode,
  isValidMultiFunctionWidgetPlacement,
  type DashEditContext,
} from './multiFunctionWidgetState'

interface UseDashEditorControllerArgs {
  initialLayout: DashLayout
  onSave: (layout: DashLayout) => Promise<void>
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}

function wrapperSelectionKey(pageID: string, groupID: string): string {
  return `${pageID}:${groupID}`
}

function withPreviewWrapperSelections(layout: DashLayout, selections: Record<string, string>): DashLayout {
  const applyPageSelections = (page: DashPage): DashPage => {
    if (!page.wrapperGroups?.length) return page

    let changed = false
    const wrapperGroups = page.wrapperGroups.map(group => {
      const selectedVariantId = selections[wrapperSelectionKey(page.id, group.id)]
      if (!selectedVariantId || selectedVariantId === group.defaultVariantId) return group
      changed = true
      return { ...group, defaultVariantId: selectedVariantId }
    })

    return changed ? { ...page, wrapperGroups } : page
  }

  return {
    ...layout,
    idlePage: applyPageSelections(layout.idlePage),
    pages: layout.pages.map(applyPageSelections),
  }
}

export function useDashEditorController({
  initialLayout,
  onSave,
  onBack,
  onDirtyChange,
}: UseDashEditorControllerArgs) {
  const [layout, setLayout] = useState<DashLayout>(initialLayout)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [editorTab, setEditorTab] = useState<'designer' | 'settings'>('designer')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<WidgetCatalogEntry[]>([])
  const [alertCatalog, setAlertCatalog] = useState<AlertMeta[]>([])
  const [widgetPreviewUrls, setWidgetPreviewUrls] = useState<Record<string, string>>({})
  const [screenW, setScreenW] = useState(DEFAULT_SCREEN_W)
  const [screenH, setScreenH] = useState(DEFAULT_SCREEN_H)
  const [paletteDropType, setPaletteDropType] = useState<string | null>(null)
  const [paletteDropPreviewUrl, setPaletteDropPreviewUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'idle' | 'alerts' | number>(0)
  const [livePageIndex, setLivePageIndex] = useState<number | null>(null)
  const [renamingDash, setRenamingDash] = useState(false)
  const [dashNameValue, setDashNameValue] = useState(initialLayout.name)
  const [confirmRemoveWidget, setConfirmRemoveWidget] = useState(false)
  const [selectedWrapperGroupId, setSelectedWrapperGroupId] = useState<string | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [wrapperVariantSelections, setWrapperVariantSelections] = useState<Record<string, string>>({})
  const [editContext, setEditContext] = useState<DashEditContext>(createPageEditContext())
  const [canvasPaneEl, setCanvasPaneEl] = useState<HTMLDivElement | null>(null)
  const [fittedCanvas, setFittedCanvas] = useState<{ w: number; h: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [globalDefaults, setGlobalDefaults] = useState<{
    theme: DashTheme
    domain: DomainPalette
    typography?: Partial<TypographySettings>
    formatPreferences?: Partial<FormatPreferences>
  }>()

  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewTargetRef = useRef<{ pageIndex: number; idle: boolean }>({ pageIndex: 0, idle: false })
  const canvasPaneRef = useCallback((element: HTMLDivElement | null) => setCanvasPaneEl(element), [])

  const { isDirty, markSaved } = useUnsavedChanges(layout, initialLayout)
  const { showDialog, guardedNavigate, confirm, cancel } = useNavigationGuard(isDirty)

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    if (!canvasPaneEl) return

    const ratio = screenW / screenH
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width / height > ratio) {
        setFittedCanvas({ w: Math.floor(height * ratio), h: Math.floor(height) })
      } else {
        setFittedCanvas({ w: Math.floor(width), h: Math.floor(width / ratio) })
      }
    })

    observer.observe(canvasPaneEl)
    return () => observer.disconnect()
  }, [canvasPaneEl, screenW, screenH])

  useEffect(() => {
    dashAPI.getGlobalSettings()
      .then(settings => setGlobalDefaults({
        theme: settings.theme,
        domain: settings.domainPalette,
        typography: settings.typography,
        formatPreferences: settings.formatPreferences,
      }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      widgetCatalogAPI.getWidgetCatalog(),
      deviceAPI.getSavedDevices(),
      alertCatalogAPI.getAlertCatalog(),
    ]).then(([widgets, devices, alerts]) => {
      setCatalog(widgets)
      setAlertCatalog(alerts)
      const screen = devices.find(device => deviceHasScreen(device.type))
      if (screen) {
        setScreenW(screen.width)
        setScreenH(screen.height)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (catalog.length === 0) return

    let cancelled = false
    Promise.all(catalog.map(async widget => {
      try {
        const png = await widgetCatalogAPI.getWidgetPreview(widget.type, widget.defaultColSpan, widget.defaultRowSpan)
        return [widget.type, png ? `data:image/png;base64,${png}` : ''] as const
      } catch {
        return [widget.type, ''] as const
      }
    })).then(entries => {
      if (cancelled) return

      const next: Record<string, string> = {}
      for (const [type, url] of entries) {
        if (url) next[type] = url
      }
      setWidgetPreviewUrls(next)
    })

    return () => {
      cancelled = true
    }
  }, [catalog])

  useEffect(() => {
    return onEvent(DASH_EVENTS.pageChanged, data => {
      setLivePageIndex(data.pageIndex)
    })
  }, [])

  useEffect(() => {
    previewTargetRef.current = {
      pageIndex: typeof activeTab === 'number' ? activeTab : 0,
      idle: activeTab === 'idle',
    }
  }, [activeTab])

  useEffect(() => {
    const idle = activeTab === 'idle'
    const pageIndex = typeof activeTab === 'number' ? activeTab : 0
    previewTargetRef.current = { pageIndex, idle }
    void dashAPI.startPreview(withPreviewWrapperSelections(layout, wrapperVariantSelections), pageIndex, idle)
    return () => { void dashAPI.stopPreview() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return onEvent(DASH_EVENTS.preview, data => {
      const target = previewTargetRef.current
      if ((data.pageIndex ?? 0) !== target.pageIndex || Boolean(data.idle) !== target.idle) {
        return
      }
      setPreviewUrl(`data:image/png;base64,${data.png}`)
    })
  }, [])

  useEffect(() => {
    const idle = activeTab === 'idle'
    const pageIndex = typeof activeTab === 'number' ? activeTab : 0
    previewTargetRef.current = { pageIndex, idle }
    setPreviewUrl(null)
    void dashAPI.updatePreview(withPreviewWrapperSelections(layout, wrapperVariantSelections), pageIndex, idle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    const idle = activeTab === 'idle'
    const pageIndex = typeof activeTab === 'number' ? activeTab : 0
    previewTargetRef.current = { pageIndex, idle }
    void dashAPI.updatePreview(withPreviewWrapperSelections(layout, wrapperVariantSelections), pageIndex, idle)
  }, [activeTab, layout, wrapperVariantSelections])

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      const { idle, pageIndex } = previewTargetRef.current
      void dashAPI.updatePreview(withPreviewWrapperSelections(layout, wrapperVariantSelections), pageIndex, idle)
    }, 150)

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [layout, wrapperVariantSelections])

  const currentPage = activeTab === 'idle'
    ? layout.idlePage
    : activeTab === 'alerts'
      ? null
      : (layout.pages[activeTab as number] ?? null)

  const wrapperGroups = currentPage?.wrapperGroups ?? []
  const selectedWrapperGroup = wrapperGroups.find(group => group.id === selectedWrapperGroupId) ?? null
  const selectedVariantKey = currentPage && selectedWrapperGroup
    ? wrapperSelectionKey(currentPage.id, selectedWrapperGroup.id)
    : null
  const activeSelectedVariantId = selectedVariantKey
    ? wrapperVariantSelections[selectedVariantKey]
      ?? selectedVariantId
      ?? selectedWrapperGroup?.defaultVariantId
      ?? selectedWrapperGroup?.variants[0]?.id
      ?? null
    : null
  const selectedWrapperVariant = selectedWrapperGroup
    ? selectedWrapperGroup.variants.find(variant => variant.id === activeSelectedVariantId)
      ?? selectedWrapperGroup.variants.find(variant => variant.id === selectedWrapperGroup.defaultVariantId)
      ?? selectedWrapperGroup.variants[0]
      ?? null
    : null
  const editingMultiFunctionWidget = editContext.kind === 'multi-function-widget'
  const editorMode: 'page' | 'mfw' = editingMultiFunctionWidget ? 'mfw' : 'page'
  const editingSelectedGroup = editingMultiFunctionWidget && selectedWrapperGroup && selectedWrapperGroup.id === editContext.groupId
  const editingSelectedVariant = editingSelectedGroup
    ? selectedWrapperGroup.variants.find(variant => variant.id === editContext.layerId)
      ?? selectedWrapperVariant
      ?? null
    : null

  const canvasWidgets = activeTab === 'alerts'
    ? []
    : editingSelectedGroup && editingSelectedVariant
      ? editingSelectedVariant.widgets.map(widget => ({
        ...widget,
        col: widget.col + selectedWrapperGroup.col,
        row: widget.row + selectedWrapperGroup.row,
      }))
      : (currentPage?.widgets ?? [])

  const selectedWidget = selectedId !== null ? (canvasWidgets[selectedId] ?? null) : null
  const resolvedTheme = resolveDashTheme(globalDefaults?.theme, layout.theme)
  const resolvedDomainPalette = resolveDomainPalette(globalDefaults?.domain, layout.domainPalette)
  const paletteWidgets = activeTab === 'idle'
    ? catalog.filter(widget => widget.idleCapable)
    : activeTab === 'alerts'
      ? []
      : catalog

  useEffect(() => {
    if (activeTab === 'alerts') {
      setSelectedWrapperGroupId(null)
      setSelectedVariantId(null)
      setEditContext(createPageEditContext())
      return
    }
    if (!selectedWrapperGroupId) return
    const group = wrapperGroups.find(candidate => candidate.id === selectedWrapperGroupId)
    if (!group) {
      setSelectedWrapperGroupId(null)
      setSelectedVariantId(null)
      setEditContext(createPageEditContext())
      return
    }
    const nextVariantId = currentPage
      ? wrapperVariantSelections[wrapperSelectionKey(currentPage.id, group.id)]
        ?? selectedVariantId
        ?? group.defaultVariantId
        ?? group.variants[0]?.id
        ?? null
      : null
    if (!group.variants.some(variant => variant.id === nextVariantId)) {
      const fallbackVariantId = group.defaultVariantId ?? group.variants[0]?.id ?? null
      setSelectedVariantId(fallbackVariantId)
      if (currentPage) {
        setWrapperVariantSelections(previous => {
          const key = wrapperSelectionKey(currentPage.id, group.id)
          if (!fallbackVariantId) {
            if (!(key in previous)) return previous
            const next = { ...previous }
            delete next[key]
            return next
          }
          return { ...previous, [key]: fallbackVariantId }
        })
      }
    }
  }, [activeTab, currentPage, selectedVariantId, selectedWrapperGroupId, wrapperGroups, wrapperVariantSelections])

  useEffect(() => {
    if (editContext.kind !== 'multi-function-widget') return
    if (!currentPage || !selectedWrapperGroup || !selectedWrapperVariant) {
      setEditContext(createPageEditContext())
      return
    }
    if (editContext.groupId !== selectedWrapperGroup.id || !selectedWrapperGroup.variants.some(variant => variant.id === editContext.layerId)) {
      const nextContext = enterMultiFunctionWidgetMode(currentPage, selectedWrapperGroup.id, wrapperVariantSelections)
      setEditContext(nextContext ?? createPageEditContext())
    }
  }, [currentPage, editContext, selectedWrapperGroup, selectedWrapperVariant, wrapperVariantSelections])

  const clearWrapperVariantSelections = useCallback(() => {
    setWrapperVariantSelections({})
  }, [])

  const updateWrapperVariantSelection = useCallback((pageID: string, groupID: string, variantID: string | null) => {
    setWrapperVariantSelections(previous => {
      const key = wrapperSelectionKey(pageID, groupID)
      if (!variantID) {
        if (!(key in previous)) return previous
        const next = { ...previous }
        delete next[key]
        return next
      }
      if (previous[key] === variantID) return previous
      return { ...previous, [key]: variantID }
    })
  }, [])

  const updateCurrentPage = useCallback((updater: (page: DashPage) => DashPage) => {
    if (activeTab === 'alerts') return
    if (activeTab === 'idle') {
      setLayout(previous => ({ ...previous, idlePage: updater(previous.idlePage) }))
      return
    }
    setLayout(previous => ({
      ...previous,
      pages: previous.pages.map((page, index) => index === activeTab ? updater(page) : page),
    }))
  }, [activeTab])

  const handleUpdate = useCallback((widgets: DashWidget[]) => {
    if (editingSelectedGroup && editingSelectedVariant) {
      updateCurrentPage(page => ({
        ...page,
        wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
          ? {
            ...group,
            variants: group.variants.map(variant => variant.id === editingSelectedVariant.id
              ? {
                ...variant,
                widgets: widgets.map(widget => ({
                  ...clampWidgetToLayerBounds({
                    ...widget,
                    col: widget.col - group.col,
                    row: widget.row - group.row,
                  }, group),
                })),
              }
              : variant),
          }
          : group),
      }))
      return
    }

    updateCurrentPage(page => ({ ...page, widgets }))
  }, [editingSelectedGroup, editingSelectedVariant, selectedWrapperGroup, updateCurrentPage])

  const selectCanvasTab = useCallback((tab: 'idle' | 'alerts' | number) => {
    setActiveTab(tab)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    clearWrapperVariantSelections()
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [clearWrapperVariantSelections])

  const handleAddPage = useCallback(() => {
    const name = `Page ${layout.pages.length + 1}`
    const newPage: DashPage = { id: createDashPageId(), name, widgets: [], wrapperGroups: [] }
    setLayout(previous => ({ ...previous, pages: [...previous.pages, newPage] }))
    setActiveTab(layout.pages.length)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    clearWrapperVariantSelections()
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [clearWrapperVariantSelections, layout.pages.length])

  const handleDeletePage = useCallback((index: number) => {
    if (layout.pages.length <= 1) return

    setLayout(previous => ({ ...previous, pages: previous.pages.filter((_, pageIndex) => pageIndex !== index) }))
    setActiveTab(previous => typeof previous === 'number' && previous >= index ? Math.max(0, previous - 1) : previous)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    clearWrapperVariantSelections()
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [clearWrapperVariantSelections, layout.pages.length])

  const handleRenamePage = useCallback((index: number, name: string) => {
    setLayout(previous => ({
      ...previous,
      pages: previous.pages.map((page, pageIndex) => pageIndex === index ? { ...page, name } : page),
    }))
  }, [])

  const handleClearPage = useCallback(() => {
    if (editingSelectedGroup && editingSelectedVariant) {
      updateCurrentPage(page => ({
        ...page,
        wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
          ? {
            ...group,
            variants: group.variants.map(variant => variant.id === editingSelectedVariant.id ? { ...variant, widgets: [] } : variant),
          }
          : group),
      }))
    } else {
      updateCurrentPage(page => ({ ...page, widgets: [] }))
    }
    setSelectedId(null)
  }, [editingSelectedGroup, editingSelectedVariant, selectedWrapperGroup, updateCurrentPage])

  const handleSettingsChange = useCallback((theme: DashThemeOverrides, domain: Partial<DomainPalette>) => {
    setLayout(previous => ({
      ...previous,
      theme: normalizeThemeOverrides(theme),
      domainPalette: normalizeDomainPaletteOverrides(domain),
    }))
  }, [])

  const handleFormatPreferencesChange = useCallback((prefs: Partial<FormatPreferences>) => {
    setLayout(previous => ({
      ...previous,
      formatPreferences: Object.keys(prefs).length === 0 ? undefined : prefs,
    }))
  }, [])

  const handleTypographyChange = useCallback((typography: Partial<TypographySettings>) => {
    setLayout(previous => ({
      ...previous,
      typography: Object.keys(typography).length === 0 ? undefined : typography,
    }))
  }, [])

  const handleAlertsChange = useCallback((instances: AlertInstance[]) => {
    setLayout(previous => ({ ...previous, alerts: instances }))
  }, [])

  const doRemoveSelectedWidget = useCallback(() => {
    if (selectedId === null) return
    if (editingSelectedGroup && editingSelectedVariant) {
      updateCurrentPage(page => ({
        ...page,
        wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
          ? {
            ...group,
            variants: group.variants.map(variant => variant.id === editingSelectedVariant.id
              ? { ...variant, widgets: variant.widgets.filter((_, index) => index !== selectedId) }
              : variant),
          }
          : group),
      }))
    } else {
      updateCurrentPage(page => ({ ...page, widgets: page.widgets.filter((_, index) => index !== selectedId) }))
    }

    setSelectedId(null)
  }, [editingSelectedGroup, editingSelectedVariant, selectedId, selectedWrapperGroup, updateCurrentPage])

  const updateSelectedWidget = useCallback((updated: DashWidget) => {
    if (selectedId === null) return
    handleUpdate(canvasWidgets.map((widget, index) => index === selectedId ? updated : widget))
  }, [canvasWidgets, handleUpdate, selectedId])

  const exitMultiFunctionWidgetEditMode = useCallback(() => {
    const nextState = createClearedWrapperGroupSelectionState()
    setSelectedWrapperGroupId(nextState.selectedWrapperGroupId)
    setSelectedVariantId(nextState.selectedVariantId)
    setEditContext(nextState.editContext)
    setSelectedId(null)
  }, [])

  const enterSelectedWrapperGroup = useCallback((groupId?: string | null) => {
    if (!currentPage) return
    const targetGroupId = groupId ?? selectedWrapperGroupId
    if (!targetGroupId) return
    const nextState = createWrapperGroupEditState(currentPage, targetGroupId, wrapperVariantSelections)
    if (!nextState) return
    setSelectedWrapperGroupId(nextState.selectedWrapperGroupId)
    setSelectedVariantId(nextState.selectedVariantId)
    setEditContext(nextState.editContext)
    setSelectedId(null)
  }, [currentPage, selectedWrapperGroupId, wrapperVariantSelections])

  const selectWrapperGroup = useCallback((groupId: string | null) => {
    if (!groupId) {
      if (editContext.kind !== 'multi-function-widget') {
        const clearedState = createClearedWrapperGroupSelectionState()
        setSelectedWrapperGroupId(clearedState.selectedWrapperGroupId)
        setSelectedVariantId(clearedState.selectedVariantId)
      }
      setSelectedId(null)
      return
    }
    if (!currentPage) return
    const nextState = createWrapperGroupSelectionState(currentPage, groupId, wrapperVariantSelections)
    if (!nextState) return
    setSelectedWrapperGroupId(nextState.selectedWrapperGroupId)
    setSelectedVariantId(nextState.selectedVariantId)
    if (editContext.kind !== 'multi-function-widget' || editContext.groupId !== groupId) {
      setEditContext(nextState.editContext)
    }
    setSelectedId(null)
  }, [currentPage, editContext, wrapperVariantSelections])

  const handleAddWrapperGroup = useCallback(() => {
    if (!currentPage) return
    const created = createMultiFunctionWidgetOnDrop({
      page: currentPage,
      drop: { col: 0, row: 0 },
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
    })
    const nextGroups = created.page.wrapperGroups ?? []
    const nextGroup = nextGroups[nextGroups.length - 1]
    if (!nextGroup || !isValidMultiFunctionWidgetPlacement(nextGroup, currentPage, layout.gridCols, layout.gridRows)) {
      return
    }
    updateCurrentPage(() => created.page)
    updateWrapperVariantSelection(currentPage.id, created.context.groupId, created.context.layerId)
    setSelectedWrapperGroupId(created.context.groupId)
    setSelectedVariantId(created.context.layerId)
    setEditContext(created.context)
    setSelectedId(null)
  }, [currentPage, layout.gridCols, layout.gridRows, updateCurrentPage, updateWrapperVariantSelection])

  const updateSelectedWrapperGroup = useCallback((patch: Partial<DashWrapperGroup>) => {
    if (!selectedWrapperGroup || !currentPage) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => {
        if (group.id !== selectedWrapperGroup.id) return group
        const next = { ...group, ...patch }
        next.colSpan = Math.max(1, Math.min(next.colSpan, layout.gridCols))
        next.rowSpan = Math.max(1, Math.min(next.rowSpan, layout.gridRows))
        next.col = Math.max(0, Math.min(next.col, layout.gridCols - next.colSpan))
        next.row = Math.max(0, Math.min(next.row, layout.gridRows - next.rowSpan))
        if (!isValidMultiFunctionWidgetPlacement(next, page, layout.gridCols, layout.gridRows, group.id)) {
          return group
        }
        return {
          ...next,
          variants: next.variants.map(variant => ({
            ...variant,
            widgets: variant.widgets.map(widget => clampWidgetToLayerBounds(widget, next)),
          })),
        }
      }),
    }))
  }, [currentPage, layout.gridCols, layout.gridRows, selectedWrapperGroup, updateCurrentPage])

  const handleDeleteSelectedWrapperGroup = useCallback(() => {
    if (!selectedWrapperGroup || !currentPage) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).filter(group => group.id !== selectedWrapperGroup.id),
    }))
    updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, null)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [currentPage, selectedWrapperGroup, updateCurrentPage, updateWrapperVariantSelection])

  const handleSelectWrapperVariant = useCallback((variantId: string) => {
    if (currentPage && selectedWrapperGroup) {
      updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, variantId)
    }
    setSelectedVariantId(variantId)
    if (editContext.kind === 'multi-function-widget' && selectedWrapperGroup) {
      setEditContext({
        kind: 'multi-function-widget',
        groupId: selectedWrapperGroup.id,
        layerId: variantId,
      })
    }
    setSelectedId(null)
  }, [currentPage, editContext.kind, selectedWrapperGroup, updateWrapperVariantSelection])

  const handleAddWrapperVariant = useCallback(() => {
    if (!selectedWrapperGroup || !currentPage) return
    const nextVariant = { id: createDashLayerId(), name: `Layer ${selectedWrapperGroup.variants.length + 1}`, widgets: [] }
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
        ? {
          ...group,
          variants: [...group.variants, nextVariant],
          defaultVariantId: group.defaultVariantId ?? nextVariant.id,
        }
        : group),
    }))
    updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, nextVariant.id)
    setSelectedVariantId(nextVariant.id)
    if (editContext.kind === 'multi-function-widget') {
      setEditContext({
        kind: 'multi-function-widget',
        groupId: selectedWrapperGroup.id,
        layerId: nextVariant.id,
      })
    }
    setSelectedId(null)
  }, [currentPage, editContext.kind, selectedWrapperGroup, updateCurrentPage, updateWrapperVariantSelection])

  const handleDeleteWrapperVariant = useCallback((variantId: string) => {
    if (!selectedWrapperGroup || !currentPage || selectedWrapperGroup.variants.length <= 1) return
    const targetVariant = selectedWrapperGroup.variants.find(variant => variant.id === variantId)
    if (!targetVariant) return
    const nextVariantId = selectedWrapperGroup.variants.find(variant => variant.id !== variantId)?.id ?? null
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => {
        if (group.id !== selectedWrapperGroup.id) return group
        const variants = group.variants.filter(variant => variant.id !== variantId)
        return {
          ...group,
          variants,
          defaultVariantId: group.defaultVariantId === variantId ? variants[0]?.id : group.defaultVariantId,
        }
      }),
    }))
    updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, nextVariantId)
    const deletedSelectedVariant = selectedWrapperVariant?.id === variantId
    if (deletedSelectedVariant) {
      setSelectedVariantId(nextVariantId)
    }
    if (nextVariantId && editContext.kind === 'multi-function-widget' && deletedSelectedVariant) {
      setEditContext({
        kind: 'multi-function-widget',
        groupId: selectedWrapperGroup.id,
        layerId: nextVariantId,
      })
    } else if (deletedSelectedVariant) {
      setEditContext(createPageEditContext())
    }
    if (deletedSelectedVariant) {
      setSelectedId(null)
    }
  }, [currentPage, editContext.kind, selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage, updateWrapperVariantSelection])

  const handleDeleteSelectedVariant = useCallback(() => {
    if (!selectedWrapperVariant) return
    handleDeleteWrapperVariant(selectedWrapperVariant.id)
  }, [handleDeleteWrapperVariant, selectedWrapperVariant])

  const handleMoveWrapperVariant = useCallback((variantId: string, direction: -1 | 1) => {
    if (!selectedWrapperGroup) return
    const currentIndex = selectedWrapperGroup.variants.findIndex(variant => variant.id === variantId)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selectedWrapperGroup.variants.length) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => {
        if (group.id !== selectedWrapperGroup.id) return group
        const variants = [...group.variants]
        const [variant] = variants.splice(currentIndex, 1)
        variants.splice(nextIndex, 0, variant)
        return { ...group, variants }
      }),
    }))
  }, [selectedWrapperGroup, updateCurrentPage])

  const handleMoveSelectedVariant = useCallback((direction: -1 | 1) => {
    if (!selectedWrapperVariant) return
    handleMoveWrapperVariant(selectedWrapperVariant.id, direction)
  }, [handleMoveWrapperVariant, selectedWrapperVariant])

  const handleSetDefaultWrapperVariant = useCallback((variantId: string) => {
    if (!selectedWrapperGroup) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
        ? { ...group, defaultVariantId: variantId }
        : group),
    }))
  }, [selectedWrapperGroup, updateCurrentPage])

  const updateSelectedVariant = useCallback((patch: { name?: string; defaultVariantId?: string }) => {
    if (!selectedWrapperGroup || !selectedWrapperVariant) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
        ? {
          ...group,
          defaultVariantId: patch.defaultVariantId ?? group.defaultVariantId,
          variants: group.variants.map(variant => variant.id === selectedWrapperVariant.id ? { ...variant, ...(patch.name !== undefined ? { name: patch.name } : {}) } : variant),
        }
        : group),
    }))
  }, [selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage])

  const handlePageBackgroundChange = useCallback((background?: RGBAColor) => {
    updateCurrentPage(page => ({ ...page, background }))
  }, [updateCurrentPage])

  const handleCanvasSelectWidget = useCallback((id: number | null) => {
    setSelectedId(id)
    if (id !== null && !editingMultiFunctionWidget) {
      setSelectedWrapperGroupId(null)
      setSelectedVariantId(null)
    }
  }, [editingMultiFunctionWidget])

  const handleCanvasBackgroundClick = useCallback(() => {
    if (editingMultiFunctionWidget) {
      exitMultiFunctionWidgetEditMode()
      setSelectedId(null)
      return
    }
    const clearedState = createClearedWrapperGroupSelectionState()
    setSelectedId(null)
    setSelectedWrapperGroupId(clearedState.selectedWrapperGroupId)
    setSelectedVariantId(clearedState.selectedVariantId)
  }, [editingMultiFunctionWidget, exitMultiFunctionWidgetEditMode])

  const handleCanvasSelectWrapperGroup = useCallback((groupId: string | null) => {
    if (!groupId) {
      selectWrapperGroup(null)
      return
    }
    selectWrapperGroup(groupId)
  }, [selectWrapperGroup])

  const handleCanvasEnterWrapperGroup = useCallback((groupId: string) => {
    enterSelectedWrapperGroup(groupId)
  }, [enterSelectedWrapperGroup])

  const handleCanvasUpdateWrapperGroup = useCallback((groupId: string, rect: { col: number; row: number; colSpan: number; rowSpan: number }) => {
    setSelectedWrapperGroupId(groupId)
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => {
        if (group.id !== groupId) return group
        const next = {
          ...group,
          col: Math.max(0, Math.min(rect.col, layout.gridCols - rect.colSpan)),
          row: Math.max(0, Math.min(rect.row, layout.gridRows - rect.rowSpan)),
          colSpan: Math.max(1, Math.min(rect.colSpan, layout.gridCols)),
          rowSpan: Math.max(1, Math.min(rect.rowSpan, layout.gridRows)),
        }
        if (!isValidMultiFunctionWidgetPlacement(next, page, layout.gridCols, layout.gridRows, groupId)) {
          return group
        }
        return {
          ...next,
          variants: next.variants.map(variant => ({
            ...variant,
            widgets: variant.widgets.map(widget => clampWidgetToLayerBounds(widget, next)),
          })),
        }
      }),
    }))
  }, [layout.gridCols, layout.gridRows, updateCurrentPage])

  const handleCanvasCreateMultiFunctionWidget = useCallback((rect: { col: number; row: number; colSpan: number; rowSpan: number }) => {
    if (!currentPage || editingMultiFunctionWidget) return
    const created = createMultiFunctionWidgetOnDrop({
      page: currentPage,
      drop: { col: rect.col, row: rect.row },
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
    })
    const nextGroups = created.page.wrapperGroups ?? []
    const nextGroup = nextGroups[nextGroups.length - 1]
    if (!nextGroup || !isValidMultiFunctionWidgetPlacement(nextGroup, currentPage, layout.gridCols, layout.gridRows)) {
      return
    }
    updateCurrentPage(() => created.page)
    updateWrapperVariantSelection(currentPage.id, created.context.groupId, created.context.layerId)
    setSelectedWrapperGroupId(created.context.groupId)
    setSelectedVariantId(created.context.layerId)
    setEditContext(created.context)
    setSelectedId(null)
  }, [currentPage, editingMultiFunctionWidget, layout.gridCols, layout.gridRows, updateCurrentPage, updateWrapperVariantSelection])

  const blockedAreas = editingMultiFunctionWidget
    ? []
    : wrapperGroups.map(group => ({ col: group.col, row: group.row, colSpan: group.colSpan, rowSpan: group.rowSpan }))

  const placementBounds = editingSelectedGroup
    ? { col: selectedWrapperGroup.col, row: selectedWrapperGroup.row, colSpan: selectedWrapperGroup.colSpan, rowSpan: selectedWrapperGroup.rowSpan }
    : null

  const overlayRects = wrapperGroups.map(group => ({
    id: group.id,
    col: group.col,
    row: group.row,
    colSpan: group.colSpan,
    rowSpan: group.rowSpan,
    label: group.name,
    selected: group.id === selectedWrapperGroupId,
    locked: editingMultiFunctionWidget && group.id !== selectedWrapperGroupId,
    editing: editingMultiFunctionWidget && group.id === selectedWrapperGroupId,
  }))

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId !== null) {
          setConfirmRemoveWidget(true)
          return
        }
        if (selectedWrapperGroup) {
          handleDeleteSelectedWrapperGroup()
        }
        return
      }

      if (event.key === 'Enter' && selectedWrapperGroup && !editingMultiFunctionWidget) {
        enterSelectedWrapperGroup(selectedWrapperGroup.id)
        return
      }

      if (event.key === 'Escape' && editingMultiFunctionWidget) {
        exitMultiFunctionWidgetEditMode()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    editingMultiFunctionWidget,
    enterSelectedWrapperGroup,
    exitMultiFunctionWidgetEditMode,
    handleDeleteSelectedWrapperGroup,
    selectedId,
    selectedWrapperGroup,
  ])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(layout)
      markSaved(layout)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }, [layout, markSaved, onSave])

  const handleBack = useCallback(() => guardedNavigate(onBack), [guardedNavigate, onBack])

  const commitDashName = useCallback((name: string) => {
    const nextName = name.trim() || layout.name
    setLayout(previous => ({ ...previous, name: nextName }))
    setDashNameValue(nextName)
    setRenamingDash(false)
  }, [layout.name])

  return {
    activeTab,
    alertCatalog,
    canvasPaneRef,
    canvasWidgets,
    catalog,
    confirm,
    confirmRemoveWidget,
    dashNameValue,
    doRemoveSelectedWidget,
    editorMode,
    editingMultiFunctionWidget,
    editorTab,
    enterSelectedWrapperGroup,
    exitMultiFunctionWidgetEditMode,
    fittedCanvas,
    globalDefaults,
    handleAddPage,
    handleAlertsChange,
    handleBack,
    handleClearPage,
    handleDeletePage,
    handleFormatPreferencesChange,
    handleRenamePage,
    handleSave,
    handleSettingsChange,
    handleTypographyChange,
    handleUpdate,
    isDirty,
    layout,
    livePageIndex,
    paletteDropPreviewUrl,
    paletteDropType,
    paletteWidgets,
    blockedAreas,
    currentPage,
    resolvedDomainPalette,
    resolvedTheme,
    handleAddWrapperGroup,
    handleDeleteSelectedVariant,
    handleDeleteWrapperVariant,
    handleDeleteSelectedWrapperGroup,
    handleMoveWrapperVariant,
    handleMoveSelectedVariant,
    handlePageBackgroundChange,
    handleSetDefaultWrapperVariant,
    handleCanvasBackgroundClick,
    handleCanvasCreateMultiFunctionWidget,
    handleCanvasEnterWrapperGroup,
    handleCanvasSelectWidget,
    handleCanvasSelectWrapperGroup,
    handleCanvasUpdateWrapperGroup,
    handleSelectWrapperVariant,
    handleAddWrapperVariant,
    previewUrl,
    overlayRects,
    placementBounds,
    renamingDash,
    saveStatus,
    saving,
    selectedId,
    selectedVariantId: selectedWrapperVariant?.id ?? null,
    selectedWrapperGroup,
    selectedWrapperGroupId,
    selectedWrapperVariant,
    selectedWidget,
    setConfirmRemoveWidget,
    setDashNameValue,
    setEditorTab,
    setPaletteDropPreviewUrl,
    setPaletteDropType,
    setRenamingDash,
    setSelectedId,
    showDialog,
    selectWrapperGroup,
    wrapperGroups,
    widgetPreviewUrls,
    updateSelectedVariant,
    updateSelectedWrapperGroup,
    screenH,
    screenW,
    selectCanvasTab,
    updateSelectedWidget,
    cancel,
    commitDashName,
  }
}
