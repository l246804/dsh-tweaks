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
// The snapshot-store types the slot system's derived seats are declared
// against. The slot packages import that surface themselves, so the package
// must be installed regardless; this edge is what declares it used, and without
// it `knip` reports an unused devDependency. Compilation-time only.
import type {} from '@deepseek-ai/dsh-client-store'

// --- The host data a feature reads ------------------------------------------

// Attachment identity and media types, as the message renderer sees them.
import type {} from '@deepseek-ai/dsh-client-ui-attachment/client'
// The chat node registry and renderer slots, declared by the package that
// renders a message row.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// The conversation surface: user text rules, and the chat node renderers a
// feature replaces to reach a message's attachments.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Tab identity and placement types shared by the sidebar and its layout.
import type {} from '@deepseek-ai/dsh-client-ui-dockkit'
// File-type classification and its icons, so the file tree stays visually
// identical to the built-in one it replaces.
import type {} from '@deepseek-ai/dsh-client-ui-primitives'
// The renderer's slot and component contracts, which a feature's registered
// component is typed against.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// The document preview: the file tab's body, and the toolbar seats beside it.
// Its `sidebar.right.tab.document.actions` declaration is what types this
// plugin's file-list toggle; only the type is reachable, because the package is
// not a row of the shell's module table (see `features/file-panel/toolbar.ts`).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
// The right sidebar's navigation face and its tab-type registry, including the
// `extension` priority band that may take over a built-in tab kind.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// The slot registry: how a plugin contributes to any official extension point.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// The workspace path helpers that turn a session-relative path into the
// resource address the sidebar opens.
import type {} from '@deepseek-ai/dsh-util-workspace-path'

// --- The rendering surface the browser half is compiled against -------------

// React and its DOM client are platform modules: the shell injects its own
// single instances through the module table, and the plugin never ships a copy.
// They are bound here as the compile-time contract for every registered
// component and for the plugin-owned root it mounts its panel into.
import type {} from 'react'
import type {} from 'react-dom/client'

export type { ClientContext }
