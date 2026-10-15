/**
 * Seam two: turning a message's content into the write a clipboard host
 * receives.
 *
 * The pure payload decides *what* the clipboard carries; this seam decides
 * how* it is handed over, and that is where the two hard requirements live:
 *
 * - A plain-text message must reach the host as a `writeText` call carrying
 *   exactly the string the host's own copy control writes. Nothing may take a
 *   different route.
 * - Image bytes are read asynchronously, and a browser only accepts custom
 *   clipboard data assembled in the event's synchronous phase. The way through
 *   is that a `ClipboardItem` accepts a promise for its data, so the reads can
 *   be *started* synchronously while the host awaits them. These tests assert
 *   that start-before-any-await property directly, because it is invisible
 *   after the fact and losing it is how attachments get dropped.
 *
 * A copy never quietly drops an attachment to sidestep that: when the
 * structured write cannot happen, the text still goes out and the outcome says,
 * distinguishably, that attachments were left behind, and for the platform's
 * own reason (a clipboard item is keyed by media type), the images that could
 * not ride along are named by count.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/clipboard
 */

import type { ClipboardImage, ClipboardWriter } from '../../../src/client/features/message-copy/clipboard.ts'
import { describe, expect, it, vi } from 'vitest'
import {
  copyMessage,
  eventWriter,
  planCopy,
} from '../../../src/client/features/message-copy/clipboard.ts'
import { messageContent } from '../../../src/client/features/message-copy/payload.ts'

const IMAGE_ONE = { attachmentId: 'sha256:one', mediaType: 'image/png', bytes: 8, width: 4, height: 2 }
const IMAGE_TWO = { attachmentId: 'sha256:two', mediaType: 'image/jpeg', bytes: 16, width: 8, height: 4 }
const FILE_ONE = { attachmentId: 'sha256:three', name: 'notes.txt', bytes: 312 }

/** What one structured write received. */
interface RecordedWrite {
  readonly text: string
  readonly images: readonly ClipboardImage[]
}

/** A writer that records calls and reports the outcome a test asks for. */
function fakeWriter(options: {
  canWriteItems?: boolean
  itemsSucceed?: boolean
  textSucceeds?: boolean
  eventSink?: boolean
} = {}): ClipboardWriter & {
  readonly texts: string[]
  readonly writes: RecordedWrite[]
  readonly eventTexts: string[]
} {
  const texts: string[] = []
  const writes: RecordedWrite[] = []
  const eventTexts: string[] = []
  return {
    canWriteItems: options.canWriteItems ?? true,
    texts,
    writes,
    eventTexts,
    writeText: (text) => {
      texts.push(text)
      return Promise.resolve(options.textSucceeds ?? true)
    },
    // The real host awaits the item's data before it accepts the write, so a
    // rejected byte read fails the write here too.
    writeItems: async (text, images) => {
      writes.push({ text, images: [...images] })
      const settled = await Promise.allSettled(images.map(image => image.bytes))
      if (settled.some(result => result.status === 'rejected'))
        return false
      return options.itemsSucceed ?? true
    },
    ...(options.eventSink === true
      ? {
          writeEventText: (text: string) => {
            eventTexts.push(text)
            return true
          },
        }
      : {}),
  }
}

describe('planning the write', () => {
  it('carries every image when their media types differ', () => {
    const plan = planCopy(messageContent([
      { type: 'image', attachment: IMAGE_ONE },
      { type: 'image', attachment: IMAGE_TWO },
      { type: 'text', text: 'two kinds' },
    ]))

    expect(plan.images).toEqual([IMAGE_ONE, IMAGE_TWO])
    expect(plan.omitted).toEqual([])
    expect(plan.text).toBe('two kinds')
  })

  it('names the images a clipboard flavor cannot hold a second of, instead of dropping them', () => {
    // A clipboard item's image flavors are keyed by media type, so a second
    // image of a type already carried has nowhere to go. That is a platform
    // limit, and the plan reports it so the row can say which attachment was
    // left behind, never a silent drop.
    const second = { ...IMAGE_ONE, attachmentId: 'sha256:five' }
    const plan = planCopy(messageContent([
      { type: 'image', attachment: IMAGE_ONE },
      { type: 'image', attachment: second },
      { type: 'image', attachment: IMAGE_TWO },
    ]))

    expect(plan.images).toEqual([IMAGE_ONE, IMAGE_TWO])
    expect(plan.omitted).toEqual([second])
  })
})

