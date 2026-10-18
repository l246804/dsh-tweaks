/**
 * The user-message row this feature renders in place of the host's own.
 *
 * Shadowing the row's renderer is the only place a message's durable
 * attachment references are reachable (see the feature's index), and the price
 * of taking that place is that this file now owns everything the row used to
 * do: the right-aligned bubble, its content, and the action line beneath it.
 * The rule it is held to is that the result be indistinguishable from what it
 * replaced.
 *
 * Three decisions make that rule achievable rather than aspirational:
 *
 * - The *interior* is not reproduced. `renderFactorySlot` calls the host's own
 *   `conversation.chat.user.content` Factory, which still renders the bubble,
 *   the ordered attachment cards, the decorated text, the extra-block
 *   disclosure and the reference summary with the host's own stylesheet. Only
 *   the row's own chrome, the outer flex column and the action line, is
 *   restated here (see `styles.ts`, which copies the host's declarations).
 * - The copy control reproduces the host's chrome exactly: the same clock
 *   placement and format, the same tooltip and icon swap, the same one-second
 *   confirmation, and the same refusal to stack a second write while one is in
 *   flight. It differs in exactly one place, deliberately: a write that fails
 *   is *said*, where the host says nothing.
 * - The node's optional `referenceLabels` and `skillNames` are forwarded into
 *   the Factory's facts unchanged, because the host's text decoration reads
 *   them and a row that dropped them would render different text.
 *
 * Written with `createElement` rather than JSX, like every other user-interface
 * module in this plugin. The unused-dependency check's project glob covers
 * `.ts` files only, so a `.tsx` module is invisible to it: an unused export
 * there would go unreported. Keeping every UI module on `createElement` means
 * the whole source tree is covered by the check as configured, rather than
 * leaving a hole that only closing it would reveal.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/row
 */

// Type-only: pulls the `conversation.chat.node` slot declaration and the Chat
// node payload merge, so `node.data` is the typed user message here. Erased
// before bundling.
import type { FileAttachmentRef, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { UserContentAttachment } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import type { CopyEventData, CopyOutcome } from './clipboard.ts'
import type { MessageCopyKey } from './locales.ts'
import type { ImageReference } from './payload.ts'
import type { CopySource } from './row-registry.ts'
import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  IconWarningOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CHAT_ROW_ANCHORS } from '../../dom/host-anchors.ts'
import { formatMessageClock, msUntilNextLocalMidnight, startOfLocalDay } from './clock.ts'
import { noticeText } from './notice.ts'
import { messageContent } from './payload.ts'

/** How long a successful copy shows its confirmation, matching the host's chrome. */
const COPIED_FEEDBACK_MS = 1000

/** How long a degradation notice stays on screen before clearing itself. */
const NOTICE_MS = 6000

/** The business face this feature injects into its own row. */
export interface MessageCopyInjected {
  /**
   * Publish one mounted row for document-level copies.
   * @param source - the row's key, content, byte reader and notice reporter.
   * @returns the disposer that unpublishes it.
   */
  readonly publish: (source: CopySource) => () => void
  /**
   * Copy one row's message.
   *
   * `data` is the `copy` event's own synchronous channel when the copy came
   * from a selection, and undefined for the row's own button.
   * @param source - the row to copy.
   * @param data - the event's data channel, if any.
   * @returns what the copy achieved.
   */
  readonly copy: (source: CopySource, data: CopyEventData | undefined) => Promise<CopyOutcome>
  /**
   * Read one image of this session back as bytes.
   * @param image - the image reference from the row's content.
   * @returns the image's bytes, typed with its verified media type.
   */
  readonly readImage: (image: ImageReference) => Promise<Blob>
}

/** Full props of the row renderer. */
export type MessageCopyRowProps
  = & PropsRuntime<'conversation.chat.node', 'user'>
    & PropsLocale<'dshTweaksMessageCopy'>
    & PropsRenderFactories
    & MessageCopyInjected

/**
 * Local calendar-day state, re-fired at each local midnight.
 *
 * Reproduced from the host's own row chrome: rows are memoized on their props,
 * so a clock reading the wall clock at render time would keep yesterday's date
 * format after midnight until an unrelated re-render happened.
 * @returns local midnight of the current day.
 */
function useCalendarDay(): number {
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = (): void => {
      const now = Date.now()
      setDay(startOfLocalDay(now))
      timer = setTimeout(arm, msUntilNextLocalMidnight(now))
    }
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
    return () => {
      clearTimeout(timer)
    }
  }, [])
  return day
}

/** The props of the copy control's line under a message. */
interface MessageCopyActionsProps {
  /** The message's event time, rendered by the clock. */
  readonly time: number
  /** Starts a copy; resolves once the write settles. */
  readonly copy: () => Promise<boolean>
  /** The feature's own locale seat, which renders its labels. */
  readonly t: (key: MessageCopyKey) => string
}

