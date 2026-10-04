import { describe, expect, it } from 'vitest'
import { createItem } from '../../../shared/models'
import {
  beginDragSession,
  moveCanvasItem,
  moveDragSession,
  rotateCanvasItem,
  shouldCommitDrag,
} from '../canvasViewModel'

describe('canvas module', () => {
  it('moves and rotates the requested item without changing other items', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const moved = moveCanvasItem([first, second], first.id, 320, 180)
    const rotated = rotateCanvasItem(moved, first.id, -15)
    expect(rotated[0]).toMatchObject({ x: 320, y: 180, rotation: 345 })
    expect(rotated[1]).toEqual(second)
  })
})

describe('drag session', () => {
  it('records the grab offset and origin when a drag begins', () => {
    const item = { ...createItem('monitor'), x: 100, y: 200 }
    const session = beginDragSession(item, 7, { x: 130, y: 260 })
    expect(session).toMatchObject({
      itemId: item.id,
      pointerId: 7,
      offsetX: 30,
      offsetY: 60,
      originX: 100,
      originY: 200,
      x: 100,
      y: 200,
    })
  })

  it('previews the pointer position during the drag without touching the item', () => {
    const item = { ...createItem('monitor'), x: 100, y: 200 }
    const session = beginDragSession(item, 1, { x: 110, y: 210 })
    const moved = moveDragSession(session, { x: 160, y: 235 })
    expect(moved).toMatchObject({ x: 150, y: 225, originX: 100, originY: 200 })
    expect(item).toMatchObject({ x: 100, y: 200 })
  })

  it('does not commit a drag that never actually moved', () => {
    const item = { ...createItem('monitor'), x: 100, y: 200 }
    const session = beginDragSession(item, 1, { x: 110, y: 210 })
    expect(shouldCommitDrag(session)).toBe(false)
    const backToOrigin = moveDragSession(session, { x: 110, y: 210 })
    expect(shouldCommitDrag(backToOrigin)).toBe(false)
  })

  it('commits only the final position of a completed drag', () => {
    const item = { ...createItem('monitor'), x: 100, y: 200 }
    let session = beginDragSession(item, 1, { x: 110, y: 210 })
    session = moveDragSession(session, { x: 300, y: 400 })
    session = moveDragSession(session, { x: 210, y: 310 })
    expect(shouldCommitDrag(session)).toBe(true)
    expect({ x: session.x, y: session.y }).toEqual({ x: 200, y: 300 })
  })
})
