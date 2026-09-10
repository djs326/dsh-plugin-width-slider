// @vitest-environment jsdom
/**
 * Role-based transcript arrivals: the host flow-kind → role mapping that decides
 * how a row comes in, and the class set the engine's cleanup pass must cover.
 */
import { describe, expect, it } from 'vitest'
import {
  ENTRANCE_CLASSES, ROLE_CLASSES, ROLE_PROCESS_CLASS, ROLE_USER_CLASS, roleOf, STYLE_CLASSES, styleClass,
} from '../src/client/motion/motion.ts'

/** A transcript row carrying the host-published flow kind (absent = not published). */
function row(kind?: string): HTMLElement {
  const el = document.createElement('div')
  if (kind !== undefined) el.dataset.chatFlowKind = kind
  return el
}

describe('roleOf', () => {
  it('gives the user message the user role', () => {
    expect(roleOf(row('user'))).toBe('user')
  })

  it('gives a mid-turn interjection the user role', () => {
    expect(roleOf(row('steering'))).toBe('user')
  })

  it('leaves the assistant prose on the chosen style', () => {
    expect(roleOf(row('assistant-step'))).toBeUndefined()
  })

  it('leaves a row without a published kind on the chosen style', () => {
    expect(roleOf(row())).toBeUndefined()
  })

  it.each([
    'tool-call',
    'turn-process',
    'turn-tail',
    'context',
    'compaction',
  ])('treats %s as process output', (kind) => {
    expect(roleOf(row(kind))).toBe('process')
  })

  it('defaults an unrecognised kind to process output', () => {
    // Forward-compatible: a kind the host adds later must not silently inherit
    // the prose entrance and turn every new surface into a slideshow.
    expect(roleOf(row('some-future-kind'))).toBe('process')
  })

  it('does not match the anchor key node kind', () => {
    // The anchor key spells the user rows `input-message`, but that is the node
    // kind inside the key, never the flow kind - matching it would misread rows.
    expect(roleOf(row('input-message'))).toBe('process')
  })
})

describe('entrance classes', () => {
  it('records each role with its own class', () => {
    expect(ROLE_USER_CLASS).toBe('dsu-motion-role-user')
    expect(ROLE_PROCESS_CLASS).toBe('dsu-motion-role-process')
    expect(ROLE_CLASSES).toEqual([ROLE_USER_CLASS, ROLE_PROCESS_CLASS])
  })

  it('does not collide with the per-style classes', () => {
    for (const cls of ROLE_CLASSES) {
      expect(STYLE_CLASSES).not.toContain(cls)
    }
  })

  it('cleans up both the style and the role classes', () => {
    for (const cls of [...STYLE_CLASSES, ...ROLE_CLASSES]) {
      expect(ENTRANCE_CLASSES).toContain(cls)
    }
    // The style ids keep their documented class shape.
    expect(ENTRANCE_CLASSES).toContain(styleClass('fade-up'))
  })
})
