/**
 * The concrete ends of the copy: the browser's clipboard, the `copy` event's
 * data channel, and the session's image bytes.
 *
 * `clipboard.ts` decides what a copy does; this module is how it reaches the
 * host's own APIs, kept as small as the job allows because every line here is
 * one a plain test cannot exercise in a real browser.
 *
 * Three details are load-bearing:
 *
 * - The plain-text write *is* the host's own `writeClipboard`, called rather
 *   than reproduced. That helper already handles the async clipboard and its
 *   `execCommand` fallback, and reusing it is what makes a text-only message
 *   copy byte-for-byte what it copied before this feature existed.
 * - A `ClipboardItem`'s value may be a promise, and passing the *pending*
 *   byte-read promise through is what makes a rich copy possible at all: the
 *   reads start during the copy event's synchronous phase, and the host awaits
 *   them afterward. Awaiting here instead would move the read past the
 *   browser's acceptance window, and the copy would fall back to text.
 * - A missing session is a refusal, not an empty image: writing zero bytes
 *   would paste a broken attachment.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/host
 */

import type { ClipboardImage, ClipboardWriter } from './clipboard.ts'
import type { ImageReference } from './payload.ts'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

/** The clipboard flavor carrying plain text. */
const TEXT_FLAVOR = 'text/plain'

/**
 * A clipboard item constructor, narrowed to the one call this module makes.
 *
 * The entries are typed permissively because the browser's own signature is
 * narrower than the map this module builds; the promise-valued entry is
 * deliberate (see the module note).
 */
interface ClipboardItemConstructor {
  new (entries: Record<string, string | Blob | PromiseLike<Blob>>): unknown
}

/** Everything the writer reads off the page, injected so the writer is testable. */
export interface ClipboardEnvironment {
  /**
   * The host's own plain-text write, used unchanged.
   *
   * Injected rather than imported directly inside `navigatorWriter` so a test
   * can drive the writer without a browser; production passes the host's
   * `writeClipboard` from the platform module table.
   */
  readonly writeText: (text: string) => Promise<boolean>
  /** The async clipboard's structured write, or undefined where absent. */
  readonly writeItems: ((items: readonly unknown[]) => Promise<void>) | undefined
  /** The structured-clipboard item constructor, or undefined where absent. */
  readonly ClipboardItem: ClipboardItemConstructor | undefined
}

/**
 * Build the writer that talks to a real clipboard.
 * @param environment - the host's plain-text write and the page's structured-clipboard globals.
 * @returns the writer.
 */
export function navigatorWriter(environment: ClipboardEnvironment): ClipboardWriter {
  const writeItemsAsync = environment.writeItems
  const ClipboardItem = environment.ClipboardItem
  // Both halves are required: jsdom and older Chromium expose the item
  // constructor without the `write` method that consumes it.
  const canWriteItems = writeItemsAsync !== undefined && ClipboardItem !== undefined
  return {
    canWriteItems,
    writeText: text => environment.writeText(text),
    async writeItems(text, images) {
      if (!canWriteItems)
        return false
      try {
        await writeItemsAsync([new ClipboardItem(itemEntries(text, images))])
        return true
      }
      catch {
        return false
      }
    },
  }
}

/**
 * The entries of one clipboard item: the text flavor and one image flavor per
 * image, keyed by media type.
 * @param text - the plain-text representation; omitted when empty.
 * @param images - the images to carry, in attachment order.
 * @returns the item's entry map.
 */
function itemEntries(text: string, images: readonly ClipboardImage[]): Record<string, string | PromiseLike<Blob>> {
  const entries: Record<string, string | PromiseLike<Blob>> = {}
  if (text !== '')
    entries[TEXT_FLAVOR] = text
  for (const image of images)
    entries[image.mediaType] = image.bytes
  return entries
}

/**
 * A session's image-byte reader, narrowed to the one method used.
 *
 * The parameter is declared as a plain string while a real session takes a
 * branded id: the caller adapts its own method, so this module needs no
 * dependency on the brand.
 */
export interface AttachmentReader {
  readAttachment: (attachmentId: string) => Promise<
    | { readonly ok: true, readonly value: { readonly attachment: { readonly mediaType: string }, readonly data: Uint8Array } }
    | { readonly ok: false, readonly error: { readonly code: string, readonly message: string } }
  >
}

/**
 * Read one message image's stored bytes.
 *
 * Only images are readable this way: the host authorizes the attachment RPC for
 * images referenced by the session's own log, so a file's bytes cannot be
 * fetched here at all (see `payload.ts` for how files are copied instead).
 * @param session - the message's session, or undefined when none is bound.
 * @param image - the image reference from the message content.
 * @returns the image's bytes as a blob carrying its verified media type.
 * @throws {Error} when no session is bound, or the host refuses the read.
 */
export async function readImageBytes(
  session: AttachmentReader | undefined,
  image: ImageReference,
): Promise<Blob> {
  if (session === undefined)
    throw new Error('message-copy: no session is bound, so the image cannot be read')
  const result = await session.readAttachment(image.attachmentId)
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`)
  // A fresh copy of the bytes: the host may reuse its buffer, and the blob
  // outlives this call on the system clipboard.
  return new Blob([Uint8Array.from(result.value.data)], { type: result.value.attachment.mediaType })
}

/**
 * Assemble the environment from the page's globals.
 *
 * Kept separate from the writer so the writer never reads a global itself, and
 * so an absent global (a test engine, an insecure context, an old browser) is
 * an explicit `undefined` rather than a thrown reference error inside a copy.
 * @param page - the globals to read; absent in a non-browser context.
 * @returns the environment.
 */
export function clipboardEnvironment(page: {
  readonly navigator?: { readonly clipboard?: { readonly write?: (items: ClipboardItems) => Promise<void> } } | undefined
  readonly ClipboardItem?: unknown
} | undefined): ClipboardEnvironment {
  const write = page?.navigator?.clipboard?.write
  return {
    writeText: writeClipboard,
    // The browser's own `write` takes a mutable `ClipboardItems`; the writer
    // only needs a readonly batch of opaque items, so the adapter narrows the
    // parameter rather than widening its own signature.
    writeItems: write === undefined ? undefined : items => write(items as ClipboardItems),
    ClipboardItem: typeof page?.ClipboardItem === 'function'
      ? page.ClipboardItem as ClipboardItemConstructor
      : undefined,
  }
}
