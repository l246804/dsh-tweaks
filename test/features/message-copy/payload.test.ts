/**
 * Seam one: the clipboard payload, as a pure function of a message's content.
 *
 * The user message row is the only place a message's durable attachment
 * references exist, so this module turns that row's own `node.data.content`
 * into the payload the clipboard receives. Three claims are worth testing here
 * and nowhere else:
 *
 * - A text-only message produces exactly the string the host's copy button
 *   writes today. That is the regression red line: shadowing the row must not
 *   change what a plain message copies to.
 * - Attachments keep the order the row presents them in.
 * - An image and a file are treated differently, because only an image's bytes
 *   are readable back through the session.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/payload
 */

import { describe, expect, it } from 'vitest'
import {
  clipboardText,
  fileDescription,
  formatFileSize,
  imageReferences,
  messageContent,
} from '../../../src/client/features/message-copy/payload.ts'

/** One durable image reference, shaped as the session log carries it. */
const IMAGE_ONE = {
  attachmentId: 'sha256:one',
  mediaType: 'image/png',
  bytes: 2_048,
  width: 32,
  height: 16,
}

/** A second image, distinct from the first so order is observable. */
const IMAGE_TWO = {
  attachmentId: 'sha256:two',
  mediaType: 'image/jpeg',
  bytes: 4_096,
  width: 64,
  height: 32,
}

/** One durable file reference. */
const FILE_ONE = { attachmentId: 'sha256:three', name: 'report.pdf', bytes: 1_536 }

/** A second durable file reference. */
const FILE_TWO = { attachmentId: 'sha256:four', name: 'notes.txt', bytes: 312 }

describe('message content', () => {
  it('joins every text block the way the row does, so a plain message copies unchanged', () => {
    const content = messageContent([{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }])

    expect(content.text).toBe('hello world')
    expect(content.attachments).toEqual([])
    expect(content.extraBlocks).toEqual([])
  })

  it('copies an empty message to an empty string rather than to placeholder text', () => {
    expect(clipboardText(messageContent([]))).toBe('')
  })

  it('keeps attachments in content order and out of the text', () => {
    const content = messageContent([
      { type: 'text', text: 'see ' },
      { type: 'image', attachment: IMAGE_ONE },
      { type: 'file', attachment: FILE_ONE },
      { type: 'text', text: 'both' },
      { type: 'image', attachment: IMAGE_TWO },
    ])

    expect(content.text).toBe('see both')
    expect(content.attachments).toEqual([
      { type: 'image', image: IMAGE_ONE },
      { type: 'file', file: FILE_ONE },
      { type: 'image', image: IMAGE_TWO },
    ])
  })

  it('collects only the images, in order, as the references whose bytes must be read', () => {
    const content = messageContent([
      { type: 'file', attachment: FILE_ONE },
      { type: 'image', attachment: IMAGE_TWO },
      { type: 'image', attachment: IMAGE_ONE },
    ])

    expect(imageReferences(content)).toEqual([IMAGE_TWO, IMAGE_ONE])
  })

  it('holds a block it does not understand aside instead of leaking it into the text', () => {
    const unknown = { type: 'reasoning', text: 'not user text' }
    const content = messageContent([{ type: 'text', text: 'kept' }, unknown])

    expect(content.text).toBe('kept')
    expect(content.attachments).toEqual([])
    expect(content.extraBlocks).toEqual([unknown])
    expect(clipboardText(content)).toBe('kept')
  })

  it('ignores a block whose declared type is missing its payload', () => {
    const content = messageContent([{ type: 'image' }, { type: 'file' }, { type: 'text' }])

    expect(content.text).toBe('')
    expect(content.attachments).toEqual([])
    expect(content.extraBlocks).toHaveLength(3)
  })
})

describe('the plain-text payload', () => {
  it('is the row text alone when the message has no files', () => {
    const content = messageContent([
      { type: 'text', text: 'first' },
      { type: 'image', attachment: IMAGE_ONE },
      { type: 'text', text: ' second' },
    ])

    expect(clipboardText(content)).toBe('first second')
  })

  it('names every file with its size, in attachment order, above the text as the row shows them', () => {
    const content = messageContent([
      { type: 'text', text: 'look at these' },
      { type: 'file', attachment: FILE_ONE },
      { type: 'file', attachment: FILE_TWO },
      { type: 'image', attachment: IMAGE_ONE },
    ])

    expect(clipboardText(content)).toBe('report.pdf (1.5KB)\nnotes.txt (312B)\nlook at these')
  })

  it('carries only the file notes when the message is files alone', () => {
    const content = messageContent([{ type: 'file', attachment: FILE_TWO }])

    expect(clipboardText(content)).toBe('notes.txt (312B)')
  })

  it('describes one file by its display name and its exact byte count', () => {
    expect(fileDescription(FILE_ONE)).toBe('report.pdf (1.5KB)')
    expect(fileDescription({ name: 'a.bin', bytes: 0 })).toBe('a.bin (0B)')
  })
})

describe('byte sizes', () => {
  it('matches the host file card, whose text these notes stand in for', () => {
    // The host's own `fileSizeText` outputs, quoted as the reference values:
    // whole bytes, one decimal below ten of a unit, rounded above.
    expect(formatFileSize(312)).toBe('312B')
    expect(formatFileSize(1_536)).toBe('1.5KB')
    expect(formatFileSize(12_288)).toBe('12KB')
    expect(formatFileSize(4_404_019)).toBe('4.2MB')
  })
})
