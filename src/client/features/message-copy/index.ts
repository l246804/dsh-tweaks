/**
 * Message copy, attachments included.
 *
 * A copied message currently loses every attachment, because the DOM carries no
 * attachment identity: images are temporary object addresses and files have no
 * address at all. The only place a message's persistent attachment references
 * exist is the node data behind its renderer, so this feature shadows the user
 * message row's renderer, reproduces that row's appearance and behavior, and
 * writes a clipboard payload that carries the text plus the attachments. Images
 * are written as real image data so pasting them elsewhere restores them as
 * image attachments; files are written as a readable description, because a
 * session can read an image's bytes back but not a file's (see `payload.ts`).
 *
 * ## The timing hazard, and how it is resolved
 *
 * A browser only accepts custom clipboard data assembled during a `copy`
 * event's *synchronous* phase, while image bytes arrive asynchronously. The
 * obstacle is real, and the temptation is to await the bytes first and quietly
 * copy text only. This feature does neither:
 *
 * - A `ClipboardItem` accepts a *promise* for its data. So `copyMessage` starts
 *   every byte read in the same synchronous turn as the copy call and hands the
 *   host the still-pending promises; the reads are in flight while the browser
 *   is still accepting the item, and the host awaits them itself. That is what
 *   makes the button path complete, images really are on the clipboard. The
 *   reads go through `session.readAttachment`, the one surface the host
 *   authorizes for a session's own images.
 * - A text selection is copied through the `copy` event's own `DataTransfer`
 *   channel first, which is the one write a browser accepts without awaiting
 *   anything. The structured write is then attempted in the same turn. If it is
 *   refused, the text still stands and the row *says* the attachments were left
 *   behind rather than dropping them in silence.
 * - The platform's own limit is reported too: a clipboard item is keyed by
 *   media type, so a second image of a type already carried has no flavor to
 *   occupy. Those images are counted and named in the row's notice rather than
 *   silently discarded.
 *
 * Two upstream changes would remove the remaining constraints. A per-message
 * action slot would let this feature *add* a copy control instead of shadowing
 * the whole row, dropping the obligation to reproduce the row's chrome. An
 * attachment read authorized for non-image attachments (or a paste channel that
 * accepts files) would let a file carry its real bytes instead of its name and
 * size. Until then this design is the narrowest one that satisfies the ticket:
 * nothing is dropped without being reported.
 *
 * Owned by ticket #8.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy
 */

import type { AttachmentId } from '@deepseek-ai/dsh-attachment'
// Type-only: pulls the `conversation.chat.node` declaration and the Chat node
// payload merge. Erased before bundling.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '../../contracts.ts'
import type { DocumentLike } from '../../dom/types.ts'
import type { CopyEventData, CopyOutcome } from './clipboard.ts'
import type { MessageCopyKey } from './locales.ts'
import type { CopySource } from './row-registry.ts'
import type { MessageCopyInjected } from './row.ts'
import { installStyles } from '../../dom/styles.ts'
import { clipboardEnvironment, navigatorWriter, readImageBytes } from './host.ts'
import { installCopyListener } from './listener.ts'
import { en, NS, zh } from './locales.ts'
import { performCopy } from './perform-copy.ts'
import { createRowRegistry } from './row-registry.ts'
import { MessageCopyRow } from './row.ts'
import { ROW_STYLES } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This feature's own row copy and date templates. */
    dshTweaksMessageCopy: MessageCopyKey
  }
}

/**
 * The priority this row registers at, shadowing the host's own `user` entry.
 *
 * The host registers `conversation.chat.node` under key `user` at the default
 * priority 0, and a registration at an *equal* priority throws. The slot's rule
 * is that the lowest live priority renders, so a negative value takes the cell.
 */
const SHADOW_PRIORITY = -1

/** The one Chat node kind this feature takes over. */
const USER_NODE_KEY = 'user'

/**
 * Narrow one untrusted value to the plugin's own document surface.
 *
 * This is the feature's boundary parse. The plugin's narrow `DocumentLike` is
 * written for the host's *elements*, where `parentNode` is another element or
 * undefined; the browser's `Document` declares a nullable `ParentNode` instead,
 * so the two are not structurally comparable and a plain assertion would be
 * rejected by the compiler as well as by this repo's lint rules. The check
 * below proves the members the feature actually uses are present and callable,
 * which is the real contract, and returns the value typed.
 * @param value - the candidate, from a global this code does not control.
 * @returns the value as a `DocumentLike`, or undefined when it is not one.
 */
