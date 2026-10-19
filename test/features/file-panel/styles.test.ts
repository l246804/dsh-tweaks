/**
 * What the panel's stylesheet rules are anchored on.
 *
 * The declarations are the look, and the look is the eye's job: a test that
 * pinned `overflow` or `grid-template-columns` would block the next person from
 * adjusting them. What is not the eye's job is *which element* a rule can reach,
 * because a wrong anchor here is invisible in review and total in effect. Two
 * such anchors are pinned below, both of them bugs this file exists to keep
 * fixed:
 *
 * - the tree's scroller. The filter row and the scroller are children of the
 *   tree's own root, so a rule hanging them off the panel container (one level
 *   too high) matches nothing and the list cannot scroll. The selector text is
 *   asserted as *text with the child combinator*, since `.root > .body` and
 *   `.root .body` are the difference between a rule that reaches the scroller
 *   and one that only would if the markup changed.
 * - the dock's host. The panel is docked into the preview's own root, whose
 *   class names carry a build hash, so the grid has to be keyed off the host's
 *   `data-*` attribute and the toolbar row off `:has()`, never off a class.
 *
 * The rule set is also checked for the two shapes that make a stylesheet fail
 * silently: unbalanced braces, and a rule that wins by escalating instead of by
 * anchoring (`!important`).
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/styles
 */

import { describe, expect, it } from 'vitest'
import { TEXT_PREVIEW_ANCHORS } from '../../../src/client/dom/host-anchors.ts'
import { PANEL_CONTAINER_ATTRIBUTE, PANEL_HOST_ATTRIBUTE } from '../../../src/client/features/file-panel/panel-host.ts'
import {
  PANEL_WIDTH_VARIABLE,
  panelScrollerSelector,
  panelStyles,
  previewBodySelector,
  previewDockSelector,
  previewLoadingSelector,
  previewToolbarSelector,
} from '../../../src/client/features/file-panel/styles.ts'

const container = `[${PANEL_CONTAINER_ATTRIBUTE}]`
const dock = `[${PANEL_HOST_ATTRIBUTE}='dock']`

/** The preview root's state anchor, as the stylesheet spells it. */
const previewState = TEXT_PREVIEW_ANCHORS.state.name

/** The path label inside the preview's toolbar row. */
const previewPath = TEXT_PREVIEW_ANCHORS.path.name

/** The preview's body anchor. */
const previewBody = TEXT_PREVIEW_ANCHORS.body.name

describe('the tree’s own root', () => {
  it('carries the height chain, without which nothing below it can scroll', () => {
    // The built-in tree's `.root`. Its `flex-direction: column` is what makes
    // the scroller's `flex: 1 1 auto` mean anything at all.
    const css = panelStyles()
    const rule = css.slice(css.indexOf(`${container} .root {`))
    expect(rule.slice(0, rule.indexOf('}'))).toContain('flex-direction: column')
  })

  it('is what the filter and the scroller hang off, not the panel container', () => {
    const css = panelStyles()
    expect(css).toContain(`${container} .root > .filter {`)
    expect(css).toContain(`${container} .root > .body {`)
  })

  it('is never skipped by a child combinator on the container itself', () => {
    // The regression this file guards: `[data-…] > .body` looks right and
    // matches nothing, because `.body` is a grandchild in the rendered markup.
    expect(panelStyles()).not.toContain(`${container} > .body`)
    expect(panelStyles()).not.toContain(`${container} > .filter`)
  })
})

describe('the scroller selector', () => {
  it('names the scroller through the root, with the child combinator', () => {
    expect(panelScrollerSelector()).toBe(`${container} .root > .body`)
  })

  it('carries `overflow: auto`, which is the whole of "the list can scroll"', () => {
    // Not a look: without `overflow` on the scroller the list cannot scroll at
    // all, and without `min-height: 0` the flex parent refuses to shrink it.
    const css = panelStyles()
    const rule = css.slice(css.indexOf(`${panelScrollerSelector()} {`))
    const body = rule.slice(0, rule.indexOf('}'))
    expect(body).toContain('overflow: auto')
    expect(body).toContain('min-height: 0')
  })
})

