// @ts-check
import antfu from '@antfu/eslint-config'

/**
 * The message for a host attribute spelled outside its one home.
 *
 * Kept as a constant so the two selectors below say the same thing: the
 * attribute name, where it belongs, and why.
 */
const HOST_ANCHOR_MESSAGE = [
  'A host `data-*` attribute may only be spelled in src/client/dom/host-anchors.ts.',
  'That module is what scripts/check-anchors.mjs verifies against the pinned',
  'upstream tree; a literal here would escape the check and fail silently when',
  'upstream renames it (ADR-0002). This plugin\'s own markers (`data-dsh-tweaks-*`)',
  'are free to be written anywhere.',
].join(' ')

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    antislop: true,
    ignores: [
      // Reference-only submodule, not part of this project's lint surface.
      'deepseek-harness/**',
      // Isolated DSH_HOME used for end-to-end verification; its installed
      // bundles are third-party code, not ours to lint.
      '.verify-home/**',
    ],
  },
  {
    // The anchor names live in one module, which the upstream-existence check
    // reads. Everywhere else reads them through that module.
    //
    // The tests are included on purpose: a stand-in of the host's markup makes
    // a literal read as scenery, yet such a test survives an upstream rename.
    files: ['src/client/**/*.ts', 'test/**/*.ts'],
    ignores: ['src/client/dom/host-anchors.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // The shape is the host's own prefix, not `data-` plus anything: the
        // stand-in and the selector helpers handle bare names like `data-x` as
        // synthetic input, and flagging those would train people to ignore the
        // rule. `data-dsh-tweaks-*` is this plugin's own and is always free.
        {
          selector: 'Literal[value=/^data-(?!dsh-tweaks-)(?:dockkit|sidebar-right|textpreview|files|chat|actions|clock)-/]',
          message: HOST_ANCHOR_MESSAGE,
        },
        // A CSS string is a TemplateElement, not a Literal: the selectors the
        // stylesheets build carry host attributes too.
        {
          selector: 'TemplateElement[value.raw=/\\[data-(?!dsh-tweaks-)(?:dockkit|sidebar-right|textpreview|files|chat|actions|clock)-/]',
          message: HOST_ANCHOR_MESSAGE,
        },
      ],
    },
  },
)
