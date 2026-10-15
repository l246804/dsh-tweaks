/**
 * The clipboard payload a user message copies to, built purely from the
 * message's content blocks.
 *
 * This module has no imports on purpose. It decides what a copy puts on the
 * clipboard, the part of this feature a reviewer can argue about, and a
 * module with no imports is one a plain Node test can execute without a
 * browser, a React renderer or the host's package graph. The renderer and the
 * document listener both call it, so the button and a text selection cannot
 * drift apart.
 *
 * Two facts shape the output:
 *
 * - A message's text copies verbatim, exactly as the host's own copy control
 *   writes it today. Any block that is not a text, image or file is not user
 *   prose and stays out of the text.
 * - A file's bytes cannot be read back through a session, the host authorizes
 *   attachment reads for images only, so a file is described by the name and
 *   size its own card already shows. An image is not described, because its
 *   real bytes travel in their own clipboard representation (see
 *   `clipboard.ts`); describing it as text as well would paste a stray note
 *   beside the picture.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/payload
 */

/** A durable image reference, as a content block carries it. */
export interface ImageReference {
  readonly attachmentId: string
  readonly mediaType: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name?: string
}

/** A durable file reference, as a content block carries it. */
export interface FileReference {
  readonly attachmentId: string
  readonly name: string
  readonly bytes: number
}

/** One attachment in the order the row presents it. */
type MessageAttachment<
  Image extends ImageReference = ImageReference,
  File extends FileReference = FileReference,
> = | { readonly type: 'image', readonly image: Image }
  | { readonly type: 'file', readonly file: File }

/** A message's content, split into the three parts the row renders from. */
export interface MessageContent<
  Image extends ImageReference = ImageReference,
  File extends FileReference = FileReference,
> {
  /** Every text block, joined exactly as the row joins them. */
  readonly text: string
  /** Attachments in content order. */
  readonly attachments: readonly MessageAttachment<Image, File>[]
  /** Blocks with no text or attachment presentation, held aside unrendered. */
  readonly extraBlocks: readonly unknown[]
}

/** How many bytes one kibibyte holds, matching the host's size text. */
const KIB = 1024

/**
 * Split a message's content blocks the way the host's own user row does.
 *
 * The classification mirrors the host's `contentParts`, deliberately: a block
 * this function mis-files would render differently from the row it stands in
 * for, and the row's own renderer is fed by this same split.
 *
 * The two reference type parameters exist because a caller that already has the
 * host's own branded reference types should keep them: the blocks are opaque
 * `unknown` here, so the caller is the one that knows which references they
 * carry, and it says so once at the call site instead of casting the result
 * afterwards.
 * @param blocks - the user message's content blocks.
 * @returns the joined text, the ordered attachments and the remaining blocks.
 */
export function messageContent<
  Image extends ImageReference = ImageReference,
  File extends FileReference = FileReference,
>(blocks: readonly unknown[]): MessageContent<Image, File> {
  const texts: string[] = []
  const attachments: MessageAttachment<Image, File>[] = []
  const extraBlocks: unknown[] = []
  for (const block of blocks) {
    const candidate = block as { type?: unknown, text?: unknown, attachment?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      texts.push(candidate.text)
      continue
    }
    if (candidate.type === 'image' && candidate.attachment !== undefined) {
      attachments.push({ type: 'image', image: candidate.attachment as Image })
      continue
    }
    if (candidate.type === 'file' && candidate.attachment !== undefined) {
      attachments.push({ type: 'file', file: candidate.attachment as File })
      continue
    }
    extraBlocks.push(block)
  }
  return { text: texts.join(''), attachments, extraBlocks }
}

/**
 * The images whose bytes a copy has to read.
 * @param content - a split message.
 * @returns the image references, in attachment order.
 */
export function imageReferences(content: MessageContent): ImageReference[] {
  return content.attachments.flatMap(attachment =>
    attachment.type === 'image' ? [attachment.image] : [])
}

/**
 * One file, as the text that stands in for bytes the clipboard cannot carry.
 * @param file - the file reference.
 * @returns the display name and the compact size, as the file card shows them.
 */
export function fileDescription(file: Pick<FileReference, 'name' | 'bytes'>): string {
  return `${file.name} (${formatFileSize(file.bytes)})`
}

/**
 * A byte count as compact user-facing size text.
 *
 * This mirrors the host's `fileSizeText` output for the same inputs rather
 * than importing it: the payload module must stay import-free so a Node test
 * can execute it, and the values are pinned against the host's own by test.
 * @param bytes - an exact byte count.
 * @returns whole-unit text such as `312B`, `1.5KB` or `4.2MB`.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < KIB)
    return `${bytes}B`
  const kib = bytes / KIB
  if (kib < KIB)
    return `${kib < 10 ? kib.toFixed(1) : Math.round(kib)}KB`
  const mib = kib / KIB
  if (mib < KIB)
    return `${mib < 10 ? mib.toFixed(1) : Math.round(mib)}MB`
  const gib = mib / KIB
  return `${gib < 10 ? gib.toFixed(1) : Math.round(gib)}GB`
}

/**
 * The `text/plain` a copy writes.
 *
 * The row's own presentation order decides the shape: attachments render as a
 * block above the bubble, then the text bubble, so a file's description
 * precedes the text. With no file, this is the message text alone, which is
 * what the host's copy control writes today, and the regression line this
 * feature must not cross.
 * @param content - a split message.
 * @returns the plain-text representation.
 */
export function clipboardText(content: MessageContent): string {
  const parts = content.attachments.flatMap(attachment =>
    attachment.type === 'file' ? [fileDescription(attachment.file)] : [])
  // An empty message and a message whose bubble the row omits must not leave a
  // blank line behind: a file-only message is its file notes, nothing more.
  if (content.text !== '')
    parts.push(content.text)
  return parts.join('\n')
}
