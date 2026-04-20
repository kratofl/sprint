import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type AlertInstance,
  type AlertMeta,
  type DashLayout,
  type DashPage,
  type DashTheme,
  type DashWidget,
  type DashWrapperGroup,
  type DomainPalette,
  type FormatPreferences,
  type RGBAColor,
  type TypographySettings,
  type WidgetCatalogEntry,
  alertCatalogAPI,
  DEFAULT_DASH_THEME,
  dashAPI,
  deviceAPI,
  deviceHasScreen,
  widgetCatalogAPI,
} from '@/lib/dash'
import { DASH_EVENTS } from '@/lib/desktopEvents'
import { onEvent } from '@/lib/wails'
import { useNavigationGuard, useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { DEFAULT_SCREEN_H, DEFAULT_SCREEN_W } from '@/components/DashCanvas'

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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId !== null) {
        if (document.activeElement?.tagName === 'INPUT') return
        setConfirmRemoveWidget(true)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId])

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

  const canvasWidgets = activeTab === 'alerts'
    ? []
    : selectedWrapperGroup && selectedWrapperVariant
      ? selectedWrapperVariant.widgets.map(widget => ({
        ...widget,
        col: widget.col + selectedWrapperGroup.col,
        row: widget.row + selectedWrapperGroup.row,
      }))
      : (currentPage?.widgets ?? [])

  const selectedWidget = selectedId !== null ? (canvasWidgets[selectedId] ?? null) : null
  const paletteWidgets = activeTab === 'idle'
    ? catalog.filter(widget => widget.idleCapable)
    : activeTab === 'alerts'
      ? []
      : catalog

  useEffect(() => {
    if (activeTab === 'alerts') {
      setSelectedWrapperGroupId(null)
      setSelectedVariantId(null)
      return
    }
    if (!selectedWrapperGroupId) return
    const group = wrapperGroups.find(candidate => candidate.id === selectedWrapperGroupId)
    if (!group) {
      setSelectedWrapperGroupId(null)
      setSelectedVariantId(null)
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
    if (selectedWrapperGroup && selectedWrapperVariant) {
      updateCurrentPage(page => ({
        ...page,
        wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
          ? {
            ...group,
            variants: group.variants.map(variant => variant.id === selectedWrapperVariant.id
              ? {
                ...variant,
                widgets: widgets.map(widget => ({
                  ...widget,
                  col: widget.col - group.col,
                  row: widget.row - group.row,
                })),
              }
              : variant),
          }
          : group),
      }))
      return
    }

    updateCurrentPage(page => ({ ...page, widgets }))
  }, [selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage])

  const selectCanvasTab = useCallback((tab: 'idle' | 'alerts' | number) => {
    setActiveTab(tab)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    clearWrapperVariantSelections()
    setSelectedId(null)
  }, [clearWrapperVariantSelections])

  const handleAddPage = useCallback(() => {
    const name = `Page ${layout.pages.length + 1}`
    const newPage: DashPage = { id: crypto.randomUUID(), name, widgets: [], wrapperGroups: [] }
    setLayout(previous => ({ ...previous, pages: [...previous.pages, newPage] }))
    setActiveTab(layout.pages.length)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    clearWrapperVariantSelections()
    setSelectedId(null)
  }, [clearWrapperVariantSelections, layout.pages.length])

  const handleDeletePage = useCallback((index: number) => {
    if (layout.pages.length <= 1) return

    setLayout(previous => ({ ...previous, pages: previous.pages.filter((_, pageIndex) => pageIndex !== index) }))
    setActiveTab(previous => typeof previous === 'number' && previous >= index ? Math.max(0, previous - 1) : previous)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    clearWrapperVariantSelections()
    setSelectedId(null)
  }, [clearWrapperVariantSelections, layout.pages.length])

  const handleRenamePage = useCallback((index: number, name: string) => {
    setLayout(previous => ({
      ...previous,
      pages: previous.pages.map((page, pageIndex) => pageIndex === index ? { ...page, name } : page),
    }))
  }, [])

  const handleClearPage = useCallback(() => {
    if (selectedWrapperGroup && selectedWrapperVariant) {
      updateCurrentPage(page => ({
        ...page,
        wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
          ? {
            ...group,
            variants: group.variants.map(variant => variant.id === selectedWrapperVariant.id ? { ...variant, widgets: [] } : variant),
          }
          : group),
      }))
    } else {
      updateCurrentPage(page => ({ ...page, widgets: [] }))
    }
    setSelectedId(null)
  }, [selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage])

  const handleSettingsChange = useCallback((theme: Partial<DashTheme>, domain: Partial<DomainPalette>) => {
    setLayout(previous => ({
      ...previous,
      theme: { ...DEFAULT_DASH_THEME, ...theme } as DashTheme,
      domainPalette: domain,
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
    if (selectedWrapperGroup && selectedWrapperVariant) {
      updateCurrentPage(page => ({
        ...page,
        wrapperGroups: (page.wrapperGroups ?? []).map(group => group.id === selectedWrapperGroup.id
          ? {
            ...group,
            variants: group.variants.map(variant => variant.id === selectedWrapperVariant.id
              ? { ...variant, widgets: variant.widgets.filter((_, index) => index !== selectedId) }
              : variant),
          }
          : group),
      }))
    } else {
      updateCurrentPage(page => ({ ...page, widgets: page.widgets.filter((_, index) => index !== selectedId) }))
    }

    setSelectedId(null)
  }, [selectedId, selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage])

  const updateSelectedWidget = useCallback((updated: DashWidget) => {
    if (selectedId === null) return
    handleUpdate(canvasWidgets.map((widget, index) => index === selectedId ? updated : widget))
  }, [canvasWidgets, handleUpdate, selectedId])

  const selectWrapperGroup = useCallback((groupId: string | null) => {
    if (!groupId) {
      setSelectedWrapperGroupId(null)
      setSelectedVariantId(null)
      setSelectedId(null)
      return
    }
    const group = wrapperGroups.find(candidate => candidate.id === groupId)
    const nextVariantId = currentPage
      ? wrapperVariantSelections[wrapperSelectionKey(currentPage.id, groupId)]
        ?? group?.defaultVariantId
        ?? group?.variants[0]?.id
        ?? null
      : group?.defaultVariantId ?? group?.variants[0]?.id ?? null
    setSelectedWrapperGroupId(groupId)
    setSelectedVariantId(nextVariantId)
    setSelectedId(null)
  }, [currentPage, wrapperGroups, wrapperVariantSelections])

  const handleAddWrapperGroup = useCallback(() => {
    const nextIndex = wrapperGroups.length + 1
    const nextGroup: DashWrapperGroup = {
      id: crypto.randomUUID(),
      name: `Wrapper ${nextIndex}`,
      col: 0,
      row: 0,
      colSpan: 4,
      rowSpan: 2,
      defaultVariantId: crypto.randomUUID(),
      variants: [],
    }
    const firstVariantId = nextGroup.defaultVariantId!
    nextGroup.variants = [{ id: firstVariantId, name: 'Variant 1', widgets: [] }]
    updateCurrentPage(page => ({ ...page, wrapperGroups: [...(page.wrapperGroups ?? []), nextGroup] }))
    if (currentPage) {
      updateWrapperVariantSelection(currentPage.id, nextGroup.id, firstVariantId)
    }
    setSelectedWrapperGroupId(nextGroup.id)
    setSelectedVariantId(firstVariantId)
    setSelectedId(null)
  }, [currentPage, updateCurrentPage, updateWrapperVariantSelection, wrapperGroups.length])

  const updateSelectedWrapperGroup = useCallback((patch: Partial<DashWrapperGroup>) => {
    if (!selectedWrapperGroup) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => {
        if (group.id !== selectedWrapperGroup.id) return group
        const next = { ...group, ...patch }
        next.colSpan = Math.max(1, Math.min(next.colSpan, layout.gridCols))
        next.rowSpan = Math.max(1, Math.min(next.rowSpan, layout.gridRows))
        next.col = Math.max(0, Math.min(next.col, layout.gridCols - next.colSpan))
        next.row = Math.max(0, Math.min(next.row, layout.gridRows - next.rowSpan))
        return next
      }),
    }))
  }, [layout.gridCols, layout.gridRows, selectedWrapperGroup, updateCurrentPage])

  const handleDeleteSelectedWrapperGroup = useCallback(() => {
    if (!selectedWrapperGroup || !currentPage) return
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).filter(group => group.id !== selectedWrapperGroup.id),
    }))
    updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, null)
    setSelectedWrapperGroupId(null)
    setSelectedVariantId(null)
    setSelectedId(null)
  }, [currentPage, selectedWrapperGroup, updateCurrentPage, updateWrapperVariantSelection])

  const handleSelectWrapperVariant = useCallback((variantId: string) => {
    if (currentPage && selectedWrapperGroup) {
      updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, variantId)
    }
    setSelectedVariantId(variantId)
    setSelectedId(null)
  }, [currentPage, selectedWrapperGroup, updateWrapperVariantSelection])

  const handleAddWrapperVariant = useCallback(() => {
    if (!selectedWrapperGroup || !currentPage) return
    const nextVariant = { id: crypto.randomUUID(), name: `Variant ${selectedWrapperGroup.variants.length + 1}`, widgets: [] }
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
    setSelectedId(null)
  }, [currentPage, selectedWrapperGroup, updateCurrentPage, updateWrapperVariantSelection])

  const handleDeleteSelectedVariant = useCallback(() => {
    if (!selectedWrapperGroup || !selectedWrapperVariant || !currentPage || selectedWrapperGroup.variants.length <= 1) return
    const nextVariantId = selectedWrapperGroup.variants.find(variant => variant.id !== selectedWrapperVariant.id)?.id ?? null
    updateCurrentPage(page => ({
      ...page,
      wrapperGroups: (page.wrapperGroups ?? []).map(group => {
        if (group.id !== selectedWrapperGroup.id) return group
        const variants = group.variants.filter(variant => variant.id !== selectedWrapperVariant.id)
        return {
          ...group,
          variants,
          defaultVariantId: group.defaultVariantId === selectedWrapperVariant.id ? variants[0]?.id : group.defaultVariantId,
        }
      }),
    }))
    updateWrapperVariantSelection(currentPage.id, selectedWrapperGroup.id, nextVariantId)
    setSelectedVariantId(nextVariantId)
    setSelectedId(null)
  }, [currentPage, selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage, updateWrapperVariantSelection])

  const handleMoveSelectedVariant = useCallback((direction: -1 | 1) => {
    if (!selectedWrapperGroup || !selectedWrapperVariant) return
    const currentIndex = selectedWrapperGroup.variants.findIndex(variant => variant.id === selectedWrapperVariant.id)
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
  }, [selectedWrapperGroup, selectedWrapperVariant, updateCurrentPage])

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

  const blockedAreas = selectedWrapperGroup
    ? []
    : wrapperGroups.map(group => ({ col: group.col, row: group.row, colSpan: group.colSpan, rowSpan: group.rowSpan }))

  const placementBounds = selectedWrapperGroup
    ? { col: selectedWrapperGroup.col, row: selectedWrapperGroup.row, colSpan: selectedWrapperGroup.colSpan, rowSpan: selectedWrapperGroup.rowSpan }
    : null

  const overlayRects = wrapperGroups.map(group => ({
    col: group.col,
    row: group.row,
    colSpan: group.colSpan,
    rowSpan: group.rowSpan,
    label: group.name,
    selected: group.id === selectedWrapperGroupId,
  }))

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
    editorTab,
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
    handleAddWrapperGroup,
    handleDeleteSelectedVariant,
    handleDeleteSelectedWrapperGroup,
    handleMoveSelectedVariant,
    handlePageBackgroundChange,
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
