/**
 * Host half of `@leiwang2000/dsh-tweaks`.
 *
 * The package's substance is the browser half, which ships through
 * `exports["./client"]` and is declared by `dsh.client`. The bundle layer
 * (`cordis.patch.yml`) mounts this package as one row, so the Loader needs a
 * host-side module to import; an empty `apply()` supplies it, exactly as the
 * official `ui-*` browser plugins do.
 *
 * @module @leiwang2000/dsh-tweaks
 */

/** Host plugin body. This package contributes browser presentation only. */
export function apply(): void {}
