/**
 * nextjs-microfrontends — Path Matching Engine
 *
 * Matches incoming request paths against routing rules defined in
 * `mfe.config.json`. Uses `path-to-regexp` for pattern matching,
 * which is the same engine Next.js uses internally.
 */

import { match as pathMatch } from 'path-to-regexp';
import type { ResolvedApplication, ResolvedConfig } from './schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of matching a path against the microfrontends config. */
export interface MatchResult {
  /** The matched application. */
  app: ResolvedApplication;
  /** The original request path. */
  path: string;
  /**
   * The target URL to proxy/rewrite to.
   * Includes the application's resolved URL + the original path.
   */
  targetUrl: string;
}

// ---------------------------------------------------------------------------
// Compiled Matchers (cached)
// ---------------------------------------------------------------------------

type CompiledEntry = {
  app: ResolvedApplication;
  test: (path: string) => boolean;
};

const compiledCache = new WeakMap<ResolvedConfig, CompiledEntry[]>();

/**
 * Convert a Next.js-style path pattern to a `path-to-regexp` v6 compatible matcher.
 *
 * path-to-regexp v6 uses:
 * - `:param`  → single named parameter segment
 * - `:param*` → zero or more segments (modifier)
 * - `:param+` → one or more segments (modifier)
 * - `:param?` → optional segment
 *
 * Next.js patterns are already compatible with v6 syntax.
 */
function compilePattern(pattern: string): (path: string) => boolean {
  const fn = pathMatch(pattern, { decode: decodeURIComponent });
  return (path: string): boolean => fn(path) !== false;
}

function getCompiledMatchers(config: ResolvedConfig): CompiledEntry[] {
  const cached = compiledCache.get(config);
  if (cached) return cached;

  const matchers: CompiledEntry[] = [];

  for (const app of config.childApps) {
    for (const group of app.routing) {
      for (const pattern of group.paths) {
        matchers.push({
          app,
          test: compilePattern(pattern)
        });
      }
    }
  }

  compiledCache.set(config, matchers);
  return matchers;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match an incoming request path against the microfrontends routing config.
 *
 * @param path   - The URL pathname (e.g., `/backoffice/users`)
 * @param config - The resolved microfrontends configuration
 * @returns The matched application and target URL, or `null` if the path
 *          should be handled by the default application.
 */
export function matchPath(
  path: string,
  config: ResolvedConfig
): MatchResult | null {
  const matchers = getCompiledMatchers(config);

  for (const { app, test } of matchers) {
    if (test(path)) {
      // Build target URL: app's resolved URL + original path
      const baseUrl = app.resolvedUrl.replace(/\/$/, '');
      const targetUrl = `${baseUrl}${path}`;

      return {
        app,
        path,
        targetUrl
      };
    }
  }

  // No match — the default application handles this path
  return null;
}

/**
 * Check if a path belongs to a different zone (application) than the current one.
 *
 * @param href       - The href to check
 * @param currentApp - The name of the current application
 * @param config     - The resolved config
 * @returns The name of the zone the href belongs to
 */
export function getZoneForPath(
  href: string,
  currentApp: string,
  config: ResolvedConfig
): { zoneName: string; isDifferentZone: boolean } {
  // Remove query string and hash
  // istanbul ignore next -- defensive fallback; split always returns a non-empty string[]
  const pathname = href.split('?')[0]?.split('#')[0] ?? href;

  const result = matchPath(pathname, config);
  if (result) {
    return {
      zoneName: result.app.name,
      isDifferentZone: result.app.name !== currentApp
    };
  }

  // Matched the default app
  return {
    zoneName: config.defaultApp.name,
    isDifferentZone: config.defaultApp.name !== currentApp
  };
}

/**
 * Match a path for static asset routing.
 *
 * Checks if a `/_next/static/` or similar path should be proxied to a child app.
 * This is needed when child apps have `assetPrefix` set.
 *
 * @param path   - The URL pathname
 * @param config - The resolved microfrontends configuration
 * @returns Match result or null
 */
export function matchStaticAssetPath(
  path: string,
  config: ResolvedConfig
): MatchResult | null {
  for (const app of config.childApps) {
    // Check for asset prefix pattern: /{app-name}-static/*
    const assetPrefix = `/${app.name}-static/`;
    if (path.startsWith(assetPrefix)) {
      const baseUrl = app.resolvedUrl.replace(/\/$/, '');
      return {
        app,
        path,
        targetUrl: `${baseUrl}${path}`
      };
    }
  }

  return null;
}