describe('a message with no images', () => {
  it('goes out as one plain-text write, exactly as the host writes it today', async () => {
    const writer = fakeWriter()
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }]),
      () => Promise.reject(new Error('no image bytes should be read')),
      writer,
    )

    expect(writer.texts).toEqual(['hello world'])
    expect(writer.writes).toEqual([])
    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
  })

  it('reports a failed text write instead of claiming success', async () => {
    const writer = fakeWriter({ textSucceeds: false })
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'hi' }]),
      () => Promise.reject(new Error('unused')),
      writer,
    )

    expect(outcome).toEqual({ status: 'failed' })
  })

  it('still writes text when the message is empty, so a copy of nothing is still a copy', async () => {
    const writer = fakeWriter()
    await copyMessage(messageContent([]), () => Promise.reject(new Error('unused')), writer)

    expect(writer.texts).toEqual([''])
  })

  it('carries a file message as its name and size, which needs no attachment channel', async () => {
    const writer = fakeWriter()
    const outcome = await copyMessage(
      messageContent([{ type: 'file', attachment: FILE_ONE }, { type: 'text', text: 'look' }]),
      () => Promise.reject(new Error('a file has no readable bytes')),
      writer,
    )

    expect(writer.texts).toEqual(['notes.txt (312B)\nlook'])
    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
  })
})

describe('a message with images', () => {
  it('starts every byte read before its first await, not after the write settles', () => {
    const writer = fakeWriter()
    const readImage = vi.fn(() => Promise.resolve(new Blob(['x'], { type: 'image/png' })))

    // Deliberately not awaited: the reads must already be in flight in the same
    // synchronous turn as the copy, because that turn is the browser's window
    // for accepting custom clipboard data.
    const pending = copyMessage(
      messageContent([{ type: 'image', attachment: IMAGE_ONE }, { type: 'text', text: 'look' }]),
      readImage,
      writer,
    )

    expect(readImage).toHaveBeenCalledTimes(1)
    expect(readImage).toHaveBeenCalledWith(IMAGE_ONE)
    return pending
  })

  it('hands the host the text once and one image entry per image, in attachment order', async () => {
    const writer = fakeWriter()
    await copyMessage(
      messageContent([
        { type: 'text', text: 'both' },
        { type: 'image', attachment: IMAGE_ONE },
        { type: 'file', attachment: FILE_ONE },
        { type: 'image', attachment: IMAGE_TWO },
      ]),
      reference => Promise.resolve(new Blob([reference.attachmentId], { type: reference.mediaType })),
      writer,
    )

    expect(writer.texts).toEqual([])
    expect(writer.writes).toHaveLength(1)
    const [write] = writer.writes
    expect(write?.text).toBe('notes.txt (312B)\nboth')
    expect(write?.images.map(image => image.mediaType)).toEqual(['image/png', 'image/jpeg'])
    // The promises handed to the host resolve to that image's own bytes.
    await expect(write?.images[1]?.bytes).resolves.toBeInstanceOf(Blob)
  })

  it('reports the attachments as included only when the structured write landed', async () => {
    const writer = fakeWriter()
    const outcome = await copyMessage(
      messageContent([{ type: 'image', attachment: IMAGE_ONE }]),
      () => Promise.resolve(new Blob([])),
      writer,
    )

    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: true, omittedImages: 0 })
  })

  it('counts the images the clipboard could not hold, even when the write landed', async () => {
    const second = { ...IMAGE_ONE, attachmentId: 'sha256:five' }
    const writer = fakeWriter()
    const outcome = await copyMessage(
      messageContent([
        { type: 'image', attachment: IMAGE_ONE },
        { type: 'image', attachment: second },
      ]),
      () => Promise.resolve(new Blob([])),
      writer,
    )

    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: true, omittedImages: 1 })
  })

  it('falls back to the text alone and says so when the structured write is rejected', async () => {
    const writer = fakeWriter({ itemsSucceed: false })
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'see' }, { type: 'image', attachment: IMAGE_ONE }]),
      () => Promise.resolve(new Blob([])),
      writer,
    )

    expect(outcome).toEqual({ status: 'text-only', reason: 'denied' })
    expect(writer.texts).toEqual(['see'])
  })

  it('falls back to the text alone and says so when the host cannot carry items at all', async () => {
    const writer = fakeWriter({ canWriteItems: false })
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'see' }, { type: 'image', attachment: IMAGE_ONE }]),
      () => { throw new Error('no read may happen without a structured write') },
      writer,
    )

    expect(outcome).toEqual({ status: 'text-only', reason: 'unsupported' })
    expect(writer.texts).toEqual(['see'])
    expect(writer.writes).toEqual([])
  })

  it('reports a total failure when neither route could write', async () => {
    const writer = fakeWriter({ canWriteItems: false, textSucceeds: false })
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'see' }, { type: 'image', attachment: IMAGE_ONE }]),
      () => Promise.reject(new Error('unused')),
      writer,
    )

    expect(outcome).toEqual({ status: 'failed' })
  })

  it('reports a failure when an image read rejects, rather than reporting success', async () => {
    const writer = fakeWriter()
    const outcome = await copyMessage(
      messageContent([{ type: 'image', attachment: IMAGE_ONE }]),
      () => Promise.reject(new Error('bytes unavailable')),
      writer,
    )

    expect(outcome).toEqual({ status: 'text-only', reason: 'denied' })
    expect(writer.texts).toEqual([''])
  })
})

