/**
 * The open-file seam (ticket #5 fills this in).
 *
 * A file row in the panel can mean three different things, and the choice is a
 * pure function of what is already open:
 *
 * - the address is not open anywhere **and the acting tab is the pure file list
 *   page** → take that tab's slot and close it in the same step (`replaceTab`),
 *   which is the official "replace in place" ability: the file lands where the
 *   file-list tab was, and no second tab appears. That is the built-in files
 *   tab's own behaviour and it is kept;
 * - the address is not open anywhere **and the acting tab is a file tab** → a
 *   plain open. The panel is docked beside a file the reader is reading; taking
 *   that tab's slot would throw the document away from under them, so the panel
 *   only ever opens or focuses, never replaces (Q3);
 * - the address is already open elsewhere → focus that tab and close the current
 *   one. The host has no single API for that pair (sidebar notes §2.4:
 *   `revealIfOpened` reveals but does not close the caller), so the plan spells
 *   out both steps and the executor runs them in the order that never leaves the
 *   pane empty;
 * - the current tab floats → degrade to a plain open. A floating pane holds one
 *   tab and lends no slot, so `replaceTab` cannot mean anything there; the host's
 *   own store treats the request as unplaced, and this seam says so explicitly
 *   rather than relying on that.
 *
 * The "pure file list page" fact is an input (`currentIsFilesPage`) rather than
 * something read off `current.kind` here, because naming the files kind is the
 * entry module's business: this file must stay free of the panel's own
 * vocabulary, so `index.ts` answers that question where it already imports
 * `FILES_KIND`.
 *
 * **Generic over the tab-id type, and that is the whole trick.** The host brands
 * its ids (`TabId` is `string & { [BRAND] }`), and `openResourceIn`/`focus`/
 * `closeIn` all take the branded type. If this seam erased ids to `string`, every
 * call site would need a cast to put the brand back, which is a lie about a value that
 * came *from* the host and would be going straight back to it. Parameterising the
 * plans and inputs by `<Id extends string>` keeps the pure functions free of any
 * host import while letting the entry module infer `Id = TabId` and pass the plan
 * through untouched.
 *
 * The inputs are still minimal structural shapes, on purpose: nothing here names
 * a pane, a layout, or any type the panel owns, so #5 can change this file alone
 * and #6 can change `activation.ts` alone.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/open-file
 */

/** The parts of a tab record this decision needs. `TabRecord` satisfies it. */
export interface OpenTabLike<Id extends string = string> {
  /** The tab's identity. */
  readonly id: Id
  /** The tab kind; the files tab's own kind is what a page tab identifies itself by. */
  readonly kind: string
  /** The address the tab shows: a resource address for a viewer, a page address otherwise. */
  readonly contentId: string
}

/** How a file row should be opened, as data. */
export type OpenFilePlan<Id extends string = string>
  /** Open a resource without touching any tab. */
  = | { readonly kind: 'open', readonly address: string }
  /** Open a resource, taking a tab's slot and closing it in the same step. */
    | { readonly kind: 'replace', readonly address: string, readonly replaceTab: Id }
  /** Bring an already-open tab forward, then close the tabs that are done with. */
    | { readonly kind: 'focus', readonly focusTabId: Id, readonly closeTabIds: readonly Id[] }

/** What a plan needs to know about the gesture's context. */
export interface OpenFileInput<Id extends string = string> {
  /** The resource address of the file the user clicked. */
  readonly address: string
  /** The tab the gesture came from: the file-list tab, or the file tab the panel is docked in. */
  readonly current: OpenTabLike<Id> | undefined
  /** Every tab open in the same session, in any order. */
  readonly open: readonly OpenTabLike<Id>[]
  /** Whether the host would actually close this tab now; a refused close is a no-op, not an error. */
  readonly canClose: (tabId: Id) => boolean
  /**
   * Whether the current tab is docked. A floating tab lends no slot, so a
   * replacement degrades to a plain open there, which is the upstream behaviour.
   */
  readonly currentDocked: boolean
  /**
   * Whether the current tab is the pure file list page (`kind === 'files'`).
   *
   * Only that page lends its slot: a file tab holding a docked panel is docked
   * too, and replacing it would close the document the reader is reading. The
   * two facts are separate on purpose, since a files page can float and a file
   * tab can dock, so both are needed to answer "replace or open".
   */
  readonly currentIsFilesPage: boolean
}

/**
 * Decide how to open one file from the panel.
 * @param input - the address, the acting tab, the open set, and the three facts about the current tab.
 * @returns the plan to hand to {@link applyOpenFilePlan}.
 */
export function planOpenFile<Id extends string>(input: OpenFileInput<Id>): OpenFilePlan<Id> {
  const { address, current, open, canClose, currentDocked, currentIsFilesPage } = input
  const existing = open.find(tab => tab.contentId === address)
  if (existing !== undefined) {
    // Same tab: nothing to reveal and nothing to close.
    //
    // Only the file list page is done with once its file is on screen. A file
    // tab holding a docked panel keeps its place, or the panel would leave with
    // it and the reader could not click the next file.
    const acting = current !== undefined && current.id !== existing.id && canClose(current.id)
    const closeTabIds = acting && currentIsFilesPage ? [current.id] : []
    return { kind: 'focus', focusTabId: existing.id, closeTabIds }
  }
  // Both facts are required: only a docked *file list* lends its slot. Any
  // other acting tab (a file tab with the panel docked in it) keeps its place,
  // and the open lands in a tab of its own.
  if (current !== undefined && currentDocked && currentIsFilesPage)
    return { kind: 'replace', address, replaceTab: current.id }
  return { kind: 'open', address }
}

/** The one placement a plan ever asks for: the tab to take the slot of. */
interface ReplacePlacement<Id extends string> {
  /** Take this tab's pane and slot, and close it in the same step. */
  readonly replaceTab?: Id
}

/**
 * The sidebar operations a plan needs.
 *
 * `ISidebarRight` satisfies it, and so does the session-qualified face this
 * plugin actually calls (`openResourceIn` / `closeIn`), which is why the
 * operations are named for what they do rather than for one host method.
 */
export interface OpenFileSidebar<Id extends string = string> {
  /**
   * Open a resource, optionally taking a tab's place.
   * @param address - the resource address.
   * @param placement - how the open lands.
   */
  readonly openResource: (address: string, placement?: ReplacePlacement<Id>) => void
  /**
   * Bring a tab forward.
   * @param tabId - the tab to focus.
   */
  readonly focus: (tabId: Id) => void
  /**
   * Close one tab.
   * @param tabId - the tab to close.
   */
  readonly close: (tabId: Id) => void
}

/**
 * Run a plan against a sidebar.
 *
 * Order matters in the focus case: focusing first and closing second means the
 * pane always holds a visible tab, while the reverse can empty it for a frame.
 * @param sidebar - the navigation face to act through.
 * @param plan - the decision from {@link planOpenFile}.
 */
export function applyOpenFilePlan<Id extends string>(sidebar: OpenFileSidebar<Id>, plan: OpenFilePlan<Id>): void {
  switch (plan.kind) {
    case 'open':
      sidebar.openResource(plan.address)
      return
    case 'replace':
      sidebar.openResource(plan.address, { replaceTab: plan.replaceTab })
      return
    case 'focus':
      sidebar.focus(plan.focusTabId)
      for (const tabId of plan.closeTabIds) sidebar.close(tabId)
  }
}
