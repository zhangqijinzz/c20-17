import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Move, RotateCw } from 'lucide-react'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'
import { beginDragSession, moveDragSession, shouldCommitDrag, type DragSession } from '../canvasViewModel'

interface CanvasStageProps {
  plan: WorkspacePlan
  selectedItemId: string | null
  analysis: LayoutAnalysis
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
}

export function CanvasStage({ plan, selectedItemId, analysis, onSelect, onMove }: CanvasStageProps) {
  const stageRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragSession | null>(null)
  // 事件回调通过 ref 读到的一定是最新会话，避免每次 pointermove 都重挂监听
  const dragRef = useRef<DragSession | null>(null)
  const captureRef = useRef<Element | null>(null)
  const isDragging = drag !== null
  const scaleToMm = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((clientX - rect.left) / rect.width) * plan.deskWidthMm, y: ((clientY - rect.top) / rect.height) * plan.deskHeightMm }
  }, [plan.deskHeightMm, plan.deskWidthMm])

  const endDragSession = useCallback(() => {
    const target = captureRef.current
    const session = dragRef.current
    if (target && session) {
      try { target.releasePointerCapture(session.pointerId) } catch { /* 捕获可能已被浏览器释放 */ }
    }
    captureRef.current = null
    dragRef.current = null
    setDrag(null)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    // commit=true 表示用户正常松手完成拖动；中断（取消/失焦/切页）一律不提交，
    // 预览坐标就此丢弃，方案里保留拖动前的位置
    const finishSession = (commit: boolean) => {
      const session = dragRef.current
      if (!session) return
      endDragSession()
      if (commit && shouldCommitDrag(session)) onMove(session.itemId, session.x, session.y)
    }
    const handleMove = (event: PointerEvent) => {
      const session = dragRef.current
      if (!session || event.pointerId !== session.pointerId) return
      const point = scaleToMm(event.clientX, event.clientY)
      if (!point) return
      const next = moveDragSession(session, point)
      dragRef.current = next
      setDrag(next)
    }
    const handleUp = (event: PointerEvent) => {
      if (event.pointerId !== dragRef.current?.pointerId) return
      finishSession(true)
    }
    const handleCancel = (event: PointerEvent) => {
      if (event.pointerId !== dragRef.current?.pointerId) return
      finishSession(false)
    }
    const handleInterrupt = () => finishSession(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') finishSession(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    window.addEventListener('lostpointercapture', handleCancel)
    window.addEventListener('blur', handleInterrupt)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
      window.removeEventListener('lostpointercapture', handleCancel)
      window.removeEventListener('blur', handleInterrupt)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isDragging, onMove, scaleToMm, endDragSession])

  const startDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    if (dragRef.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    onSelect(item.id)
    const session = beginDragSession(item, event.pointerId, point)
    dragRef.current = session
    captureRef.current = event.currentTarget
    // 指针捕获保证松手/取消事件即使发生在画布外也能送达
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 不支持时仍可靠 window 监听兜底 */ }
    setDrag(session)
  }

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar"><span><Move size={14} /> 拖动设备调整位置</span><span><RotateCw size={14} /> 旋转请在右侧操作</span></div>
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
          // 拖动中的设备只按会话里的预览坐标渲染，方案数据保持拖动前的位置
          const rendered = drag && drag.itemId === item.id ? { ...item, x: drag.x, y: drag.y } : item
          const cx = rendered.x + rendered.widthMm / 2
          const cy = rendered.y + rendered.heightMm / 2
          return <g className={`desk-item ${isSelected ? 'is-selected' : ''} ${hasIssue ? 'has-issue' : ''}`} key={item.id} onPointerDown={(event) => startDrag(event, item)} role="button" tabIndex={0} aria-label={`${definition.label}，${item.widthMm}乘${item.heightMm}毫米`}>
            <g transform={`translate(${cx} ${cy}) rotate(${rendered.rotation})`}>
              <rect x={-rendered.widthMm / 2} y={-rendered.heightMm / 2} width={rendered.widthMm} height={rendered.heightMm} rx={Math.min(24, rendered.heightMm / 5)} fill={definition.color} filter="url(#item-shadow)" />
              <rect className="item-inner-line" x={-rendered.widthMm / 2 + 12} y={-rendered.heightMm / 2 + 12} width={Math.max(0, rendered.widthMm - 24)} height={Math.max(0, rendered.heightMm - 24)} rx={12} fill="none" />
              <text x="0" y="5" textAnchor="middle" fill="#1f2e44" fontWeight="700" fontSize={Math.max(18, Math.min(32, rendered.widthMm / 16))}>{definition.shortLabel}</text>
              <text x="0" y="30" textAnchor="middle" fill="#44546b" fontSize="16">{rendered.widthMm} × {rendered.heightMm}</text>
            </g>
            {isSelected && <rect className="selection-box" x={getItemBounds(rendered).left - 8} y={getItemBounds(rendered).top - 8} width={getItemBounds(rendered).width + 16} height={getItemBounds(rendered).height + 16} rx="12" fill="none" />}
            {hasIssue && <g transform={`translate(${Math.max(18, getItemBounds(rendered).right - 4)} ${Math.max(18, getItemBounds(rendered).top - 4)}`}><circle r="18" fill="#ef6a6a" /><text textAnchor="middle" y="7" fill="white" fontSize="22" fontWeight="700">!</text></g>}
          </g>
        })}
        {plan.items.length === 0 && <g><circle cx={plan.deskWidthMm / 2} cy={plan.deskHeightMm / 2 - 12} r="32" fill="#e8eef6" /><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 2} textAnchor="middle" fill="#8493a8" fontSize="22">+</text><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 48} textAnchor="middle" fill="#8493a8" fontSize="22">从左侧添加第一件设备</text></g>}
      </svg>
      <div className="canvas-legend"><span><i className="legend-dot clear-dot" /> 可用空间</span><span><i className="legend-dot issue-dot" /> 冲突 / 越界</span><span className="canvas-scale">网格：50 mm</span></div>
    </div>
  )
}