describe('the event channel writer', () => {
  /** A writer recording which route carried the text. */
  function baseWriter() {
    const asyncTexts: string[] = []
    const items: string[] = []
    return {
      asyncTexts,
      items,
      writer: {
        canWriteItems: true,
        writeText: (text: string) => {
          asyncTexts.push(text)
          return Promise.resolve(true)
        },
        writeItems: (text: string) => {
          items.push(text)
          return Promise.resolve(true)
        },
      } satisfies ClipboardWriter,
    }
  }

  it('fills the event\'s own synchronous channel with the plain text', () => {
    const setData = vi.fn()
    const { writer } = baseWriter()
    const wrapped = eventWriter(writer, { setData })

    expect(wrapped.writeEventText?.('selected text')).toBe(true)
    expect(setData).toHaveBeenCalledWith('text/plain', 'selected text')
  })

  it('reports failure instead of throwing when the host refuses the channel', () => {
    const { writer } = baseWriter()
    const wrapped = eventWriter(writer, {
      setData: () => { throw new Error('read-only') },
    })

    expect(wrapped.writeEventText?.('selected text')).toBe(false)
  })

  it('keeps the structured write available alongside the event channel', async () => {
    const { writer, items } = baseWriter()
    const wrapped = eventWriter(writer, { setData: () => {} })

    await expect(wrapped.writeItems('', [
      { mediaType: 'image/png', bytes: Promise.resolve(new Blob([])) },
    ])).resolves.toBe(true)
    expect(items).toEqual([''])
  })

  it('keeps the asynchronous text write available as the fallback', async () => {
    const { writer, asyncTexts } = baseWriter()
    const wrapped = eventWriter(writer, { setData: () => false })

    await expect(wrapped.writeText('selected text')).resolves.toBe(true)
    expect(asyncTexts).toEqual(['selected text'])
  })

  it('carries the same text the event did, so both routes agree', async () => {
    const setData = vi.fn()
    const { writer, items } = baseWriter()
    const wrapped = eventWriter(writer, { setData })

    await copyMessage(
      messageContent([{ type: 'text', text: 'both routes' }]),
      () => Promise.reject(new Error('no image')),
      wrapped,
    )

    expect(setData).toHaveBeenCalledWith('text/plain', 'both routes')
    // The event channel already carried the text, so no second write happens.
    expect(items).toEqual([])
  })
})

describe('a copy raised by the document itself', () => {
  it('writes the text through the event synchronously, before any byte read settles', () => {
    const writer = fakeWriter({ eventSink: true })
    const pending = copyMessage(
      messageContent([
        { type: 'file', attachment: FILE_ONE },
        { type: 'image', attachment: IMAGE_ONE },
        { type: 'text', text: 'selected' },
      ]),
      () => Promise.resolve(new Blob([])),
      writer,
    )

    // The event's own text is what a browser accepts without awaiting anything;
    // it is in place before the copy call has awaited a single read.
    expect(writer.eventTexts).toEqual(['notes.txt (312B)\nselected'])
    return pending
  })

  it('still attempts the images in the same synchronous turn', async () => {
    const writer = fakeWriter({ eventSink: true })
    const readImage = vi.fn(() => Promise.resolve(new Blob([])))
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'selected' }, { type: 'image', attachment: IMAGE_ONE }]),
      readImage,
      writer,
    )

    expect(readImage).toHaveBeenCalledTimes(1)
    expect(writer.writes).toHaveLength(1)
    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: true, omittedImages: 0 })
  })

  it('keeps the text and names the loss when the image write is refused', async () => {
    const writer = fakeWriter({ eventSink: true, itemsSucceed: false })
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'selected' }, { type: 'image', attachment: IMAGE_ONE }]),
      () => Promise.resolve(new Blob([])),
      writer,
    )

    expect(writer.eventTexts).toEqual(['selected'])
    expect(outcome).toEqual({ status: 'text-only', reason: 'denied' })
    // The event text stands on its own; a second text write would be redundant.
    expect(writer.texts).toEqual([])
  })

  it('does not touch the async text path when the event already carried it', async () => {
    const writer = fakeWriter({ eventSink: true })
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'selected' }]),
      () => Promise.reject(new Error('no image')),
      writer,
    )

    expect(writer.eventTexts).toEqual(['selected'])
    expect(writer.texts).toEqual([])
    expect(writer.writes).toEqual([])
    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
  })

  it('falls back to the asynchronous text write when the event offered no channel', async () => {
    const writer: ClipboardWriter & { texts: string[] } = {
      canWriteItems: true,
      texts: [],
      writeText: (text) => {
        writer.texts.push(text)
        return Promise.resolve(true)
      },
      writeItems: () => Promise.resolve(false),
      writeEventText: () => false,
    }
    const outcome = await copyMessage(
      messageContent([{ type: 'text', text: 'selected' }]),
      () => Promise.reject(new Error('no image')),
      writer,
    )

    expect(writer.texts).toEqual(['selected'])
    expect(outcome).toEqual({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
  })
})
