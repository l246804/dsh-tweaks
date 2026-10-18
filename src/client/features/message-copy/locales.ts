/**
 * This feature's own dictionary namespace.
 *
 * The feature cannot borrow the host's `chat` seat: a slot entry's `t` is bound
 * to the namespace its registration declares, and `ui-chat` is another plugin's
 * module that this bundle is forbidden to import (a second copy of its runtime
 * identity would ship). So the handful of strings this row shows live here.
 *
 * Two of them, `clock.md` and `clock.ymd`, are the host's date templates
 * reproduced verbatim. They are duplicated deliberately and pinned by test:
 * the clock these rows render has to read exactly as it did before this feature
 * shadowed the row, and the templates are the only part of that output that
 * comes from a dictionary rather than from `Date`.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/locales
 */

/** Dictionary namespace owned by this feature. */
export const NS = 'dshTweaksMessageCopy'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  // Reproduced from ui-chat's `chat` dictionary: `clock.md` and `clock.ymd`.
  'clock.md': '{m}月{d}日',
  'clock.ymd': '{y}年{m}月{d}日',
  'copy': '复制',
  'copied': '复制成功',
  'copy.attachmentsSkipped': '仅复制了文字：浏览器不允许把附件写入剪贴板',
  'copy.imagesOmitted': '有 {count} 张同格式的图片附件无法放入剪贴板',
  'copy.failed': '复制失败：浏览器拒绝了剪贴板写入',
} satisfies Record<string, string>

/** This namespace's key union. */
export type MessageCopyKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'clock.md': '{m}/{d}',
  'clock.ymd': '{y}-{m}-{d}',
  'copy': 'Copy',
  'copied': 'Copied',
  'copy.attachmentsSkipped': 'Copied text only: the browser would not put attachments on the clipboard',
  'copy.imagesOmitted': '{count} same-format image(s) did not fit on the clipboard',
  'copy.failed': 'Copy failed: the browser refused the clipboard write',
} satisfies Record<MessageCopyKey, string>
