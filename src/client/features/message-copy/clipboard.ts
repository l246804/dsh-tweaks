/**
 * The clipboard-write decision: what a message's copy hands to the host, and
 * what it reports back.
 *
 * Import-free by design, like `payload.ts`, so the copy's control flow, the
 * part with an actual hazard in it, is executable in a plain Node test. The
 * hazard is timing: image bytes arrive asynchronously, while a browser only
 * accepts custom clipboard data assembled during the event's synchronous
 * phase.
 *
 * The way through is that a `ClipboardItem` accepts a promise for its data.
 * This module therefore starts every byte read in the same synchronous turn as
 * the copy call and hands the host the still-pending promises, letting the
 * host await them on its own schedule. A copy never drops an attachment to
 * make that easier; when the structured write cannot happen, the plain text
 * still goes out and the outcome says so, distinguishably, so the row can tell
 * the user instead of pretending.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/clipboard
 */

import type { ImageReference, MessageContent } from './payload.ts'
import { clipboardText, imageReferences } from './payload.ts'

/** One image flavor of the clipboard write: its type and its pending bytes. */
export interface ClipboardImage {
  /** The image's verified media type, used as the clipboard flavor. */
  readonly mediaType: string
  /** The image's bytes, read but not awaited. */
  readonly bytes: Promise<Blob>
}

/**
 * The `DataTransfer` a `copy` event hands its listener.
 *
 * Modelled structurally rather than as the browser's own type: the only thing
 * this feature does with it is `setData`, and typing it that narrowly is what
 * lets this module stay import-free, so a plain Node test can execute the whole
 * copy decision without a browser.
 */
export interface CopyEventData {
  /** Place one representation on the clipboard before the handler returns. */
  readonly setData: (type: string, value: string) => void
}

/** The clipboard flavor carrying plain text. */
const TEXT_FLAVOR = 'text/plain'

/**
 * Add the `copy` event's own synchronous channel to a writer.
 *
 * A browser only accepts custom clipboard data while the `copy` handler is
 * still running, so the event's `DataTransfer` is the one route a
 * text-selection copy can rely on. The asynchronous writer stays available
 * underneath for the image flavor, which the event channel cannot carry.
 *
 * This lives here rather than beside the browser adapters because it is pure:
 * it only wraps the port. Keeping it in this import-free module is what lets
 * the shared copy action stay import-free too.
 * @param base - the clipboard writer.
 * @param data - the event's data channel.
 * @returns a writer that fills the event channel first.
 */
export function eventWriter(base: ClipboardWriter, data: CopyEventData): ClipboardWriter {
  return {
    ...base,
    writeEventText(text) {
      try {
        data.setData(TEXT_FLAVOR, text)
        return true
      }
      catch {
        // A read-only channel (or an event already past its window) is not
        // fatal: the asynchronous writer still gets its turn.
        return false
      }
    },
  }
}

/**
 * The clipboard operations a copy needs.
 *
 * A port rather than the `navigator` directly, so the decision above this line
 * can be tested without a browser. `concrete writer` lives in `writer.ts`.
 */
export interface ClipboardWriter {
  /** Whether the host can carry custom (non-text) clipboard data at all. */
  readonly canWriteItems: boolean
  /**
   * Write plain text through the host's asynchronous clipboard API.
   * @param text - the exact string to place on the clipboard.
   * @returns whether the host accepted the write.
   */
  writeText: (text: string) => Promise<boolean>
  /**
   * Write the text plus real image data.
   * @param text - the plain-text flavor, carried alongside the images.
   * @param images - one entry per image, in attachment order, bytes pending.
   * @returns whether the host accepted the write.
   */
  writeItems: (text: string, images: readonly ClipboardImage[]) => Promise<boolean>
  /**
   * Write plain text through a `copy` event's own synchronous channel.
   *
   * Present only on the text-selection path, where the browser has handed over
   * a `DataTransfer` that must be filled before the handler returns. Absent
   * means the caller has no such channel and the asynchronous route is used.
   * @param text - the exact string to place on the clipboard.
   * @returns whether the event carried the write.
   */
  writeEventText?: (text: string) => boolean
}

/** What a copy actually achieved. */
export type CopyOutcome
  /**
   * The copy landed. `attachmentsIncluded` reports whether real attachment
   * data* (image bytes) rode along; a file travels as its name-and-size text
   * and so never sets it. `omittedImages` counts images the clipboard's own
   * representation limit left out.
   */
  = | { readonly status: 'copied', readonly attachmentsIncluded: boolean, readonly omittedImages: number }
  /**
   * Text landed, attachments did not. `unsupported` means the host has no
   * custom-clipboard API at all; `denied` means it refused the structured write
   * (permissions, policy, or a failed byte read).
   */
    | { readonly status: 'text-only', readonly reason: 'unsupported' | 'denied' }
  /** Nothing landed. */
    | { readonly status: 'failed' }

