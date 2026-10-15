/**
 * The tab actions' copy, in both languages the client ships.
 *
 * A dictionary is registered under this feature's own namespace, so the three
 * row labels follow the host's active language. Declaring the namespace here
 * also gives the row component its typed `t` seat: the slot framework
 * synthesizes a translate function whose accepted keys are exactly this
 * dictionary's.
 *
 * Keys are dotted, with a lower-case namespace segment and a camelCase leaf,
 * matching how the host's own dictionaries are spelled (`chrome.collapseAria`,
 * `dock.addTab`). The namespace itself is camelCase
 * (`dshTweaksTabActions`), like this plugin's other two features' namespaces and
 * like the host's own (`chat`, `sidebarRight`, `conversation`).
 *
 * @module @leiwang2000/dsh-tweaks/client/features/tab-actions/locales
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** This feature's dictionary namespace. */
export const NS = 'dshTweaksTabActions'

/** Simplified Chinese dictionary, and the key-set source of truth. */
export const zh = {
  'menu.closeOthers': '关闭其他',
  'menu.closeLeft': '关闭左侧',
  'menu.closeRight': '关闭右侧',
} satisfies Record<string, string>

/** The tab-actions dictionary key union. */
export type TabActionsKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'menu.closeOthers': 'Close others',
  'menu.closeLeft': 'Close to the left',
  'menu.closeRight': 'Close to the right',
} satisfies Record<TabActionsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Right-sidebar tab menu actions owned by this plugin. */
    dshTweaksTabActions: TabActionsKey
  }
}
