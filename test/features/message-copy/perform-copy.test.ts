/**
 * Seam nine: one copy, wherever it was raised from, reports once.
 *
 * Both routes into a copy end in the same place: the row's own button and a
 * text selection both resolve to a mounted row and ask it to copy. The ticket's
 * rule is that a degraded copy is *said*, not swallowed, and the failure mode
 * this seam exists to prevent is precisely that only one route remembers to say
 * it. Putting the report inside the single copy action means a route that
 * forgets is not expressible.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/perform-copy
 */

import type { ClipboardWriter, CopyOutcome } from '../../../src/client/features/message-copy/clipboard.ts'
import type { CopySource } from '../../../src/client/features/message-copy/row-registry.ts'
import { describe, expect, it, vi } from 'vitest'
import { messageContent } from '../../../src/client/features/message-copy/payload.ts'
import { performCopy } from '../../../src/client/features/message-copy/perform-copy.ts'

const IMAGE = { attachmentId: 'sha256:one', mediaType: 'image/png', bytes: 8, width: 4, height: 2 }

/**
 * One published row.
 * @param notices - the list this row's notice reporter appends to.
 * @param content - the row's message content blocks.
 * @returns the row's published source.
 */
function source(
  notices: CopyOutcome[],
  content: readonly unknown[] = [{ type: 'text', text: 'hello' }],
): CopySource {
  return {
    key: '4:userm-1',
    content: messageContent(content),
    readImage: () => Promise.resolve(new Blob([])),
    report: (outcome: CopyOutcome) => { notices.push(outcome) },
  }
}

/** A writer whose text write succeeds. */
function writer(overrides: Partial<ClipboardWriter> = {}): ClipboardWriter {
  return {
    canWriteItems: true,
    writeText: () => Promise.resolve(true),
    writeItems: () => Promise.resolve(true),
    ...overrides,
  }
}

describe('performing one copy from the row button', () => {
  it('reports the outcome so the row can tell the user', async () => {
    const notices: CopyOutcome[] = []
    const outcome = await performCopy(source(notices), undefined, writer())

    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
    expect(notices).toEqual([outcome])
  })

  it('reports a degraded copy, so a button press cannot lose attachments silently', async () => {
    const notices: CopyOutcome[] = []
    const outcome = await performCopy(
      source(notices, [{ type: 'text', text: 'see' }, { type: 'image', attachment: IMAGE }]),
      undefined,
      writer({ writeItems: () => Promise.resolve(false) }),
    )

    expect(outcome).toEqual({ status: 'text-only', reason: 'denied' })
    expect(notices).toEqual([outcome])
  })

  it('reports a total failure instead of throwing out of the call', async () => {
    const notices: CopyOutcome[] = []
    const outcome = await performCopy(
      source(notices),
      undefined,
      writer({ writeText: () => Promise.reject(new Error('clipboard exploded')) }),
    )

    expect(outcome).toEqual({ status: 'failed' })
    expect(notices).toEqual([{ status: 'failed' }])
  })
})

describe('performing one copy from a text selection', () => {
  it('fills the event channel synchronously and still reports once', async () => {
    const notices: CopyOutcome[] = []
    const setData = vi.fn()
    const outcome = await performCopy(source(notices), { setData }, writer())

    expect(setData).toHaveBeenCalledWith('text/plain', 'hello')
    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
    expect(notices).toEqual([outcome])
  })

  it('reports the same content the button would, for the same message', async () => {
    const buttonNotices: CopyOutcome[] = []
    const selectionNotices: CopyOutcome[] = []
    const blocks = [{ type: 'file' as const, attachment: { attachmentId: 'sha256:f', name: 'a.txt', bytes: 10 } }, { type: 'text' as const, text: 'body' }]

    const fromButton = await performCopy(source(buttonNotices, blocks), undefined, writer())
    const setData = vi.fn()
    const fromSelection = await performCopy(source(selectionNotices, blocks), { setData }, writer())

    expect(fromSelection).toEqual(fromButton)
    expect(setData).toHaveBeenCalledWith('text/plain', 'a.txt (10B)\nbody')
    expect(selectionNotices).toEqual(buttonNotices)
  })
})