/**
 * Start one image read, containing a synchronous throw as a rejected promise.
 *
 * The read must run in the copy's synchronous phase, so it cannot be wrapped in
 * an `async` function (that would defer it a microtask). A provider that throws
 * synchronously would otherwise escape the copy handler entirely, so its throw
 * is converted here into the rejection the clipboard write already expects.
 * @param read - the byte reader.
 * @returns the pending bytes.
 */
function startRead(read: () => Promise<Blob>): Promise<Blob> {
  try {
    return read()
  }
  catch (error) {
    return Promise.reject(error)
  }
}

/** What one copy will attempt, decided before any byte is read. */
export interface CopyPlan {
  /** The plain-text flavor, identical on both routes. */
  readonly text: string
  /** The images the structured write will carry, in attachment order. */
  readonly images: readonly ImageReference[]
  /**
   * Images the structured write cannot represent, in attachment order.
   *
   * A clipboard item is a map of media type to data, so a second image of a
   * type already carried has no flavor left to occupy. This list exists so
   * those images are *reported*, never silently dropped. Note the platform's
   * own limit on top of it: when one write offers several image flavors the
   * system clipboard typically keeps one representation, so a paste restores
   * one image even though the copy offered each offered type.
   */
  readonly omitted: readonly ImageReference[]
}

/**
 * Decide what one copy will attempt.
 *
 * Separate from the write so the ordering and the platform's representation
 * limit are observable without a browser, and so the same plan feeds the
 * button and a text-selection copy.
 * @param content - the message's split content.
 * @returns the text, the carried images and the images that cannot be carried.
 */
export function planCopy(content: MessageContent): CopyPlan {
  const images: ImageReference[] = []
  const omitted: ImageReference[] = []
  const types = new Set<string>()
  for (const image of imageReferences(content)) {
    if (types.has(image.mediaType)) {
      omitted.push(image)
      continue
    }
    types.add(image.mediaType)
    images.push(image)
  }
  return { text: clipboardText(content), images, omitted }
}

/**
 * Put one message's content on the clipboard.
 *
 * The plain-text path is exactly the host's own: one `writeText` carrying the
 * payload's text. The structured path writes that same text as the item's
 * `text/plain` flavor beside each image's real bytes, so pasting into a
 * composer restores the image as an attachment.
 *
 * On a text-selection copy the event's own synchronous channel is filled first
 * if it exists, because that is the one write a browser accepts without
 * awaiting anything; the images are then offered in the same turn and the
 * outcome reports whether they landed. A file needs none of this, it travels
 * as its name-and-size text, so only images can degrade a copy.
 * @param content - the message's split content.
 * @param readImage - starts reading one image's bytes; called synchronously.
 * @param writer - the clipboard port.
 * @returns what the copy achieved.
 */
export async function copyMessage(
  content: MessageContent,
  readImage: (image: ImageReference) => Promise<Blob>,
  writer: ClipboardWriter,
): Promise<CopyOutcome> {
  const plan = planCopy(content)
  const eventCarried = writer.writeEventText?.(plan.text) ?? false
  if (plan.images.length > 0 && writer.canWriteItems) {
    // Both lines run before this function's first await: the reads are in
    // flight and the item promises are in the host's hands inside the browser's
    // synchronous acceptance window.
    const entries: ClipboardImage[] = plan.images.map(image => ({
      mediaType: image.mediaType,
      bytes: startRead(() => readImage(image)),
    }))
    if (await writer.writeItems(plan.text, entries))
      return { status: 'copied', attachmentsIncluded: true, omittedImages: plan.omitted.length }
    // The host refused the structured write. Whatever text already landed
    // stays; otherwise the text is still worth having, and its failure is
    // reported rather than swallowed.
    if (eventCarried)
      return { status: 'text-only', reason: 'denied' }
    return await writer.writeText(plan.text)
      ? { status: 'text-only', reason: 'denied' }
      : { status: 'failed' }
  }
  if (!eventCarried && !await writer.writeText(plan.text))
    return { status: 'failed' }
  if (plan.images.length > 0)
    return { status: 'text-only', reason: 'unsupported' }
  return { status: 'copied', attachmentsIncluded: false, omittedImages: 0 }
}
