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
    files: ['src/client/**/*.ts'],
    ignores: ['src/client/dom/host-anchors.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/^data-(?!dsh-tweaks-)/]', message: HOST_ANCHOR_MESSAGE },
        // A CSS string is a TemplateElement, not a Literal: the selectors the
        // stylesheets build carry host attributes too.
        { selector: 'TemplateElement[value.raw=/\\[data-(?!dsh-tweaks-)/]', message: HOST_ANCHOR_MESSAGE },
      ],
    },
  },
)
