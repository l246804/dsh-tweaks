/**
 * The panel's stylesheet, and the two layout facts it is responsible for.
 *
 * The tree's own numbers are the built-in tree's, copied value for value: a
 * reader who has used the shipped files tab must not be able to tell that a
 * plugin took the type over. The two additions are the ones the takeover needs
 * and the built-in tree never had:
 *
 * 1. **The filter row.** It has to sit above the tree and inside the file tab's
 *    body, so the tree's own scrolling cannot carry it away. It is a sibling of
 *    the scroller, not an overlay.
 * 2. **The side-by-side dock.** When the panel is docked in a *file* tab, the
 *    file's preview and the panel share the tab body. That is expressed as a
 *    flex row on the marked host, with the preview taking the remaining width
 *    and keeping its own scrolling. Both halves must be able to shrink, or the
 *    row overflows instead of splitting.
 *
 * The page case (the panel *is* the file-list tab) needs no host rule at all:
 * the host's only child is the panel, which fills it.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/styles
 */

import { PANEL_CONTAINER_ATTRIBUTE, PANEL_HOST_ATTRIBUTE } from './panel-host.ts'

/**
 * The panel's stylesheet.
 *
 * Every value comes from the theme tokens the built-in tree uses, so the panel
 * follows the active theme instead of pinning colors of its own.
 * @returns the stylesheet text.
 */
export function panelStyles(): string {
  return `
[${PANEL_HOST_ATTRIBUTE}='page'] {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* A file tab holds two things: the file, then the panel. Both shrink; the
   preview grows. The panel's own width is fixed so a path never re-wraps as
   the file's content changes. */
[${PANEL_HOST_ATTRIBUTE}='dock'] {
  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 0;
}

[${PANEL_HOST_ATTRIBUTE}='dock'] > * {
  min-width: 0;
  min-height: 0;
}

[${PANEL_HOST_ATTRIBUTE}='dock'] > [${PANEL_CONTAINER_ATTRIBUTE}] {
  flex: 0 0 auto;
  width: var(--dsh-tweaks-file-panel-width, 260px);
  border-left: 0.5px solid var(--dsw-alias-border-l4);
}

[${PANEL_HOST_ATTRIBUTE}='page'] > [${PANEL_CONTAINER_ATTRIBUTE}] {
  flex: 1 1 auto;
  min-height: 0;
}

[${PANEL_CONTAINER_ATTRIBUTE}] {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
  background: var(--dsw-alias-bg-base);
}

/* The filter row: above the tree, inside the tab body, so the tree's scroll
   cannot carry it away. */
[${PANEL_CONTAINER_ATTRIBUTE}] > .filter {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  padding: 8px 10px 6px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] > .filter > input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm, 8px);
  outline: none;
}

[${PANEL_CONTAINER_ATTRIBUTE}] > .filter > input:focus {
  border-color: var(--dsw-alias-border-l4);
}

[${PANEL_CONTAINER_ATTRIBUTE}] > .filter > input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

/* The scroller. Values copied from the built-in tree's .body. */
[${PANEL_CONTAINER_ATTRIBUTE}] > .body {
  flex: 1 1 auto;
  min-height: 0;
  margin-right: 2px;
  padding: 8px 0 8px 8px;
  overflow: auto;
  scrollbar-gutter: stable;
}

[${PANEL_CONTAINER_ATTRIBUTE}] > .body::-webkit-scrollbar-track {
  margin: 2px;
}

/* Nesting, not inline indentation: copied from the built-in tree. */
[${PANEL_CONTAINER_ATTRIBUTE}] ul.level {
  margin: 0;
  padding: 0;
  list-style: none;
}

[${PANEL_CONTAINER_ATTRIBUTE}] ul.level ul.level {
  padding-left: 18px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] li.item {
  margin: 0;
  padding: 0;
}

/* A row. Values copied from the built-in tree's .row. */
[${PANEL_CONTAINER_ATTRIBUTE}] button.row,
[${PANEL_CONTAINER_ATTRIBUTE}] span.row {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 5px 10px;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-md, 12px);
  cursor: pointer;
}

[${PANEL_CONTAINER_ATTRIBUTE}] button.row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* The current file. The built-in tree has no active state because it never
   needed one; the panel marks the row the active tab shows, and this is the
   only addition to the row's appearance. */
[${PANEL_CONTAINER_ATTRIBUTE}] button.row[aria-current='true'] {
  background: var(--dsw-alias-interactive-bg-active);
}

[${PANEL_CONTAINER_ATTRIBUTE}] .icon {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-tertiary);
}

[${PANEL_CONTAINER_ATTRIBUTE}] .fileIcon {
  flex: 0 0 auto;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

[${PANEL_CONTAINER_ATTRIBUTE}] span.row.other {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

[${PANEL_CONTAINER_ATTRIBUTE}] span.row.other:hover {
  background: transparent;
}

/* State lines. Values copied from the built-in tree's .note. */
[${PANEL_CONTAINER_ATTRIBUTE}] li.note {
  margin: 0;
  padding: 3px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .status {
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .statusLine {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.6;
}
`
}
