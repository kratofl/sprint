import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AlertInstance,
  type AlertMeta,
  type DashLayout,
  type DashPage,
  type DashTheme,
  type DashThemeOverrides,
  type DashWidget,
  type DashWidgetStack,
  type DashWidgetStackLayer,
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
import { createDashLayerId, createDashPageId, createDashWidgetId } from '@/lib/dash/ids'
import { DASH_EVENTS } from '@/lib/desktopEvents'
import { onEvent } from '@/lib/wails'
import { useNavigationGuard, useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { DEFAULT_SCREEN_H, DEFAULT_SCREEN_W } from '@/components/DashCanvas'
import {
  clampWidgetToLayerBounds,
  createClearedWidgetStackSelectionState,
  createWidgetStackOnDrop,
  createPageEditContext,
  createWidgetStackEditState,
  createWidgetStackSelectionState,
  enterWidgetStackMode,
  isValidWidgetStackPlacement,
  type DashEditContext,
} from './multiFunctionWidgetState'

interface UseDashEditorControllerArgs {
  initialLayout: DashLayout
  onSave: (layout: DashLayout) => Promise<void>
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}

function widgetStackSelectionKey(pageID: string, groupID: string): string {
  return `${pageID}:${groupID}`
}

function withPreviewWidgetStackSelections(layout: DashLayout, selections: Record<string, string>): DashLayout {
  const applyPageSelections = (page: DashPage): DashPage => {
    if (!page.widgetStacks?.length) return page

    let changed = false
    const widgetStacks = page.widgetStacks.map(group => {
      const selectedLayerId = selections[widgetStackSelectionKey(page.id, group.id)]
      if (!selectedLayerId || selectedLayerId === group.defaultLayerId) return group
      changed = true
      return { ...group, defaultLayerId: selectedLayerId }
    })

    return changed ? { ...page, widgetStacks } : page
  }

  return {
    ...layout,
    idlePage: applyPageSelections(layout.idlePage),
    pages: layout.pages.map(applyPageSelections),
  }
}

function createWidgetStackPreviewLayout(
  layout: DashLayout,
  page: DashPage,
  stack: DashWidgetStack,
  layer: DashWidgetStackLayer,
): DashLayout {
  const previewPage: DashPage = {
    id: `${page.id}:${stack.id}:${layer.id}:focus-preview`,
    name: `${stack.name} / ${layer.name}`,
    background: page.background,
    widgets: layer.widgets,
    widgetStacks: [],
  }

  return {
    ...layout,
    gridCols: stack.colSpan,
    gridRows: stack.rowSpan,
    idlePage: previewPage,
    pages: [previewPage],
    alerts: [],
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
  const [selectedWidgetStackId, setSelectedWidgetStackId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [widgetStackLayerSelections, setWidgetStackLayerSelections] = useState<Record<string, string>>({})
  const [editContext, setEditContext] = useState<DashEditContext>(createPageEditContext())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [referenceLayerId, setReferenceLayerId] = useState<string | null>(null)
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
    widgetCatalogAPI.getWidgetCatalog()
      .then(widgets => setCatalog(widgets))
      .catch(() => {})

    deviceAPI.getSavedDevices()
      .then(devices => {
      const screen = devices.find(device => deviceHasScreen(device.type))
      if (screen) {
        setScreenW(screen.width)
        setScreenH(screen.height)
      }
    })
      .catch(() => {})

    alertCatalogAPI.getAlertCatalog()
      .then(alerts => setAlertCatalog(alerts))
      .catch(() => {})
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

  const currentPage = activeTab === 'idle'
    ? layout.idlePage
    : activeTab === 'alerts'
      ? null
      : (layout.pages[activeTab as number] ?? null)

  const widgetStacks = currentPage?.widgetStacks ?? []
  const selectedWidgetStack = widgetStacks.find(group => group.id === selectedWidgetStackId) ?? null
  const selectedLayerKey = currentPage && selectedWidgetStack
    ? widgetStackSelectionKey(currentPage.id, selectedWidgetStack.id)
    : null
  const activeSelectedLayerId = selectedLayerKey
    ? widgetStackLayerSelections[selectedLayerKey]
      ?? selectedLayerId
      ?? selectedWidgetStack?.defaultLayerId
      ?? selectedWidgetStack?.layers[0]?.id
      ?? null
    : null
  const selectedLayer = selectedWidgetStack
    ? selectedWidgetStack.layers.find(layer => layer.id === activeSelectedLayerId)
      ?? selectedWidgetStack.layers.find(layer => layer.id === selectedWidgetStack.defaultLayerId)
      ?? selectedWidgetStack.layers[0]
      ?? null
    : null
  const editingWidgetStack = editContext.kind === 'widget-stack'
  const editorMode: 'page' | 'stack' = editingWidgetStack ? 'stack' : 'page'
  const editingSelectedWidgetStack = editingWidgetStack && selectedWidgetStack && selectedWidgetStack.id === editContext.groupId
  const editingSelectedLayer = editingSelectedWidgetStack
    ? selectedWidgetStack.layers.find(layer => layer.id === editContext.layerId)
      ?? selectedLayer
      ?? null
    : null

  const previewBaseLayout = useMemo(
    () => withPreviewWidgetStackSelections(layout, widgetStackLayerSelections),
    [layout, widgetStackLayerSelections],
  )

  const previewSession = useMemo(() => {
    if (editingSelectedWidgetStack && editingSelectedLayer && currentPage && selectedWidgetStack) {
      return {
        layout: createWidgetStackPreviewLayout(layout, currentPage, selectedWidgetStack, editingSelectedLayer),
        pageIndex: 0,
        idle: false,
      }
    }

    return {
      layout: previewBaseLayout,
      pageIndex: typeof activeTab === 'number' ? activeTab : 0,
      idle: activeTab === 'idle',
    }
  }, [
    activeTab,
    currentPage,
    editingSelectedLayer,
    editingSelectedWidgetStack,
    layout,
    previewBaseLayout,
    selectedWidgetStack,
  ])

  useEffect(() => {
    previewTargetRef.current = {
      pageIndex: previewSession.pageIndex,
      idle: previewSession.idle,
    }
  }, [previewSession.idle, previewSession.pageIndex])

  useEffect(() => {
    previewTargetRef.current = {
      pageIndex: previewSession.pageIndex,
      idle: previewSession.idle,
    }
    void dashAPI.startPreview(previewSession.layout, previewSession.pageIndex, previewSession.idle)
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
    previewTargetRef.current = {
      pageIndex: previewSession.pageIndex,
      idle: previewSession.idle,
    }
    setPreviewUrl(null)
    void dashAPI.updatePreview(previewSession.layout, previewSession.pageIndex, previewSession.idle)
  }, [previewSession])

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      void dashAPI.updatePreview(previewSession.layout, previewSession.pageIndex, previewSession.idle)
    }, 150)

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [previewSession])

  const canvasWidgets = activeTab === 'alerts'
    ? []
    : editingSelectedWidgetStack && editingSelectedLayer
      ? editingSelectedLayer.widgets
      : (currentPage?.widgets ?? [])
  const referenceLayer = compareEnabled && selectedWidgetStack && selectedLayer
    ? selectedWidgetStack.layers.find(layer => layer.id === referenceLayerId && layer.id !== selectedLayer.id)
      ?? selectedWidgetStack.layers.find(layer => layer.id !== selectedLayer.id)
      ?? null
    : null

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
      if (selectedWidgetStackId !== null) setSelectedWidgetStackId(null)
      if (selectedLayerId !== null) setSelectedLayerId(null)
      if (editContext.kind !== 'page') {
        setEditContext(createPageEditContext())
      }
      return
    }
    if (!selectedWidgetStackId) return
    const widgetStack = widgetStacks.find(candidate => candidate.id === selectedWidgetStackId)
    if (!widgetStack) {
      setSelectedWidgetStackId(null)
      setSelectedLayerId(null)
      setEditContext(createPageEditContext())
      return
    }
    const nextLayerId = currentPage
      ? widgetStackLayerSelections[widgetStackSelectionKey(currentPage.id, widgetStack.id)]
        ?? selectedLayerId
        ?? widgetStack.defaultLayerId
        ?? widgetStack.layers[0]?.id
        ?? null
      : null
    if (!widgetStack.layers.some(layer => layer.id === nextLayerId)) {
      const fallbackLayerId = widgetStack.defaultLayerId ?? widgetStack.layers[0]?.id ?? null
      setSelectedLayerId(fallbackLayerId)
      if (currentPage) {
        setWidgetStackLayerSelections(previous => {
          const key = widgetStackSelectionKey(currentPage.id, widgetStack.id)
          if (!fallbackLayerId) {
            if (!(key in previous)) return previous
            const next = { ...previous }
            delete next[key]
            return next
          }
          return { ...previous, [key]: fallbackLayerId }
        })
      }
    }
  }, [activeTab, currentPage, editContext.kind, selectedLayerId, selectedWidgetStackId, widgetStacks, widgetStackLayerSelections])

  useEffect(() => {
    if (editContext.kind !== 'widget-stack') return
    if (!currentPage || !selectedWidgetStack || !selectedLayer) {
      setEditContext(createPageEditContext())
      return
    }
    if (editContext.groupId !== selectedWidgetStack.id || !selectedWidgetStack.layers.some(layer => layer.id === editContext.layerId)) {
      const nextContext = enterWidgetStackMode(currentPage, selectedWidgetStack.id, widgetStackLayerSelections)
      setEditContext(nextContext ?? createPageEditContext())
    }
  }, [currentPage, editContext, selectedWidgetStack, selectedLayer, widgetStackLayerSelections])

  useEffect(() => {
    if (!editingWidgetStack || !selectedWidgetStack || !selectedLayer) {
      setCompareEnabled(false)
      setReferenceLayerId(null)
      return
    }
    const candidateLayers = selectedWidgetStack.layers.filter(layer => layer.id !== selectedLayer.id)
    if (candidateLayers.length === 0) {
      setCompareEnabled(false)
      setReferenceLayerId(null)
      return
    }
    if (!compareEnabled) {
      if (referenceLayerId && !candidateLayers.some(layer => layer.id === referenceLayerId)) {
        setReferenceLayerId(null)
      }
      return
    }
    if (!referenceLayerId || !candidateLayers.some(layer => layer.id === referenceLayerId)) {
      setReferenceLayerId(candidateLayers[0].id)
    }
  }, [compareEnabled, editingWidgetStack, referenceLayerId, selectedLayer, selectedWidgetStack])

  const clearWidgetStackLayerSelections = useCallback(() => {
    setWidgetStackLayerSelections({})
  }, [])

  const updateWidgetStackLayerSelection = useCallback((pageID: string, groupID: string, layerID: string | null) => {
    setWidgetStackLayerSelections(previous => {
      const key = widgetStackSelectionKey(pageID, groupID)
      if (!layerID) {
        if (!(key in previous)) return previous
        const next = { ...previous }
        delete next[key]
        return next
      }
      if (previous[key] === layerID) return previous
      return { ...previous, [key]: layerID }
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
    if (editingSelectedWidgetStack && editingSelectedLayer) {
      updateCurrentPage(page => ({
        ...page,
        widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
          ? {
            ...group,
            layers: group.layers.map(layer => layer.id === editingSelectedLayer.id
              ? {
                ...layer,
                widgets: widgets.map(widget => clampWidgetToLayerBounds(widget, group)),
              }
              : layer),
          }
          : group),
      }))
      return
    }

    updateCurrentPage(page => ({ ...page, widgets }))
  }, [editingSelectedWidgetStack, editingSelectedLayer, selectedWidgetStack, updateCurrentPage])

  const selectCanvasTab = useCallback((tab: 'idle' | 'alerts' | number) => {
    setActiveTab(tab)
    setSelectedWidgetStackId(null)
    setSelectedLayerId(null)
    clearWidgetStackLayerSelections()
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [clearWidgetStackLayerSelections])

  const handleAddPage = useCallback(() => {
    const name = `Page ${layout.pages.length + 1}`
    const newPage: DashPage = { id: createDashPageId(), name, widgets: [], widgetStacks: [] }
    setLayout(previous => ({ ...previous, pages: [...previous.pages, newPage] }))
    setActiveTab(layout.pages.length)
    setSelectedWidgetStackId(null)
    setSelectedLayerId(null)
    clearWidgetStackLayerSelections()
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [clearWidgetStackLayerSelections, layout.pages.length])

  const handleDeletePage = useCallback((index: number) => {
    if (layout.pages.length <= 1) return

    setLayout(previous => ({ ...previous, pages: previous.pages.filter((_, pageIndex) => pageIndex !== index) }))
    setActiveTab(previous => typeof previous === 'number' && previous >= index ? Math.max(0, previous - 1) : previous)
    setSelectedWidgetStackId(null)
    setSelectedLayerId(null)
    clearWidgetStackLayerSelections()
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [clearWidgetStackLayerSelections, layout.pages.length])

  const handleRenamePage = useCallback((index: number, name: string) => {
    setLayout(previous => ({
      ...previous,
      pages: previous.pages.map((page, pageIndex) => pageIndex === index ? { ...page, name } : page),
    }))
  }, [])

  const handleClearPage = useCallback(() => {
    if (editingSelectedWidgetStack && editingSelectedLayer) {
      updateCurrentPage(page => ({
        ...page,
        widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
          ? {
            ...group,
            layers: group.layers.map(layer => layer.id === editingSelectedLayer.id ? { ...layer, widgets: [] } : layer),
          }
          : group),
      }))
    } else {
      updateCurrentPage(page => ({ ...page, widgets: [] }))
    }
    setSelectedId(null)
  }, [editingSelectedWidgetStack, editingSelectedLayer, selectedWidgetStack, updateCurrentPage])

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
    if (editingSelectedWidgetStack && editingSelectedLayer) {
      updateCurrentPage(page => ({
        ...page,
        widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
          ? {
            ...group,
            layers: group.layers.map(layer => layer.id === editingSelectedLayer.id
              ? { ...layer, widgets: layer.widgets.filter((_, index) => index !== selectedId) }
              : layer),
          }
          : group),
      }))
    } else {
      updateCurrentPage(page => ({ ...page, widgets: page.widgets.filter((_, index) => index !== selectedId) }))
    }

    setSelectedId(null)
  }, [editingSelectedWidgetStack, editingSelectedLayer, selectedId, selectedWidgetStack, updateCurrentPage])

  const updateSelectedWidget = useCallback((updated: DashWidget) => {
    if (selectedId === null) return
    handleUpdate(canvasWidgets.map((widget, index) => index === selectedId ? updated : widget))
  }, [canvasWidgets, handleUpdate, selectedId])

  const exitWidgetStackEditMode = useCallback(() => {
    if (!currentPage || !selectedWidgetStack) {
      const nextState = createClearedWidgetStackSelectionState()
      setSelectedWidgetStackId(nextState.selectedWidgetStackId)
      setSelectedLayerId(nextState.selectedLayerId)
      setEditContext(nextState.editContext)
      setSelectedId(null)
      return
    }
    const nextState = createWidgetStackSelectionState(currentPage, selectedWidgetStack.id, widgetStackLayerSelections)
    setSelectedWidgetStackId(nextState?.selectedWidgetStackId ?? selectedWidgetStack.id)
    setSelectedLayerId(nextState?.selectedLayerId ?? selectedLayerId)
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [currentPage, selectedLayerId, selectedWidgetStack, widgetStackLayerSelections])

  const enterSelectedWidgetStack = useCallback((groupId?: string | null) => {
    if (!currentPage) return
    const targetGroupId = groupId ?? selectedWidgetStackId
    if (!targetGroupId) return
    const nextState = createWidgetStackEditState(currentPage, targetGroupId, widgetStackLayerSelections)
    if (!nextState) return
    setSelectedWidgetStackId(nextState.selectedWidgetStackId)
    setSelectedLayerId(nextState.selectedLayerId)
    setEditContext(nextState.editContext)
    setSelectedId(null)
  }, [currentPage, selectedWidgetStackId, widgetStackLayerSelections])

  const selectWidgetStack = useCallback((groupId: string | null) => {
    if (!groupId) {
      if (editContext.kind !== 'widget-stack') {
        const clearedState = createClearedWidgetStackSelectionState()
        setSelectedWidgetStackId(clearedState.selectedWidgetStackId)
        setSelectedLayerId(clearedState.selectedLayerId)
      }
      setSelectedId(null)
      return
    }
    if (!currentPage) return
    const nextState = createWidgetStackSelectionState(currentPage, groupId, widgetStackLayerSelections)
    if (!nextState) return
    setSelectedWidgetStackId(nextState.selectedWidgetStackId)
    setSelectedLayerId(nextState.selectedLayerId)
    if (editContext.kind !== 'widget-stack' || editContext.groupId !== groupId) {
      setEditContext(nextState.editContext)
    }
    setSelectedId(null)
  }, [currentPage, editContext, widgetStackLayerSelections])

  const handleAddWidgetStack = useCallback(() => {
    if (!currentPage) return
    const created = createWidgetStackOnDrop({
      page: currentPage,
      drop: { col: 0, row: 0 },
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
    })
    const nextGroups = created.page.widgetStacks ?? []
    const nextGroup = nextGroups[nextGroups.length - 1]
    if (!nextGroup || !isValidWidgetStackPlacement(nextGroup, currentPage, layout.gridCols, layout.gridRows)) {
      return
    }
    updateCurrentPage(() => created.page)
    updateWidgetStackLayerSelection(currentPage.id, created.context.groupId, created.context.layerId)
    setSelectedWidgetStackId(created.context.groupId)
    setSelectedLayerId(created.context.layerId)
    setEditContext(created.context)
    setSelectedId(null)
  }, [currentPage, layout.gridCols, layout.gridRows, updateCurrentPage, updateWidgetStackLayerSelection])

  const updateSelectedWidgetStack = useCallback((patch: Partial<DashWidgetStack>) => {
    if (!selectedWidgetStack || !currentPage) return
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => {
        if (group.id !== selectedWidgetStack.id) return group
        const next = { ...group, ...patch }
        next.colSpan = Math.max(1, Math.min(next.colSpan, layout.gridCols))
        next.rowSpan = Math.max(1, Math.min(next.rowSpan, layout.gridRows))
        next.col = Math.max(0, Math.min(next.col, layout.gridCols - next.colSpan))
        next.row = Math.max(0, Math.min(next.row, layout.gridRows - next.rowSpan))
        if (!isValidWidgetStackPlacement(next, page, layout.gridCols, layout.gridRows, group.id)) {
          return group
        }
        return {
          ...next,
          layers: next.layers.map(layer => ({
            ...layer,
            widgets: layer.widgets.map(widget => clampWidgetToLayerBounds(widget, next)),
          })),
        }
      }),
    }))
  }, [currentPage, layout.gridCols, layout.gridRows, selectedWidgetStack, updateCurrentPage])

  const handleDeleteSelectedWidgetStack = useCallback(() => {
    if (!selectedWidgetStack || !currentPage) return
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).filter(group => group.id !== selectedWidgetStack.id),
    }))
    updateWidgetStackLayerSelection(currentPage.id, selectedWidgetStack.id, null)
    setSelectedWidgetStackId(null)
    setSelectedLayerId(null)
    setEditContext(createPageEditContext())
    setSelectedId(null)
  }, [currentPage, selectedWidgetStack, updateCurrentPage, updateWidgetStackLayerSelection])

  const handleSelectLayer = useCallback((layerId: string) => {
    if (currentPage && selectedWidgetStack) {
      updateWidgetStackLayerSelection(currentPage.id, selectedWidgetStack.id, layerId)
    }
    setSelectedLayerId(layerId)
    if (editContext.kind === 'widget-stack' && selectedWidgetStack) {
      setEditContext({
        kind: 'widget-stack',
        groupId: selectedWidgetStack.id,
        layerId,
      })
    }
    setSelectedId(null)
  }, [currentPage, editContext.kind, selectedWidgetStack, updateWidgetStackLayerSelection])

  const handleAddLayer = useCallback(() => {
    if (!selectedWidgetStack || !currentPage) return
    const nextLayer = { id: createDashLayerId(), name: `Layer ${selectedWidgetStack.layers.length + 1}`, widgets: [] }
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
        ? {
          ...group,
          layers: [...group.layers, nextLayer],
          defaultLayerId: group.defaultLayerId ?? nextLayer.id,
        }
        : group),
    }))
    updateWidgetStackLayerSelection(currentPage.id, selectedWidgetStack.id, nextLayer.id)
    setSelectedLayerId(nextLayer.id)
    if (editContext.kind === 'widget-stack') {
      setEditContext({
        kind: 'widget-stack',
        groupId: selectedWidgetStack.id,
        layerId: nextLayer.id,
      })
    }
    setSelectedId(null)
  }, [currentPage, editContext.kind, selectedWidgetStack, updateCurrentPage, updateWidgetStackLayerSelection])

  const handleDuplicateLayer = useCallback((layerId: string) => {
    if (!selectedWidgetStack || !currentPage) return
    const sourceIndex = selectedWidgetStack.layers.findIndex(layer => layer.id === layerId)
    if (sourceIndex < 0) return
    const sourceLayer = selectedWidgetStack.layers[sourceIndex]
    const duplicatedLayerId = createDashLayerId()
    const duplicatedLayer = {
      ...sourceLayer,
      id: duplicatedLayerId,
      name: `${sourceLayer.name} Copy`,
      widgets: sourceLayer.widgets.map(widget => ({ ...widget, id: createDashWidgetId() })),
    }
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => {
        if (group.id !== selectedWidgetStack.id) return group
        const layers = [...group.layers]
        layers.splice(sourceIndex + 1, 0, duplicatedLayer)
        return { ...group, layers }
      }),
    }))
    updateWidgetStackLayerSelection(currentPage.id, selectedWidgetStack.id, duplicatedLayerId)
    setSelectedLayerId(duplicatedLayerId)
    if (editContext.kind === 'widget-stack') {
      setEditContext({
        kind: 'widget-stack',
        groupId: selectedWidgetStack.id,
        layerId: duplicatedLayerId,
      })
    }
    setSelectedId(null)
  }, [currentPage, editContext.kind, selectedWidgetStack, updateCurrentPage, updateWidgetStackLayerSelection])

  const handleRenameLayer = useCallback((layerId: string, name: string) => {
    if (!selectedWidgetStack) return
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
        ? {
          ...group,
          layers: group.layers.map(layer => layer.id === layerId ? { ...layer, name } : layer),
        }
        : group),
    }))
  }, [selectedWidgetStack, updateCurrentPage])

  const handleDeleteLayer = useCallback((layerId: string) => {
    if (!selectedWidgetStack || !currentPage || selectedWidgetStack.layers.length <= 1) return
    const targetLayer = selectedWidgetStack.layers.find(layer => layer.id === layerId)
    if (!targetLayer) return
    const nextLayerId = selectedWidgetStack.layers.find(layer => layer.id !== layerId)?.id ?? null
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => {
        if (group.id !== selectedWidgetStack.id) return group
        const layers = group.layers.filter(layer => layer.id !== layerId)
        return {
          ...group,
          layers,
          defaultLayerId: group.defaultLayerId === layerId ? layers[0]?.id : group.defaultLayerId,
        }
      }),
    }))
    updateWidgetStackLayerSelection(currentPage.id, selectedWidgetStack.id, nextLayerId)
    const deletedSelectedLayer = selectedLayer?.id === layerId
    if (deletedSelectedLayer) {
      setSelectedLayerId(nextLayerId)
    }
    if (nextLayerId && editContext.kind === 'widget-stack' && deletedSelectedLayer) {
      setEditContext({
        kind: 'widget-stack',
        groupId: selectedWidgetStack.id,
        layerId: nextLayerId,
      })
    } else if (deletedSelectedLayer) {
      setEditContext(createPageEditContext())
    }
    if (deletedSelectedLayer) {
      setSelectedId(null)
    }
  }, [currentPage, editContext.kind, selectedWidgetStack, selectedLayer, updateCurrentPage, updateWidgetStackLayerSelection])

  const handleDeleteSelectedLayer = useCallback(() => {
    if (!selectedLayer) return
    handleDeleteLayer(selectedLayer.id)
  }, [handleDeleteLayer, selectedLayer])

  const handleMoveLayer = useCallback((layerId: string, direction: -1 | 1) => {
    if (!selectedWidgetStack) return
    const currentIndex = selectedWidgetStack.layers.findIndex(layer => layer.id === layerId)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selectedWidgetStack.layers.length) return
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => {
        if (group.id !== selectedWidgetStack.id) return group
        const layers = [...group.layers]
        const [layer] = layers.splice(currentIndex, 1)
        layers.splice(nextIndex, 0, layer)
        return { ...group, layers }
      }),
    }))
  }, [selectedWidgetStack, updateCurrentPage])

  const handleMoveSelectedLayer = useCallback((direction: -1 | 1) => {
    if (!selectedLayer) return
    handleMoveLayer(selectedLayer.id, direction)
  }, [handleMoveLayer, selectedLayer])

  const handleSetDefaultLayer = useCallback((layerId: string) => {
    if (!selectedWidgetStack) return
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
        ? { ...group, defaultLayerId: layerId }
        : group),
    }))
  }, [selectedWidgetStack, updateCurrentPage])

  const updateSelectedLayer = useCallback((patch: { name?: string; defaultLayerId?: string }) => {
    if (!selectedWidgetStack || !selectedLayer) return
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => group.id === selectedWidgetStack.id
        ? {
          ...group,
          defaultLayerId: patch.defaultLayerId ?? group.defaultLayerId,
          layers: group.layers.map(layer => layer.id === selectedLayer.id ? { ...layer, ...(patch.name !== undefined ? { name: patch.name } : {}) } : layer),
        }
        : group),
    }))
  }, [selectedWidgetStack, selectedLayer, updateCurrentPage])

  const handlePageBackgroundChange = useCallback((background?: RGBAColor) => {
    updateCurrentPage(page => ({ ...page, background }))
  }, [updateCurrentPage])

  const handleCanvasSelectWidget = useCallback((id: number | null) => {
    setSelectedId(id)
    if (id !== null && !editingWidgetStack) {
      setSelectedWidgetStackId(null)
      setSelectedLayerId(null)
    }
  }, [editingWidgetStack])

  const handleCanvasBackgroundClick = useCallback(() => {
    if (editingWidgetStack) {
      setSelectedId(null)
      return
    }
    const clearedState = createClearedWidgetStackSelectionState()
    setSelectedId(null)
    setSelectedWidgetStackId(clearedState.selectedWidgetStackId)
    setSelectedLayerId(clearedState.selectedLayerId)
  }, [editingWidgetStack, exitWidgetStackEditMode])

  const handleCanvasSelectWidgetStack = useCallback((groupId: string | null) => {
    if (!groupId) {
      selectWidgetStack(null)
      return
    }
    selectWidgetStack(groupId)
  }, [selectWidgetStack])

  const handleCanvasEnterWidgetStack = useCallback((groupId: string) => {
    enterSelectedWidgetStack(groupId)
  }, [enterSelectedWidgetStack])

  const handleCanvasUpdateWidgetStack = useCallback((groupId: string, rect: { col: number; row: number; colSpan: number; rowSpan: number }) => {
    setSelectedWidgetStackId(groupId)
    updateCurrentPage(page => ({
      ...page,
      widgetStacks: (page.widgetStacks ?? []).map(group => {
        if (group.id !== groupId) return group
        const next = {
          ...group,
          col: Math.max(0, Math.min(rect.col, layout.gridCols - rect.colSpan)),
          row: Math.max(0, Math.min(rect.row, layout.gridRows - rect.rowSpan)),
          colSpan: Math.max(1, Math.min(rect.colSpan, layout.gridCols)),
          rowSpan: Math.max(1, Math.min(rect.rowSpan, layout.gridRows)),
        }
        if (!isValidWidgetStackPlacement(next, page, layout.gridCols, layout.gridRows, groupId)) {
          return group
        }
        return {
          ...next,
          layers: next.layers.map(layer => ({
            ...layer,
            widgets: layer.widgets.map(widget => clampWidgetToLayerBounds(widget, next)),
          })),
        }
      }),
    }))
  }, [layout.gridCols, layout.gridRows, updateCurrentPage])

  const handleCanvasCreateWidgetStack = useCallback((rect: { col: number; row: number; colSpan: number; rowSpan: number }) => {
    if (!currentPage || editingWidgetStack) return
    const created = createWidgetStackOnDrop({
      page: currentPage,
      drop: { col: rect.col, row: rect.row },
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
    })
    const nextGroups = created.page.widgetStacks ?? []
    const nextGroup = nextGroups[nextGroups.length - 1]
    if (!nextGroup || !isValidWidgetStackPlacement(nextGroup, currentPage, layout.gridCols, layout.gridRows)) {
      return
    }
    updateCurrentPage(() => created.page)
    updateWidgetStackLayerSelection(currentPage.id, created.context.groupId, created.context.layerId)
    setSelectedWidgetStackId(created.context.groupId)
    setSelectedLayerId(created.context.layerId)
    setEditContext(created.context)
    setSelectedId(null)
  }, [currentPage, editingWidgetStack, layout.gridCols, layout.gridRows, updateCurrentPage, updateWidgetStackLayerSelection])

  const blockedAreas = editingWidgetStack
    ? []
    : widgetStacks.map(group => ({ col: group.col, row: group.row, colSpan: group.colSpan, rowSpan: group.rowSpan }))

  const placementBounds = editingWidgetStack
    ? null
    : selectedWidgetStack
      ? { col: selectedWidgetStack.col, row: selectedWidgetStack.row, colSpan: selectedWidgetStack.colSpan, rowSpan: selectedWidgetStack.rowSpan }
    : null

  const overlayRects = widgetStacks.map(group => ({
    defaultLayerName: group.layers.find(layer => layer.id === group.defaultLayerId)?.name ?? group.layers[0]?.name ?? null,
    activeLayerName: group.layers.find(layer => layer.id === (
      widgetStackLayerSelections[widgetStackSelectionKey(currentPage?.id ?? '', group.id)]
      ?? group.defaultLayerId
      ?? group.layers[0]?.id
      ?? null
    ))?.name ?? group.layers[0]?.name ?? null,
    id: group.id,
    col: group.col,
    row: group.row,
    colSpan: group.colSpan,
    rowSpan: group.rowSpan,
    label: group.name,
    meta: `${group.layers.length} ${group.layers.length === 1 ? 'layer' : 'layers'}`,
    detail: `Default ${group.layers.find(layer => layer.id === group.defaultLayerId)?.name ?? group.layers[0]?.name ?? 'Layer'}`,
    secondaryDetail: group.layers.find(layer => layer.id === (
      widgetStackLayerSelections[widgetStackSelectionKey(currentPage?.id ?? '', group.id)]
      ?? group.defaultLayerId
      ?? group.layers[0]?.id
      ?? null
    ))?.name ?? undefined,
    actionLabel: group.id === selectedWidgetStackId && !editingWidgetStack ? 'Open Stack' : undefined,
    selected: group.id === selectedWidgetStackId,
    locked: editingWidgetStack && group.id !== selectedWidgetStackId,
    editing: editingWidgetStack && group.id === selectedWidgetStackId,
  }))

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId !== null) {
          setConfirmRemoveWidget(true)
          return
        }
        if (selectedWidgetStack) {
          handleDeleteSelectedWidgetStack()
        }
        return
      }

      if (event.key === 'Enter' && selectedWidgetStack && !editingWidgetStack) {
        enterSelectedWidgetStack(selectedWidgetStack.id)
        return
      }

      if (event.key === 'Escape' && editingWidgetStack) {
        exitWidgetStackEditMode()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    editingWidgetStack,
    enterSelectedWidgetStack,
    exitWidgetStackEditMode,
    handleDeleteSelectedWidgetStack,
    selectedId,
    selectedWidgetStack,
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

  const handleToggleCompare = useCallback(() => {
    if (!selectedWidgetStack || !selectedLayer) return
    const nextEnabled = !compareEnabled
    if (!nextEnabled) {
      setCompareEnabled(false)
      setReferenceLayerId(null)
      return
    }
    const candidateLayer = selectedWidgetStack.layers.find(layer => layer.id !== selectedLayer.id)
    if (!candidateLayer) return
    setCompareEnabled(true)
    setReferenceLayerId(previous => previous && previous !== selectedLayer.id
      ? previous
      : candidateLayer.id)
  }, [compareEnabled, selectedLayer, selectedWidgetStack])

  const handleSelectReferenceLayer = useCallback((layerId: string) => {
    if (!selectedWidgetStack || layerId === selectedLayer?.id) return
    setCompareEnabled(true)
    setReferenceLayerId(layerId)
  }, [selectedLayer, selectedWidgetStack])

  const handlePromoteReferenceLayer = useCallback(() => {
    if (!currentPage || !selectedWidgetStack || !selectedLayer || !referenceLayer) return
    const previousLayerId = selectedLayer.id
    updateWidgetStackLayerSelection(currentPage.id, selectedWidgetStack.id, referenceLayer.id)
    setSelectedLayerId(referenceLayer.id)
    setReferenceLayerId(previousLayerId)
    setEditContext({
      kind: 'widget-stack',
      groupId: selectedWidgetStack.id,
      layerId: referenceLayer.id,
    })
    setSelectedId(null)
  }, [currentPage, referenceLayer, selectedLayer, selectedWidgetStack, updateWidgetStackLayerSelection])

  return {
    activeTab,
    alertCatalog,
    canvasPaneRef,
    canvasWidgets,
    catalog,
    confirm,
    confirmRemoveWidget,
    compareEnabled,
    dashNameValue,
    doRemoveSelectedWidget,
    editorMode,
    editingWidgetStack,
    editorTab,
    enterSelectedWidgetStack,
    exitWidgetStackEditMode,
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
    handleAddWidgetStack,
    handleDeleteSelectedLayer,
    handleDeleteLayer,
    handleDeleteSelectedWidgetStack,
    handleDuplicateLayer,
    handleMoveLayer,
    handleMoveSelectedLayer,
    handlePageBackgroundChange,
    handlePromoteReferenceLayer,
    handleRenameLayer,
    handleRenameWidgetStack: (name: string) => updateSelectedWidgetStack({ name }),
    handleSelectReferenceLayer,
    handleSetDefaultLayer,
    handleToggleCompare,
    handleCanvasBackgroundClick,
    handleCanvasCreateWidgetStack,
    handleCanvasEnterWidgetStack,
    handleCanvasSelectWidget,
    handleCanvasSelectWidgetStack,
    handleCanvasUpdateWidgetStack,
    handleSelectLayer,
    handleAddLayer,
    previewUrl,
    overlayRects,
    placementBounds,
    referenceLayer,
    renamingDash,
    saveStatus,
    saving,
    selectedId,
    selectedLayerId: selectedLayer?.id ?? null,
    selectedWidgetStack,
    selectedWidgetStackId,
    selectedLayer,
    selectedWidget,
    setConfirmRemoveWidget,
    setDashNameValue,
    setEditorTab,
    setPaletteDropPreviewUrl,
    setPaletteDropType,
    setRenamingDash,
    setSelectedId,
    showDialog,
    selectWidgetStack,
    widgetStacks,
    widgetPreviewUrls,
    updateSelectedLayer,
    updateSelectedWidgetStack,
    screenH,
    screenW,
    selectCanvasTab,
    updateSelectedWidget,
    cancel,
    commitDashName,
  }
}
