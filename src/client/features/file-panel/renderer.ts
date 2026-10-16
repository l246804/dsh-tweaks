/**
 * The panel's React root.
 *
 * The feature's central constraint is that the panel exists **once**: one DOM
 * subtree, one state, moved between file tabs rather than rebuilt per tab. React
 * gives that property only if the root is created over an element this plugin
 * owns and keeps. A root created inside the shell's per-tab body would be
 * unmounted and re-created with every switch, which is precisely the "N trees,
 * N sets of subscriptions, lost expansion" failure the issue describes.
 *
 * So this module does one thing: it creates a root over the panel's own
 * container and re-renders into it. The container's *location* changes; the root
 * never does. That is also why the render function is `render(container, view)`
 * rather than a component: the mount layer moves the container, and this layer
 * only ever redraws the tree that lives inside it.
 *
 * One consequence of `createRoot` is worth stating where the wiring is: what
 * `render` performs is a *request*, not a commit. The rows the view describes are
 * in the DOM only when React has committed, so anything that has to measure them
 * (centring the active row) is driven by the view's own ref callback rather than
 * by the return of `render`. {@link RendererOptions.onScroller} is that channel;
 * `panel-mount.ts` says what the mount does with it.
 *
 * `react-dom/client` is a row of the shell's platform module table, so this is a
 * `require` the shell answers with its own single instance rather than a second
 * copy of React; see `react-dom.d.ts` for why the local types are declared.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/renderer
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Root } from 'react-dom/client'
import type { PanelRenderer, PanelView } from './panel-mount.ts'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelBody } from './view.ts'

/** The callbacks the root render needs beyond the state it draws. */
export interface RendererOptions {
  /** The bound translate function. */
  readonly t: () => TranslateNS<'dshTweaksFiles'>
  /** Expand or collapse one directory. */
  readonly onToggle: (path: string) => void
  /** Open one file. */
  readonly onOpen: (path: string) => void
  /** Change the filter. */
  readonly onFilter: (filter: string) => void
  /** Reload the current root directory. */
  readonly onReload: () => void
  /** Record the scroller's offset. */
  readonly onScroll: (scrollTop: number) => void
  /**
   * The scroller's offset to restore when the panel arrives somewhere new.
   * @returns the offset to assign.
   */
  readonly scrollTop: () => number
  /**
   * The panel's scroller element, as the last render mounted it.
   *
   * Called from the view's ref, i.e. during React's commit, which makes it the
   * panel's "the last draw is on screen" signal. The mount uses it to run a
   * reveal the row would have been missing from at decision time.
   * @param element - the scroller.
   */
  readonly onScroller: (element: HTMLElement) => void
}

/**
 * Build the panel's renderer, owning one React root over the container it is
 * first given.
 *
 * The root is created lazily, on the first render, because the renderer is built
 * during install and the container is only handed over when the panel is drawn.
 * @param options - the callbacks the view needs.
 * @returns a renderer plus a disposer that unmounts the root.
 */
export function createPanelRenderer(options: RendererOptions): {
  readonly render: PanelRenderer<Element>
  readonly dispose: () => void
} {
  let root: Root | undefined
  let mounted: Element | undefined

  return {
    render(container, view: PanelView) {
      // The container is one element for the plugin's whole life, so this branch
      // is a guard against a caller that violates that, not a normal path.
      if (root === undefined || mounted !== container) {
        root?.unmount()
        root = createRoot(container)
        mounted = container
      }
      root.render(createElement(PanelBody, {
        state: view.state,
        docked: view.docked,
        t: options.t(),
        onToggle: options.onToggle,
        onOpen: options.onOpen,
        onFilter: options.onFilter,
        onReload: options.onReload,
        onScroll: options.onScroll,
        restoreScrollTop: options.scrollTop(),
        onScrollerReady: options.onScroller,
      }))
    },
    dispose() {
      root?.unmount()
      root = undefined
      mounted = undefined
    },
  }
}
