/**
 * Seam five: the concrete ends of the copy, where the pure decision meets the
 * browser and the session.
 *
 * `clipboard.ts` decides *what* happens; these adapters are *how* it reaches
 * the host's own APIs, and each has a failure mode that silently degrades a
 * copy if it is guessed wrong:
 *
 * - The structured write must offer real image bytes. A `ClipboardItem` whose
 *   value is a promise is what lets the byte reads start in the event's
 *   synchronous phase, so the adapter must pass the pending promise through
 *   rather than await it first. If it awaited, the browser would already have
 *   given up on the custom data and the copy would fall back to text.
 * - The plain-text write must be the host's own helper, unchanged. A
 *   text-only message has to copy byte-for-byte what it copied before this
 *   feature existed, and the only way to guarantee that is to call the same
 *   function the host calls.
 * - An image's bytes arrive from the session as a `Uint8Array`; the blob's type
 *   must be the verified media type or a paste cannot recognize the image.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/host
 */

import type { ClipboardEnvironment } from '../../../src/client/features/message-copy/host.ts'
import type { ImageReference } from '../../../src/client/features/message-copy/payload.ts'
import { describe, expect, it, vi } from 'vitest'

// The plain-text path is the host's own helper, which lives in a browser
// package this Node test environment cannot load. Substituting it is what makes
// the text path observable; the helper's own behavior is covered by the host's
// tests.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  writeClipboard: () => Promise.resolve(true),
}))

// Imported after the mock so the substitution is in place.
const {
  clipboardEnvironment,
  navigatorWriter,
  readImageBytes,
} = await import('../../../src/client/features/message-copy/host.ts')

const IMAGE = {
  attachmentId: 'sha256:one',
  mediaType: 'image/png',
  bytes: 8,
  width: 4,
  height: 2,
} satisfies ImageReference

/** One recorded `ClipboardItem` construction. */
interface RecordedItem {
  readonly entries: [string, unknown][]
}

/**
 * A stand-in browser clipboard.
 * @param options - which capabilities to provide and whether writes succeed.
 * @param options.writeTextSucceeds - whether the host's own text write succeeds.
 * @param options.hasWriteItems - whether the async clipboard exposes `write`.
 * @param options.hasClipboardItem - whether the item constructor exists.
 * @param options.writeThrows - whether the structured write is refused.
 * @returns the environment plus the calls it recorded.
 */
function fakeEnvironment(options: {
  writeTextSucceeds?: boolean
  hasWriteItems?: boolean
  hasClipboardItem?: boolean
  writeThrows?: boolean
} = {}): ClipboardEnvironment & {
  readonly writeTextCalls: string[]
  readonly writeCalls: RecordedItem[][]
  readonly items: RecordedItem[]
} {
  const writeTextCalls: string[] = []
  const writeCalls: RecordedItem[][] = []
  const items: RecordedItem[] = []
  return {
    writeText: (text) => {
      writeTextCalls.push(text)
      return Promise.resolve(options.writeTextSucceeds ?? true)
    },
    writeItems: (options.hasWriteItems ?? true)
      ? (batch) => {
          writeCalls.push(batch as RecordedItem[])
          return options.writeThrows === true
            ? Promise.reject(new Error('denied'))
            : Promise.resolve()
        }
      : undefined,
    ClipboardItem: (options.hasClipboardItem ?? true)
      ? class {
        constructor(entries: Record<string, unknown>) {
          const record = Object.entries(entries) as [string, unknown][]
          items.push({ entries: record })
          Object.assign(this, Object.fromEntries(record))
        }
      } as never
      : undefined,
    writeTextCalls,
    writeCalls,
    items,
  }
}

