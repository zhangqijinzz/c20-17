import { describe, expect, it } from 'vitest'
import { createItem } from '../../../shared/models'
import { beginDragSession, moveCanvasItem, rotateCanvasItem, shouldCommitDrag, updateDragSession } from '../canvasViewModel'

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
  it('tracks the pointer from the grab point while keeping the origin for cancel', () => {
    const item = { ...createItem('monitor'), x: 100, y: 80 }
    const session = beginDragSession(item, 130, 110)
    expect(session).toMatchObject({ id: item.id, originX: 100, originY: 80, x: 100, y: 80 })

    const moved = updateDragSession(session, 230, 260)
    expect(moved).toMatchObject({ x: 200, y: 230, originX: 100, originY: 80 })
    expect(shouldCommitDrag(moved)).toBe(true)
  })

  it('does not treat a press without real movement as a completed drag', () => {
    const item = createItem('keyboard')
    const session = beginDragSession(item, item.x + 10, item.y + 10)
    expect(shouldCommitDrag(session)).toBe(false)

    const jitter = updateDragSession(session, item.x + 10.2, item.y + 10.2)
    expect(shouldCommitDrag(jitter)).toBe(false)
  })
})