/**
 * The copy control with the clock beside it, under a message.
 *
 * The clock sits before the icons, as it does on the host's user rows. The
 * success chrome is the host's own state machine: a copy in flight ignores
 * further presses (so a double-click writes once), a successful write swaps the
 * icon to a check for a second, and a *failed* write does not claim success.
 * @param props - the action line.
 * @param props.time - the message's event time.
 * @param props.copy - starts a copy; resolves once the write settles.
 * @param props.t - the feature's own locale seat, which renders its labels.
 * @returns the action line.
 */
function MessageCopyActions({ time, copy, t }: MessageCopyActionsProps): ReactNode {
  const day = useCalendarDay()
  const [copied, setCopied] = useState(false)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // One copy at a time: a re-click during the in-flight write or during the
  // confirmation window neither re-copies nor stacks a second timer.
  const copyEpoch = useRef(0)
  useEffect(() => () => {
    copyEpoch.current += 1
    pending.current = false
    if (timer.current !== null)
      clearTimeout(timer.current)
  }, [])
  const onClick = useCallback(() => {
    if (copied || pending.current)
      return
    const epoch = copyEpoch.current
    pending.current = true
    void copy().then((accepted) => {
      if (epoch !== copyEpoch.current)
        return
      pending.current = false
      if (!accepted)
        return
      setCopied(true)
      timer.current = setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, COPIED_FEEDBACK_MS)
    })
  }, [copied, copy])
  return createElement(
    'div',
    { className: 'dshTweaksMessageCopy-actions', [CHAT_ROW_ANCHORS.clock.name]: 'start' },
    createElement('span', { className: 'dshTweaksMessageCopy-time' }, formatMessageClock(time, t, day)),
    createElement(
      Tooltip,
      {
        label: copied ? t('copied') : t('copy'),
        side: 'bottom',
        children: createElement('button', {
          'type': 'button',
          'className': 'dshTweaksMessageCopy-action',
          'aria-label': copied ? t('copied') : t('copy'),
          'onClick': onClick,
        }, copied ? createElement(IconCheckOutlineRegular) : createElement(IconCopyOutlineRegular)),
      },
    ),
  )
}

/**
 * Render one user message row, with a copy that carries its attachments.
 * @param props - the node, the render/locale seats, and this feature's injected face.
 * @returns the row.
 */
export const MessageCopyRow = memo(({
  node,
  renderFactorySlot,
  loadImage,
  publish,
  copy,
  readImage,
  t,
}: MessageCopyRowProps): ReactNode => {
  const data = node.data
  // The split is typed with the host's own reference types, so everything
  // downstream keeps them rather than widening to plain strings.
  const content = useMemo(
    () => messageContent<ImageAttachmentRef, FileAttachmentRef>(data.content),
    [data.content],
  )
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (noticeTimer.current !== null)
      clearTimeout(noticeTimer.current)
  }, [])

  const report = useCallback((outcome: CopyOutcome) => {
    const text = noticeText(outcome, t)
    if (text === undefined)
      return
    setNotice(text)
    if (noticeTimer.current !== null)
      clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null
      setNotice(undefined)
    }, NOTICE_MS)
  }, [t])

  const source = useMemo<CopySource>(
    () => ({ key: node.key, content, readImage, report }),
    [node.key, content, readImage, report],
  )
  // Publish while mounted so a text selection inside this row can find it. The
  // disposer runs on unmount and on unload, so no content outlives the row.
  useEffect(() => publish(source), [publish, source])

  const onCopy = useCallback(
    () => copy(source, undefined).then(outcome => outcome.status === 'copied'),
    [copy, source],
  )

  const facts = useMemo(() => ({
    ...(data.referenceLabels === undefined ? {} : { sessionLabels: data.referenceLabels }),
    ...(data.skillNames === undefined ? {} : { skillNames: data.skillNames }),
  }), [data.referenceLabels, data.skillNames])

  // The Factory's attachment shape wraps an image's durable reference in a
  // presentation source (`{ attachment }`, with an optional display label); the
  // split above keeps the bare reference. This is the one place the two shapes
  // meet, and the host's own row performs the same wrap.
  const attachments = useMemo<UserContentAttachment[]>(
    () => content.attachments.map(attachment => attachment.type === 'image'
      ? { type: 'image', image: { attachment: attachment.image } }
      : { type: 'file', file: attachment.file }),
    [content.attachments],
  )

  return createElement(
    'div',
    { className: 'dshTweaksMessageCopy-row' },
    renderFactorySlot('conversation.chat.user.content', {
      content: {
        text: content.text,
        attachments,
        extraBlocks: content.extraBlocks,
        ...(data.referenceLabels === undefined ? {} : { referenceLabels: data.referenceLabels }),
      },
      loadImage,
      facts,
      interactive: true,
    }),
    createElement(MessageCopyActions, { time: data.time, copy: onCopy, t }),
    // An inline notice rather than the host's floating Toast: the row is
    // necessarily on screen when its copy runs, and an inline message cannot be
    // missed by a user whose attention is on the message itself.
    notice !== undefined
    && createElement(
      'div',
      { className: 'dshTweaksMessageCopy-notice', role: 'status' },
      createElement('span', { 'aria-hidden': true }, createElement(IconWarningOutlineRegular)),
      notice,
    ),
  )
})
