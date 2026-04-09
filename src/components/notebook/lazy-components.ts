/**
 * lazy-components.ts
 *
 * Single source of truth for all React.lazy imports in the notebook feature.
 *
 * WHY: If the same dynamic import string appears in multiple files, bundlers
 * (Vite/Webpack) may create separate chunks or at minimum lose the opportunity
 * to de-duplicate the module in the runtime module registry. Centralising here
 * ensures each heavy component is fetched and cached exactly once.
 *
 * WHAT goes here: components that are CONDITIONALLY rendered (dialogs, panels
 * that only some users/flows ever open). ChatArea and StudioSidebar are eager-
 * loaded directly in Notebook.tsx because they render on every /notebook visit.
 */

import { lazy } from 'react';

// ---------- Notebook-level heavy panels ----------

/** Activity log panel — only members see this; defer until first open */
export const LazyActivityPanel = lazy(() => import('./ActivityPanel'));

/** Collaboration member panel — only loaded when "Thành viên" button clicked */
export const LazyMemberPanel = lazy(() => import('./MemberPanel'));

/** Mobile tab layout — mutually exclusive with desktop layout (~60% sessions skip) */
export const LazyMobileNotebookTabs = lazy(() => import('./MobileNotebookTabs'));

// ---------- Dialogs — hidden until user action ----------

/**
 * AddSourcesDialog — 17.8 KB, only mounts when user clicks "Thêm nguồn".
 * Centralised here so ChatArea + SourcesSidebar share a single module instance
 * and the chunk is fetched exactly once regardless of which trigger fires first.
 */
export const LazyAddSourcesDialog = lazy(() => import('./AddSourcesDialog'));
