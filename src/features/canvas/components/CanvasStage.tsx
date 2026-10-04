import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Move, RotateCw } from 'lucide-react'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'
import { beginDragSession, shouldCommitDrag, updateDragSession, type DragSession } from '../canvasViewModel'

interface CanvasStageProps {
  plan: WorkspacePlan
  selectedItemId: string | null
  analysis: LayoutAnalysis
  readOnly?: boolean
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
}

export function CanvasStage({ plan, selectedItemId, analysis, readOnly = false, onSelect, onMove }: CanvasStageProps) {
  const stageRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragSession | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const scaleToMm = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((clientX - rect.left) / rect.width) * plan.deskWidthMm, y: ((clientY - rect.top) / rect.height) * plan.deskHeightMm }
  }, [plan.deskHeightMm, plan.deskWidthMm])

  // 一次拖动只有两种结局：commit 为 true 时把最终位置一次性写进方案；
  // 中断（系统手势、切标签页、窗口失焦、Esc）一律传 false，只清理状态，不写回坐标。
  const finishDrag = useCallback((commit: boolean) => {
    const session = dragRef.current
    if (!session) return
    dragRef.current = null
    setDrag(null)
    if (commit && shouldCommitDrag(session)) {
      onMove(session.id, session.x, session.y)
    }
  }, [onMove])

  const isDragging = drag !== null

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (event: PointerEvent) => {
      const session = dragRef.current
      if (!session) return
      if (event.buttons === 0) {
        // 没收到 pointerup（例如在窗口外松开）：按中断处理，丢弃本次拖动
        finishDrag(false)
        return
      }
      const point = scaleToMm(event.clientX, event.clientY)
      if (!point) return
      const next = updateDragSession(session, point.x, point.y)
      dragRef.current = next
      setDrag(next)
    }
    const handleUp = (event: PointerEvent) => {
      if (event.button === 0) finishDrag(true)
    }
    const handleInterrupt = () => finishDrag(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') finishDrag(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishDrag(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleInterrupt)
    window.addEventListener('blur', handleInterrupt)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleInterrupt)
      window.removeEventListener('blur', handleInterrupt)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [finishDrag, isDragging, scaleToMm])

  // 拖动途中切换到另一个方案：取消本次拖动，避免把坐标写进别的方案
  useEffect(() => {
    dragRef.current = null
    setDrag(null)
  }, [plan.id])

  const startDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    if (readOnly || event.button !== 0 || !event.isPrimary) return
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    onSelect(item.id)
    const session = beginDragSession(item, point.x, point.y)
    dragRef.current = session
    setDrag(session)
  }

  return (
    <div className="canvas-wrap">
      {!readOnly && <div className="canvas-toolbar"><span><Move size={14} /> 拖动设备调整位置</span><span><RotateCw size={14} /> 旋转请在右侧操作</span></div>}
      <svg ref={stageRef} className="desk-canvas" viewBox={`0 0 ${plan.deskWidthMm} ${plan.deskHeightMm}`} role="img" aria-label={`桌面布局画布，${plan.deskWidthMm}乘${plan.deskHeightMm}毫米`} onPointerDown={() => onSelect(null)}>
        <defs>
          <pattern id="desk-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d8e1ed" strokeWidth="1" /></pattern>
          <filter id="item-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#20304a" floodOpacity=".12" /></filter>
        </defs>
        <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="#f8fafc" />
        <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="url(#desk-grid)" />
        <text x="34" y="48" fill="#a0aec0" fontSize="20" letterSpacing="3">FOCUS ZONE / {plan.deskWidthMm} × {plan.deskHeightMm} MM</text>
        {plan.items.map((item) => {
          const definition = getDeviceDefinition(item.type)
          const isSelected = selectedItemId === item.id
          const hasIssue = analysis.overlapIds.includes(item.id) || analysis.outOfBoundsIds.includes(item.id)
          const displayItem = drag?.id === item.id ? { ...item, x: drag.x, y: drag.y } : item
          const cx = displayItem.x + displayItem.widthMm / 2
          const cy = displayItem.y + displayItem.heightMm / 2
          return <g className={`desk-item ${isSelected ? 'is-selected' : ''} ${hasIssue ? 'has-issue' : ''}`} key={item.id} onPointerDown={readOnly ? undefined : (event) => startDrag(event, item)} role="button" tabIndex={0} aria-label={`${definition.label}，${item.widthMm}乘${item.heightMm}毫米`}>
            <g transform={`translate(${cx} ${cy}) rotate(${displayItem.rotation})`}>
              <rect x={-displayItem.widthMm / 2} y={-displayItem.heightMm / 2} width={displayItem.widthMm} height={displayItem.heightMm} rx={Math.min(24, displayItem.heightMm / 5)} fill={definition.color} filter="url(#item-shadow)" />
              <rect className="item-inner-line" x={-displayItem.widthMm / 2 + 12} y={-displayItem.heightMm / 2 + 12} width={Math.max(0, displayItem.widthMm - 24)} height={Math.max(0, displayItem.heightMm - 24)} rx={12} fill="none" />
              <text x="0" y="5" textAnchor="middle" fill="#1f2e44" fontWeight="700" fontSize={Math.max(18, Math.min(32, displayItem.widthMm / 16))}>{definition.shortLabel}</text>
              <text x="0" y="30" textAnchor="middle" fill="#44546b" fontSize="16">{displayItem.widthMm} × {displayItem.heightMm}</text>
            </g>
            {isSelected && <rect className="selection-box" x={getItemBounds(displayItem).left - 8} y={getItemBounds(displayItem).top - 8} width={getItemBounds(displayItem).width + 16} height={getItemBounds(displayItem).height + 16} rx="12" fill="none" />}
            {hasIssue && <g transform={`translate(${Math.max(18, getItemBounds(displayItem).right - 4)} ${Math.max(18, getItemBounds(displayItem).top - 4)})`}><circle r="18" fill="#ef6a6a" /><text textAnchor="middle" y="7" fill="white" fontSize="22" fontWeight="700">!</text></g>}
          </g>
        })}
        {plan.items.length === 0 && <g><circle cx={plan.deskWidthMm / 2} cy={plan.deskHeightMm / 2 - 12} r="32" fill="#e8eef6" /><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 2} textAnchor="middle" fill="#8493a8" fontSize="22">+</text><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 48} textAnchor="middle" fill="#8493a8" fontSize="22">从左侧添加第一件设备</text></g>}
      </svg>
      <div className="canvas-legend"><span><i className="legend-dot clear-dot" /> 可用空间</span><span><i className="legend-dot issue-dot" /> 冲突 / 越界</span><span className="canvas-scale">网格：50 mm</span></div>
    </div>
  )
}
