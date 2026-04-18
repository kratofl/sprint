import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type AlertInstance,
  type AlertMeta,
  type DashLayout,
  type DashPage,
  type DashTheme,
  type DashWidget,
  type DomainPalette,
  type FormatPreferences,
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
  const [canvasPaneEl, setCanvasPaneEl] = useState<HTMLDivElement | null>(null)
  const [fittedCanvas, setFittedCanvas] = useState<{ w: number; h: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [globalDefaults, setGlobalDefaults] = useState<{
    theme: DashTheme
    domain: DomainPalette
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
    void dashAPI.startPreview(layout, pageIndex, idle)
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
    void dashAPI.updatePreview(layout, pageIndex, idle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      const { idle, pageIndex } = previewTargetRef.current
      void dashAPI.updatePreview(layout, pageIndex, idle)
    }, 150)

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [layout])

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

  const canvasWidgets = activeTab === 'idle'
    ? layout.idlePage.widgets
    : activeTab === 'alerts'
      ? []
      : (layout.pages[activeTab as number]?.widgets ?? [])

  const selectedWidget = selectedId !== null ? (canvasWidgets[selectedId] ?? null) : null
  const paletteWidgets = activeTab === 'idle'
    ? catalog.filter(widget => widget.idleCapable)
    : activeTab === 'alerts'
      ? []
      : catalog

  const handleUpdate = useCallback((widgets: DashWidget[]) => {
    if (activeTab === 'idle') {
      setLayout(previous => ({ ...previous, idlePage: { ...previous.idlePage, widgets } }))
    } else if (activeTab !== 'alerts') {
      setLayout(previous => ({
        ...previous,
        pages: previous.pages.map((page, index) => index === activeTab ? { ...page, widgets } : page),
      }))
    }
  }, [activeTab])

  const selectCanvasTab = useCallback((tab: 'idle' | 'alerts' | number) => {
    setActiveTab(tab)
    setSelectedId(null)
  }, [])

  const handleAddPage = useCallback(() => {
    const name = `Page ${layout.pages.length + 1}`
    const newPage: DashPage = { id: crypto.randomUUID(), name, widgets: [] }
    setLayout(previous => ({ ...previous, pages: [...previous.pages, newPage] }))
    setActiveTab(layout.pages.length)
    setSelectedId(null)
  }, [layout.pages.length])

  const handleDeletePage = useCallback((index: number) => {
    if (layout.pages.length <= 1) return

    setLayout(previous => ({ ...previous, pages: previous.pages.filter((_, pageIndex) => pageIndex !== index) }))
    setActiveTab(previous => typeof previous === 'number' && previous >= index ? Math.max(0, previous - 1) : previous)
    setSelectedId(null)
  }, [layout.pages.length])

  const handleRenamePage = useCallback((index: number, name: string) => {
    setLayout(previous => ({
      ...previous,
      pages: previous.pages.map((page, pageIndex) => pageIndex === index ? { ...page, name } : page),
    }))
  }, [])

  const handleClearPage = useCallback(() => {
    if (activeTab === 'idle') {
      setLayout(previous => ({ ...previous, idlePage: { ...previous.idlePage, widgets: [] } }))
    } else {
      setLayout(previous => ({
        ...previous,
        pages: previous.pages.map((page, pageIndex) => pageIndex === activeTab ? { ...page, widgets: [] } : page),
      }))
    }
    setSelectedId(null)
  }, [activeTab])

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

  const handleAlertsChange = useCallback((instances: AlertInstance[]) => {
    setLayout(previous => ({ ...previous, alerts: instances }))
  }, [])

  const doRemoveSelectedWidget = useCallback(() => {
    if (selectedId === null) return

    if (activeTab === 'idle') {
      setLayout(previous => ({
        ...previous,
        idlePage: { ...previous.idlePage, widgets: previous.idlePage.widgets.filter((_, index) => index !== selectedId) },
      }))
    } else {
      setLayout(previous => ({
        ...previous,
        pages: previous.pages.map((page, pageIndex) =>
          pageIndex === activeTab ? { ...page, widgets: page.widgets.filter((_, index) => index !== selectedId) } : page,
        ),
      }))
    }

    setSelectedId(null)
  }, [activeTab, selectedId])

  const updateSelectedWidget = useCallback((updated: DashWidget) => {
    if (selectedId === null) return
    handleUpdate(canvasWidgets.map((widget, index) => index === selectedId ? updated : widget))
  }, [canvasWidgets, handleUpdate, selectedId])

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
    handleUpdate,
    isDirty,
    layout,
    livePageIndex,
    paletteDropPreviewUrl,
    paletteDropType,
    paletteWidgets,
    previewUrl,
    renamingDash,
    saveStatus,
    saving,
    selectedId,
    selectedWidget,
    setConfirmRemoveWidget,
    setDashNameValue,
    setEditorTab,
    setPaletteDropPreviewUrl,
    setPaletteDropType,
    setRenamingDash,
    setSelectedId,
    showDialog,
    widgetPreviewUrls,
    screenH,
    screenW,
    selectCanvasTab,
    updateSelectedWidget,
    cancel,
    commitDashName,
  }
}