function asDocumentLike(value: unknown): DocumentLike | undefined {
  if (typeof value !== 'object' || value === null)
    return undefined
  const candidate = value as Partial<DocumentLike>
  if (typeof candidate.createElement !== 'function'
    || typeof candidate.querySelectorAll !== 'function'
    || typeof candidate.addEventListener !== 'function'
    || typeof candidate.removeEventListener !== 'function'
    || candidate.head === null
    || candidate.head === undefined) {
    return undefined
  }
  return candidate as DocumentLike
}

/**
 * The page's document, when there is one.
 * @returns the document as this feature's narrow surface, or undefined.
 */
function browserDocument(): DocumentLike | undefined {
  return typeof document === 'undefined' ? undefined : asDocumentLike(document)
}

/**
 * Install the message-copy tweak.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  const sessions = ctx.sessions
  const registry = createRowRegistry()
  // The page's clipboard globals, read once: an insecure context omits
  // `navigator.clipboard` and older engines omit `ClipboardItem`, and both
  // absences must degrade into a reported text-only copy rather than a throw.
  const writer = navigatorWriter(clipboardEnvironment({
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    ClipboardItem: typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem,
  }))

  /**
   * Copy one row's message and report what the copy achieved.
   *
   * Both routes into a copy (the row's button and a text selection) reach the
   * message through this one action, so a degraded copy is always reported
   * rather than dropped in silence.
   * @param source - the row being copied.
   * @param data - the event's data channel, if the copy came from a selection.
   * @returns what the copy achieved.
   */
  const copy = (source: CopySource, data: CopyEventData | undefined): Promise<CopyOutcome> =>
    performCopy(source, data, writer)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-tweaks: message-copy dictionaries')
  // The row's own chrome is not covered by any host stylesheet: this feature's
  // component is not the host's, so the host's CSS-module classes do not apply.
  const documentLike = browserDocument()
  if (documentLike !== undefined) {
    ctx.effect(() => installStyles(documentLike, ROW_STYLES), 'dsh-tweaks: message-copy styles')
    // The document listener is what makes a text selection copy the same
    // content the row's button does.
    ctx.effect(
      () => installCopyListener(documentLike, { registry, copy }),
      'dsh-tweaks: message-copy document listener',
    )
  }

  // The registry is emptied on unload, so no row content outlives the plugin.
  ctx.effect(() => () => {
    registry.clear()
  }, 'dsh-tweaks: message-copy registry')

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: USER_NODE_KEY,
    priority: SHADOW_PRIORITY,
    locale: NS,
    inject: (sessionId: string): MessageCopyInjected => ({
      publish: source => registry.register(source),
      copy,
      readImage: image => readImageBytes(sessionFor(sessions, sessionId), image),
    }),
  }, MessageCopyRow))
}

/**
 * Adapt the live session a row belongs to into the byte reader this feature uses.
 *
 * Two conversions happen here, both at the same boundary:
 *
 * - The framework hands a session-scope inject its session id. Upstream brands
 *   that id (`SessionId`) through `ui-session`'s standard-props merge, a package
 *   this repo does not depend on, so the parameter arrives as a plain string.
 *   The brand is a compile-time marker over the same runtime value, so the
 *   lookup re-marks it, which is the whole of that conversion.
 * - The session's own `readAttachment` takes a branded `AttachmentId`, while
 *   `payload.ts` stays import-free and therefore reads ids as plain strings.
 *   The adapter below re-marks each id on the way in, so neither module has to
 *   know about the other's branding.
 *
 * The lookup goes through the *live* binding rather than a captured one: a row
 * outlives the binding it rendered under, and a stale binding would read
 * another session's attachment, or the right session's stale bytes.
 * @param sessions - the client sessions service.
 * @param sessionId - the row's session id, as the framework delivered it.
 * @returns the session's read face, or undefined when the session is gone.
 */
function sessionFor(
  sessions: ClientContext['sessions'],
  sessionId: string,
): Parameters<typeof readImageBytes>[0] {
  const session = sessions.binding(sessionId as Parameters<typeof sessions.binding>[0])?.session
  if (session === undefined)
    return undefined
  return {
    readAttachment: attachmentId => session.readAttachment(attachmentId as AttachmentId),
  }
}
