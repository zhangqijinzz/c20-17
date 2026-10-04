import { normalizeRotation } from '../../shared/layoutRules'
import type { DeskItem } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => item.id === id ? updater(item) : item)
}

export interface DragSession {
  id: string
  offsetX: number
  offsetY: number
  originX: number
  originY: number
  x: number
  y: number
}

const dragCommitThresholdMm = 0.5

export function beginDragSession(item: DeskItem, pointX: number, pointY: number): DragSession {
  return {
    id: item.id,
    offsetX: pointX - item.x,
    offsetY: pointY - item.y,
    originX: item.x,
    originY: item.y,
    x: item.x,
    y: item.y,
  }
}

export function updateDragSession(session: DragSession, pointX: number, pointY: number): DragSession {
  return { ...session, x: pointX - session.offsetX, y: pointY - session.offsetY }
}

export function shouldCommitDrag(session: DragSession): boolean {
  return Math.abs(session.x - session.originX) > dragCommitThresholdMm
    || Math.abs(session.y - session.originY) > dragCommitThresholdMm
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x, y }))
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}