describe('the dock host', () => {
  it('is anchored on the preview’s state attribute, which is not hashed', () => {
    expect(previewDockSelector()).toBe(`[${previewState}]${dock}`)
  })

  it('never anchors on a CSS-module class, which changes every build', () => {
    // `_header_1a2b3` and friends: a rule written against one would break on the
    // next build, silently.
    const css = panelStyles()
    // 每个状态锚点之后紧跟的那段选择器文本里，都不允许出现 CSS-module 的 `._` 类名。
    // 按锚点切开再逐段检查，与「锚点 + 连续非空白字符 + `._`」是同一个判定，
    // 区别只在于锚点仍然只来自常量。
    for (const segment of css.split(`[${previewState}]`).slice(1))
      expect(segment).not.toMatch(/^[^\s{]*\._/)
    expect(css).not.toContain('_header_')
    expect(css).not.toContain('_body_')
  })

  it('finds the preview’s toolbar row through the path label it holds', () => {
    // The row carries no attribute of its own, so `:has()` over the marker
    // inside it is the only anchor that is not a hashed class name.
    expect(previewToolbarSelector()).toBe(`${previewDockSelector()} > :has([${previewPath}])`)
  })

  it('lays the host out as a grid with the toolbar row spanning both columns', () => {
    // Which element carries the grid is the anchor (the eye cannot check it in
    // review, and a wrong one matches nothing). The track sizes and the exact
    // span value are the look, and are the eye's to judge.
    const css = panelStyles()
    const rule = css.slice(css.indexOf(`${previewDockSelector()} {`))
    const host = rule.slice(0, rule.indexOf('}'))
    expect(host).toContain('display: grid')
    const toolbar = css.slice(css.indexOf(`${previewToolbarSelector()} {`))
    expect(toolbar.slice(0, toolbar.indexOf('}'))).toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })

  it('gives the preview’s body and the panel the two sides of one row', () => {
    // The selectors are the contract; which column each lands in is the look.
    expect(previewBodySelector()).toBe(`${previewDockSelector()} > [${previewBody}]`)
    const css = panelStyles()
    expect(css).toContain(`${previewDockSelector()} > ${container} {`)
    const body = css.slice(css.indexOf(`${previewBodySelector()} {`))
    expect(body.slice(0, body.indexOf('}'))).toContain('grid-column: 1')
    const panel = css.slice(css.indexOf(`${previewDockSelector()} > ${container} {`))
    expect(panel.slice(0, panel.indexOf('}'))).toContain('grid-column: 2')
  })

  it('puts anything it was not told about in the content column', () => {
    // A state the host adds later lands here rather than breaking the layout.
    expect(panelStyles()).toContain(`${previewDockSelector()} > :not(${container}) {`)
  })

  it('names the loading state, whose marker sits on the status box itself', () => {
    // In that state the panel is a second child of a one-line box, so the rule
    // that tells the line to centre itself has to be keyed on the state value
    // rather than reusing the generic content rule.
    expect(previewLoadingSelector()).toBe(`[${previewState}='loading']${dock}`)
    const css = panelStyles()
    const rule = css.slice(css.indexOf(`${previewLoadingSelector()} > :not(${container}) {`))
    expect(rule.slice(0, rule.indexOf('}'))).toContain('align-self: center')
  })

  it('leaves the loading state’s rules after the generic ones, so they win the tie', () => {
    // Same attribute count means the cascade falls back to source order: the
    // state-specific rule can only win if it is written second.
    const css = panelStyles()
    expect(css.indexOf(`${previewLoadingSelector()} > ${container} {`))
      .toBeGreaterThan(css.indexOf(`${previewDockSelector()} > ${container} {`))
  })
})

describe('the width', () => {
  it('is read from the custom property the resizer writes', () => {
    // The contract is the custom property, not the fallback number: the resizer
    // writes that property, and the stylesheet's `width` must read it. The
    // fallback pixel value is the look and is the eye's to judge.
    expect(panelStyles()).toContain(`width: var(${PANEL_WIDTH_VARIABLE},`)
  })
})

describe('the page header', () => {
  it('is scoped to the tree’s root, so a docked panel draws none', () => {
    // The header is the page form's alone; `view.ts` decides that, and the rule
    // has to be able to reach it when it is drawn.
    expect(panelStyles()).toContain(`${container} .root > .header {`)
  })
})

describe('the chip glyph', () => {
  it('is reached by the class the title component writes, unscoped', () => {
    // The chip is drawn on the tab, not inside the panel, so a rule carrying the
    // panel-container prefix could never match it. The class is the plugin's own
    // (`title.ts`), which is what keeps an unscoped rule here safe.
    expect(panelStyles()).toContain('\n.titleIcon {')
    expect(panelStyles()).not.toContain(`${container} .titleIcon`)
  })
})

describe('the stylesheet as CSS', () => {
  it('is non-empty and closes every block it opens', () => {
    // The stylesheet is text handed to the host's document; a truncated one
    // would silently swallow every rule after the break.
    const css = panelStyles()
    const opens = css.split('{').length - 1
    const closes = css.split('}').length - 1
    expect(opens).toBeGreaterThan(0)
    expect(opens).toBe(closes)
  })

  it('does not reach for `!important` to win', () => {
    // The weight comes from the anchor, not from an escalation: the host's own
    // preview stylesheet must keep the last word on everything this plugin did
    // not mean to change. Comments are stripped first, because the stylesheet
    // *says* it does not escalate and that sentence must not read as a
    // declaration.
    expect(declarations()).not.toContain('!important')
  })
})

/**
 * The stylesheet with its comments removed.
 *
 * Only the declarations can win a cascade; the prose above them explains the
 * rules and is checked separately.
 * @returns the declaration text.
 */
function declarations(): string {
  return panelStyles().replaceAll(/\/\*[\s\S]*?\*\//gu, '')
}