describe('the navigator writer', () => {
  it('reports that it can carry items only when both the async clipboard and ClipboardItem exist', () => {
    expect(navigatorWriter(fakeEnvironment()).canWriteItems).toBe(true)
    expect(navigatorWriter(fakeEnvironment({ hasClipboardItem: false })).canWriteItems).toBe(false)
    expect(navigatorWriter(fakeEnvironment({ hasWriteItems: false })).canWriteItems).toBe(false)
  })

  it('writes text through the host\'s own helper and reports acceptance', async () => {
    const environment = fakeEnvironment()

    await expect(navigatorWriter(environment).writeText('hello')).resolves.toBe(true)
    expect(environment.writeTextCalls).toEqual(['hello'])
  })

  it('reports a refused text write instead of claiming success', async () => {
    const environment = fakeEnvironment({ writeTextSucceeds: false })

    await expect(navigatorWriter(environment).writeText('hello')).resolves.toBe(false)
  })

  it('offers one clipboard item with the text and each image as its pending bytes', async () => {
    const environment = fakeEnvironment()
    const bytes = Promise.resolve(new Blob(['x'], { type: 'image/png' }))

    await expect(navigatorWriter(environment).writeItems('see', [
      { mediaType: 'image/png', bytes },
    ])).resolves.toBe(true)

    expect(environment.items).toHaveLength(1)
    expect(environment.items[0]?.entries.map(([type]) => type)).toEqual(['text/plain', 'image/png'])
    // The promise reaches the item unchanged: awaiting it here would move the
    // read out of the browser's synchronous acceptance window.
    expect(environment.items[0]?.entries[1]?.[1]).toBe(bytes)
    expect(environment.writeCalls).toHaveLength(1)
  })

  it('reports a refused structured write instead of claiming attachments landed', async () => {
    const environment = fakeEnvironment({ writeThrows: true })

    await expect(navigatorWriter(environment).writeItems('see', [
      { mediaType: 'image/png', bytes: Promise.resolve(new Blob([])) },
    ])).resolves.toBe(false)
  })

  it('refuses a structured write when the host cannot carry items, without touching the clipboard', async () => {
    const environment = fakeEnvironment({ hasWriteItems: false })

    await expect(navigatorWriter(environment).writeItems('see', [
      { mediaType: 'image/png', bytes: Promise.resolve(new Blob([])) },
    ])).resolves.toBe(false)
    expect(environment.writeCalls).toEqual([])
  })

  it('offers no text entry when the message has none', async () => {
    const environment = fakeEnvironment()

    await navigatorWriter(environment).writeItems('', [
      { mediaType: 'image/png', bytes: Promise.resolve(new Blob([])) },
    ])

    expect(environment.items[0]?.entries.map(([type]) => type)).toEqual(['image/png'])
  })
})

describe('the environment assembled from page globals', () => {
  it('passes the host text writer through and reports the structured write when present', () => {
    const write = vi.fn(() => Promise.resolve())
    const environment = clipboardEnvironment({
      navigator: { clipboard: { write } },
      ClipboardItem: class {},
    })

    expect(typeof environment.writeText).toBe('function')
    expect(environment.writeItems).toBeDefined()
    expect(typeof environment.ClipboardItem).toBe('function')
  })

  it('reports no structured write when the page has no clipboard', () => {
    const environment = clipboardEnvironment({
      navigator: {},
      ClipboardItem: class {},
    })

    expect(environment.writeItems).toBeUndefined()
  })

  it('reports an absent page rather than throwing inside a copy', () => {
    const environment = clipboardEnvironment(undefined)

    expect(environment.writeItems).toBeUndefined()
    expect(environment.ClipboardItem).toBeUndefined()
    // The text write is the host's own helper and is always available.
    expect(typeof environment.writeText).toBe('function')
  })

  it('ignores a non-constructor ClipboardItem global', () => {
    expect(clipboardEnvironment({ ClipboardItem: { version: 1 } }).ClipboardItem).toBeUndefined()
  })

  it('keeps the host\'s own text helper as the text writer in every case', () => {
    // Whatever the page provides, the text path is the host's, so a plain
    // message copies exactly what it copied before this feature existed.
    const environments = [
      clipboardEnvironment(undefined),
      clipboardEnvironment({ navigator: {}, ClipboardItem: class {} }),
    ]
    for (const environment of environments)
      expect(typeof environment.writeText).toBe('function')
  })
})

describe('reading one image back', () => {
  it('returns the image bytes as a blob carrying the verified media type', async () => {
    const readAttachment = vi.fn(() => Promise.resolve({
      ok: true,
      value: { attachment: IMAGE, data: Uint8Array.of(1, 2, 3) },
    })) as never

    const blob = await readImageBytes({ readAttachment }, IMAGE)

    expect(readAttachment).toHaveBeenCalledWith('sha256:one')
    expect(blob.type).toBe('image/png')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('throws the host\'s own failure rather than returning empty bytes', async () => {
    const readAttachment = vi.fn(() => Promise.resolve({
      ok: false,
      error: { code: 'session/attachment-invalid', message: 'not referenced' },
    })) as never

    await expect(readImageBytes({ readAttachment }, IMAGE))
      .rejects
      .toThrow(/session\/attachment-invalid/)
  })

  it('refuses when no session is bound, so a copy degrades instead of writing an empty image', async () => {
    await expect(readImageBytes(undefined, IMAGE)).rejects.toThrow(/session/i)
  })
})
