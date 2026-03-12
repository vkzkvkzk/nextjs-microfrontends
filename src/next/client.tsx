// NOTE: 'use client' is added by tsup banner — do not add it here

/**
 * nextjs-microfrontends — Client Components
 *
 * React components and hooks for cross-zone navigation in microfrontend setups.
 *
 * - `MicrofrontendsLink` — Zone-aware link that does a full page navigation
 *   for cross-zone links and SPA navigation (Next.js Link) for same-zone links.
 * - `useMicrofrontendZone` — Hook to determine which zone a given href belongs to.
 *   Uses the same `path-to-regexp` matcher as the server middleware for consistency.
 */

import React, { useMemo, type AnchorHTMLAttributes, type JSX } from 'react';
import NextLink from 'next/link';
import { getZoneForPath } from '../config/matcher';

// ---------------------------------------------------------------------------
// Client-side config (serialized at build time via MFE_CONFIG env var)
//
// MFE_CONFIG is the full ResolvedConfig — see schema.ts
// ---------------------------------------------------------------------------

import type { ResolvedConfig } from '../config/schema';

let cachedClientConfig: ResolvedConfig | null = null;

export function getClientConfig(): ResolvedConfig {
  if (cachedClientConfig) return cachedClientConfig;

  // NEXT_PUBLIC_ vars are inlined at build time into client bundles by Next.js.
  // Prefer NEXT_PUBLIC_ prefixed vars (Vercel convention), fall back to server-only.
  const raw = process.env.NEXT_PUBLIC_MFE_CONFIG ?? process.env.MFE_CONFIG;
  if (!raw) {
    // Return empty config — microfrontends not configured
    return {
      defaultApp: {
        name: '',
        isDefault: true,
        routing: [],
        resolvedUrl: '',
        fallbackUrl: ''
      },
      childApps: [],
      applications: {}
    };
  }

  try {
    cachedClientConfig = JSON.parse(raw) as ResolvedConfig;
    return cachedClientConfig;
  } catch {
    console.warn('[nextjs-microfrontends] Failed to parse MFE_CONFIG');
    return {
      defaultApp: {
        name: '',
        isDefault: true,
        routing: [],
        resolvedUrl: '',
        fallbackUrl: ''
      },
      childApps: [],
      applications: {}
    };
  }
}

export function getCurrentApp(): string {
  return (
    process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION ??
    process.env.MFE_CURRENT_APPLICATION ??
    ''
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Determines which microfrontend zone a given href belongs to.
 *
 * Uses the shared `path-to-regexp`-based matcher so that client-side
 * zone resolution is always consistent with the server-side middleware.
 *
 * @param href - The URL path to check
 * @returns Zone information
 */
export function useMicrofrontendZone(href: string): {
  /** Name of the zone the href belongs to */
  zoneName: string;
  /** Whether the href points to a different zone than the current one */
  isDifferentZone: boolean;
} {
  const config = getClientConfig();
  const currentApp = getCurrentApp();

  return useMemo(
    () => getZoneForPath(href, currentApp, config),
    [href, config, currentApp]
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface MicrofrontendsLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** The URL to navigate to. */
  href: string;
  /** Content to render inside the link. */
  children: React.ReactNode;
  /**
   * If true, always use a full-page navigation (never SPA).
   * Useful for links that should always reload the page.
   */
  forceReload?: boolean;
}

/**
 * A zone-aware link component for microfrontend applications.
 *
 * - **Same zone**: Renders a Next.js `<Link>` for client-side (SPA) navigation.
 * - **Different zone**: Renders a standard `<a>` tag that triggers a full
 *   page navigation, which is required for cross-zone transitions.
 *
 * Accessibility: Uses semantic elements with proper attributes.
 *
 * @example
 * ```tsx
 * import { MicrofrontendsLink } from 'nextjs-microfrontends/next/client';
 *
 * function Nav() {
 *   return (
 *     <nav aria-label="Main navigation">
 *       <MicrofrontendsLink href="/dashboard">Dashboard</MicrofrontendsLink>
 *       <MicrofrontendsLink href="/backoffice">Backoffice</MicrofrontendsLink>
 *     </nav>
 *   );
 * }
 * ```
 */
export function MicrofrontendsLink({
  href,
  children,
  forceReload,
  ...props
}: Readonly<MicrofrontendsLinkProps>): JSX.Element {
  const { isDifferentZone } = useMicrofrontendZone(href);

  // Cross-zone or forced reload: use a native <a> for full page navigation
  if (isDifferentZone || forceReload) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  // Same zone: use Next.js Link for SPA navigation
  return (
    <NextLink href={href} {...props}>
      {children}
    </NextLink>
  );
}
