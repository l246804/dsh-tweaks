// @ts-check
import antfu from '@antfu/eslint-config'

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
)
