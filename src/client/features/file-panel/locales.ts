/**
 * The panel's copy, and the namespace it lives in.
 *
 * A third-party plugin owns its own namespace: `sidebarFiles` and its keys
 * belong to the shipped tree, and claiming them would collide at registration.
 * The keys are therefore the same ideas under this plugin's namespace, so the
 * panel can say the same things in the same situations.
 *
 * `LocaleNamespaceMap` is declared with this package's key set, which is what
 * makes `TranslateNS<NS>` total: a key missing from either dictionary is a
 * compile error rather than a raw string on screen.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/locales
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** This plugin's copy namespace. */
export const NS = 'dshTweaksFiles'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The file panel's tree states, its filter, and its dock toggle. */
    dshTweaksFiles: DshTweaksFilesKey
  }
}

/** Simplified Chinese dictionary and the key-set source of truth. */
export const ZH = {
  'loading': '正在读取…',
  'type.label': '文件',
  'guide.title': '工作区文件',
  'guide.description': '浏览会话工作区的文件',
  'empty': '空目录',
  'filter.placeholder': '筛选文件',
  'filter.aria': '按名称筛选文件和目录',
  'panel.show': '显示文件列表',
  'panel.hide': '隐藏文件列表',
  'panel.aria': '文件列表',
  'noWorkspace': '这个会话没有工作区目录。',
  'truncated': '条目太多，只显示了一部分。',
  'entry.other': '这不是文件或目录，没法打开。',
  'error.notFound': '这个目录不在了。可能已被移动或删除。',
  'error.outsideWorkspace': '这个目录在工作区之外，侧栏不会读取它。',
  'error.notDirectory': '这不是一个目录。',
  'error.watchUnsupported': '这个文件系统不支持自动刷新，列表只在打开时读取一次。',
  'error.unavailable': '读取失败：{message}',
} satisfies Record<string, string>

/** The panel's dictionary key union. */
export type DshTweaksFilesKey = keyof typeof ZH

/** English dictionary, checked against the Chinese key set. */
export const EN = {
  'loading': 'Reading…',
  'type.label': 'Files',
  'guide.title': 'Workspace files',
  'guide.description': 'Browse files in this session\'s workspace',
  'empty': 'Empty directory',
  'filter.placeholder': 'Filter files',
  'filter.aria': 'Filter files and directories by name',
  'panel.show': 'Show file list',
  'panel.hide': 'Hide file list',
  'panel.aria': 'File list',
  'noWorkspace': 'This session has no workspace directory.',
  'truncated': 'Too many entries, showing only some of them.',
  'entry.other': 'Not a file or a directory, so it cannot be opened.',
  'error.notFound': 'That directory is gone. It may have been moved or deleted.',
  'error.outsideWorkspace': 'That directory is outside the workspace, so the sidebar will not read it.',
  'error.notDirectory': 'That is not a directory.',
  'error.watchUnsupported': 'This filesystem cannot watch for changes, so the list is read once when opened.',
  'error.unavailable': 'Read failed: {message}',
} satisfies Record<DshTweaksFilesKey, string>
