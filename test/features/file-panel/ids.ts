/**
 * Branded ids for the panel's tests.
 *
 * The host's ids are branded strings (`SessionId`, `TabId`), and a test's fake
 * session is not one of the host's real ids, and no amount of construction can make
 * it one. So the brand is applied here, once, in the test tree, with the reason
 * stated; production code never needs this, because it only ever handles ids the
 * host itself produced.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/ids
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

/**
 * A fake session id, branded to the host's type.
 * @param value - the fake id's text.
 * @returns the same string, branded.
 */
export function sessionId(value: string): SessionId {
  return value as SessionId
}

/**
 * A fake tab id, branded to the host's type.
 * @param value - the fake id's text.
 * @returns the same string, branded.
 */
export function tabId(value: string): TabId {
  return value as TabId
}
