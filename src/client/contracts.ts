/**
 * The upstream type surface this plugin is written against.
 *
 * The client half of a DSH plugin extends the host's own declarations: each
 * upstream client package contributes service names, slot declarations and
 * event maps through `declare module` augmentation. Those augmentations only
 * exist in a compilation if the declaring package is imported somewhere, and the
 * convention upstream uses for that is a type-only import of the package's
 * `./client` entry.
 *
 * Collecting the imports here has three consequences worth stating:
 *
 * - One file names the exact upstream surface the plugin depends on, so a
 *   version bump has one place to look.
 * - Type-only imports are erased before bundling, so none of these packages
 *   becomes a runtime dependency of the browser half. An import that is *not*
 *   type-only in a feature file is a build failure instead (see the purity gate
 *   in `tsdown.config.ts`), because it would inline a second copy of another
 *   plugin's runtime identity.
 * - A feature reaches the host through cordis services, never by importing
 *   another plugin's implementation.
 *
 * @module @leiwang2000/dsh-tweaks/client/contracts
 */

// The client context every plugin body receives, augmented below by each
// upstream package's own declaration.
import type { Context as ClientContext } from '@deepseek-ai/cordis'

// --- The extension points a feature contributes through ---------------------

// The Remote call surface those namespaces hang off.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Retained sessions: their workspace root scopes a file listing, and their
// attachment reads back an image's bytes.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Directory listing and change streams for the file tree.
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'
// User-visible copy, so the plugin's own strings follow the host's language.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Attachment identity and media types, as the message renderer sees them.
import type {} from '@deepseek-ai/dsh-client-ui-attachment/client'

// --- The host data a feature reads ------------------------------------------

// The conversation surface: user text rules, and the chat node renderers a
// feature replaces to reach a message's attachments.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Tab identity and placement types shared by the sidebar and its layout.
import type {} from '@deepseek-ai/dsh-client-ui-dockkit'
// File-type classification and its icons, so the file tree stays visually
// identical to the built-in one it replaces.
import type {} from '@deepseek-ai/dsh-client-ui-primitives'
// The right sidebar's navigation face and its tab-type registry, including the
// `extension` priority band that may take over a built-in tab kind.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// The slot registry: how a plugin contributes to any official extension point.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// The workspace path helpers that turn a session-relative path into the
// resource address the sidebar opens.
import type {} from '@deepseek-ai/dsh-util-workspace-path'

export type { ClientContext }
