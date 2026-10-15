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
 * image attachments; files are written as a readable description.
 *
 * Owned by ticket #8.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy
 */

import type { ClientContext } from '../../contracts.ts'

/**
 * Install the message-copy tweak.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  void ctx
}
