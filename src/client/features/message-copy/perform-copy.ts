/**
 * The one copy action both routes into a copy share.
 *
 * The row's button and a text selection over the row's text are two entry
 * points to the same work, and they differ in exactly one respect: a selection
 * arrives with the `copy` event's own synchronous data channel, which is the
 * one write a browser accepts without awaiting anything. Everything else (the
 * payload, the port, the byte reads) is identical.
 *
 * Keeping them one function is what makes "a degraded copy is reported" true by
 * construction. A route that assembled its own write could forget to report,
 * and the ticket's rule is that no attachment is ever dropped without the user
 * being told; here a route cannot forget, because there is nothing else to call.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/perform-copy
 */

import type { ClipboardWriter, CopyEventData, CopyOutcome } from './clipboard.ts'
import type { CopySource } from './row-registry.ts'
import { copyMessage, eventWriter } from './clipboard.ts'

/**
 * Copy one mounted row's message and report what the copy achieved.
 *
 * A failure that escapes the write itself is turned into a `failed` outcome
 * rather than propagating: the caller is either an event handler or a click
 * handler, and neither has anywhere to put a rejection. Reporting it keeps the
 * promise that a copy is never lost in silence, whatever went wrong.
 * @param source - the row to copy.
 * @param data - the `copy` event's data channel, or undefined for the row's button.
 * @param writer - the clipboard port.
 * @returns what the copy achieved.
 */
export async function performCopy(
  source: CopySource,
  data: CopyEventData | undefined,
  writer: ClipboardWriter,
): Promise<CopyOutcome> {
  const target = data === undefined ? writer : eventWriter(writer, data)
  let outcome: CopyOutcome
  try {
    outcome = await copyMessage(source.content, image => source.readImage(image), target)
  }
  catch (error) {
    console.error('[dsh-tweaks] message copy failed:', error)
    outcome = { status: 'failed' }
  }
  source.report(outcome)
  return outcome
}
