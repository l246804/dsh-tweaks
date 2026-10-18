/**
 * The user-message row's styles.
 *
 * This feature shadows the host's user row renderer, so nothing the host's own
 * stylesheets did for that row's chrome applies any more: a CSS-module class
 * name is per-package and the host's classes belong to a module this bundle may
 * not import. Everything the row's outer layout and action line need is
 * therefore restated here.
 *
 * The values are the host's own, copied declaration for declaration from
 * `ui-chat`'s `MessageItem.module.css` (`userRow`) and
 * `MessageIconActions.module.css` (`actions`, `timeStart`, `action`), including
 * the two hover-reveal rules that hide an earlier row's actions until the row
 * is hovered or focused. They are duplicated deliberately: the requirement is
 * that a shadowed row is indistinguishable from the one it replaced, and any
 * value guessed rather than copied would show up as a shifted pixel.
 *
 * The bubble, attachment cards and text inside the row are *not* styled here:
 * the host's `conversation.chat.user.content` Factory still renders those, so
 * that interior keeps the host's own stylesheet untouched.
 *
 * Every class name carries the `dshTweaksMessageCopy-` prefix, so a rule here
 * can never collide with the host's hashed names.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/styles
 */

import { CHAT_ROW_ANCHORS } from '../../dom/host-anchors.ts'

/**
 * The row's stylesheet text.
 *
 * Deliberately a plain string rather than a CSS-module import: the build inlines
 * it into the plugin's own style element, which the plugin removes on unload
 * (see `installStyles`).
 */
export const ROW_STYLES = `
/* Row chrome: right-aligned bubble column. Host: MessageItem.module.css .userRow */
.dshTweaksMessageCopy-row {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

/* Action line. Host: MessageIconActions.module.css .actions */
.dshTweaksMessageCopy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: calc(28px + var(--dsh-content-font-delta, 0px));
}

/* User-side clock. Host: MessageIconActions.module.css .timeStart */
.dshTweaksMessageCopy-time {
  padding-right: 12px;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

/* One icon button. Host: MessageIconActions.module.css .action */
.dshTweaksMessageCopy-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.dshTweaksMessageCopy-action svg {
  width: calc(15px + var(--dsh-content-font-delta, 0px));
  height: calc(15px + var(--dsh-content-font-delta, 0px));
}

.dshTweaksMessageCopy-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

/* A degraded copy is said in place, under the row it belongs to. Sized and
   tinted like the host's tertiary message metadata so it reads as part of the
   row rather than as a stray banner. */
.dshTweaksMessageCopy-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);
  color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-tertiary));
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));
  text-align: right;
}

.dshTweaksMessageCopy-notice svg {
  flex: none;
  width: 14px;
  height: 14px;
}

/* Earlier user rows hide their action line until hover or focus.
   Host: MessageIconActions.module.css, the @media (hover: hover) block. */
@media (hover: hover) {
  [${CHAT_ROW_ANCHORS.actionsReveal.name}='hover'] .dshTweaksMessageCopy-actions,
  :is([${CHAT_ROW_ANCHORS.flowKind.name}='user'], [${CHAT_ROW_ANCHORS.flowKind.name}='steering']):has(
    ~ :is([${CHAT_ROW_ANCHORS.flowKind.name}='user'], [${CHAT_ROW_ANCHORS.flowKind.name}='steering'])
  ) .dshTweaksMessageCopy-actions {
    opacity: 0;
    transition: opacity 80ms ease;
  }

  [${CHAT_ROW_ANCHORS.actionsReveal.name}='hover']:hover .dshTweaksMessageCopy-actions,
  [${CHAT_ROW_ANCHORS.actionsReveal.name}='hover']:focus-within .dshTweaksMessageCopy-actions,
  :is([${CHAT_ROW_ANCHORS.flowKind.name}='user'], [${CHAT_ROW_ANCHORS.flowKind.name}='steering']):has(
    ~ :is([${CHAT_ROW_ANCHORS.flowKind.name}='user'], [${CHAT_ROW_ANCHORS.flowKind.name}='steering'])
  ):hover .dshTweaksMessageCopy-actions,
  :is([${CHAT_ROW_ANCHORS.flowKind.name}='user'], [${CHAT_ROW_ANCHORS.flowKind.name}='steering']):has(
    ~ :is([${CHAT_ROW_ANCHORS.flowKind.name}='user'], [${CHAT_ROW_ANCHORS.flowKind.name}='steering'])
  ):focus-within .dshTweaksMessageCopy-actions {
    opacity: 1;
  }
}
`
