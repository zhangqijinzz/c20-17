import { normalizeRotation } from '../../shared/layoutRules'
import type { DeskItem } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => item.id === id ? updater(item) : item)
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x, y }))
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}

export interface CanvasPoint {
  x: number
  y: number
}

/**
 * 一次拖动的完整会话。拖动期间的所有坐标都只是预览，
 * 只有会话正常结束（pointerup）时才允许把 x/y 提交进方案。
 */
export interface DragSession {
  itemId: string
  pointerId: number
  offsetX: number
  offsetY: number
  originX: number
  originY: number
  x: number
  y: number
}

export function beginDragSession(item: DeskItem, pointerId: number, point: CanvasPoint): DragSession {
  return {
    itemId: item.id,
    pointerId,
    offsetX: point.x - item.x,
    offsetY: point.y - item.y,
    originX: item.x,
    originY: item.y,
    x: item.x,
    y: item.y,
  }
}

export function moveDragSession(session: DragSession, point: CanvasPoint): DragSession {
  return { ...session, x: point.x - session.offsetX, y: point.y - session.offsetY }
}

/** 只有位置相对起点真正变化过，正常结束的拖动才需要写回方案。 */
export function shouldCommitDrag(session: DragSession): boolean {
  return session.x !== session.originX || session.y !== session.originY
}
