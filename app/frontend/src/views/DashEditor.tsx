import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { type DashLayout, type LayoutMeta, dashAPI } from '@/lib/dash'
import { DashList } from '@/components/DashList'
import { DashEditMode } from '@/components/DashEditMode'

export interface DashEditorHandle {
  isDirty: boolean
}

const DashEditor = forwardRef<DashEditorHandle>(function DashEditor(_, ref) {
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<LayoutMeta[]>([])
  const [editLayout, setEditLayout] = useState<DashLayout | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useImperativeHandle(ref, () => ({ isDirty }), [isDirty])

  const loadLayouts = useCallback(async () => {
    const metas = await dashAPI.listLayouts()
    setLayouts(metas)
    return metas
  }, [])

  useEffect(() => { void loadLayouts() }, [loadLayouts])

  const handleEdit = async (id: string) => {
    const layout = await dashAPI.loadLayoutByID(id)
    setEditLayout(layout)
    setEditingId(id)
    setIsDirty(false)
    setMode('edit')
  }

  const handleCreate = async () => {
    const layout = await dashAPI.createLayout('Untitled')
    await loadLayouts()
    setEditLayout(layout)
    setEditingId(layout.id)
    setIsDirty(false)
    setMode('edit')
  }

  const handleSave = async (layout: DashLayout) => {
    await dashAPI.saveLayout(layout)
    await loadLayouts()
    setIsDirty(false)
  }

  if (mode === 'edit' && editLayout) {
    return (
      <DashEditMode
        layout={editLayout}
        onSave={handleSave}
        onBack={() => { setMode('list'); setEditLayout(null); setEditingId(null) }}
        onDirtyChange={setIsDirty}
      />
    )
  }

  void editingId

  return (
    <DashList
      layouts={layouts}
      onEdit={handleEdit}
      onCreate={handleCreate}
      onDelete={async (id) => { await dashAPI.deleteLayout(id); await loadLayouts() }}
      onSetDefault={async (id) => { await dashAPI.setDefault(id); await loadLayouts() }}
    />
  )
})

export default DashEditor
