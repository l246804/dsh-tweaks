import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      // Reference-only submodule, not part of this project's test surface.
      'deepseek-harness/**',
      // Isolated DSH_HOME used for end-to-end verification.
      '.verify-home/**',
    ],
  },
})
