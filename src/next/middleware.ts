/**
 * nextjs-microfrontends — Next.js Middleware
 *
 * Provides routing middleware for the default (gateway) application.
 * Matches incoming requests against the microfrontends config and
 * rewrites them to the correct child application.
 *
 * @example
 * ```ts
 * // proxy.ts (Next.js 16+ — in the default/gateway app)
 * import { createMicrofrontendsMiddleware } from 'nextjs-microfrontends/next/middleware';
 *
 * const mfeMiddleware = createMicrofrontendsMiddleware();
 *
 * export async function proxy(request: NextRequest) {
 *   // 1. Your custom logic (auth, etc.)
 *   // ...
 *
 *   // 2. Check microfrontend routing
 *   const mfeResponse = mfeMiddleware(request);
 *   if (mfeResponse) return mfeResponse;
 *
 *   return null;
 * }
 * ```
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { matchPath, matchStaticAssetPath } from '../config/matcher';
import {
  resolveConfigObject,
  MicrofrontendsConfigError
} from '../config/resolver';
import type { MicrofrontendsConfig, ResolvedConfig } from '../config/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MicrofrontendsMiddlewareHandler = (
  request: NextRequest
) => NextResponse | null;

export interface CreateMiddlewareOptions {
  /**
   * Raw config object. If specified, the MFE_CONFIG env var is not used.
   * @deprecated Prefer letting `withMicrofrontends()` inject MFE_CONFIG automatically.
   */
  config?: MicrofrontendsConfig;
  /** Enable debug logging. */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a middleware handler that routes requests to child microfrontend applications.
 *
 * The handler inspects the request pathname and:
 * - If it matches a child app's routing rules → `NextResponse.rewrite()` to the child app
 * - If it matches a child app's static asset prefix → `NextResponse.rewrite()` to the child app
 * - Otherwise → returns `null` (let your own middleware or the default app handle it)
 *
 * @param opts - Options for configuring the middleware
 * @returns A middleware handler function
 */
export function createMicrofrontendsMiddleware(
  opts?: CreateMiddlewareOptions
): MicrofrontendsMiddlewareHandler {
  const debug = opts?.debug ?? process.env.MFE_DEBUG === 'true';
  let resolved: ResolvedConfig | null = null;

  function getConfig(): ResolvedConfig {
    if (resolved) return resolved;

    // Priority: explicit raw config object > MFE_CONFIG env var
    if (opts?.config) {
      if (debug) {
        console.warn(
          '[nextjs-microfrontends] CreateMiddlewareOptions.config is deprecated. ' +
            'Use withMicrofrontends() in next.config.ts to inject MFE_CONFIG automatically.'
        );
      }
      // Raw MicrofrontendsConfig — validate & resolve at runtime
      resolved = resolveConfigObject(opts.config);
      return resolved;
    }

    // MFE_CONFIG is serialised by withMicrofrontends() at build time
    // as a fully-resolved ResolvedConfig — just deserialise.
    const envConfig = process.env.MFE_CONFIG;
    if (!envConfig) {
      throw new MicrofrontendsConfigError(
        'MFE_CONFIG environment variable is not set. ' +
          'Make sure withMicrofrontends() is applied in next.config.ts.'
      );
    }
    try {
      resolved = JSON.parse(envConfig) as ResolvedConfig;
    } catch (err) {
      throw new MicrofrontendsConfigError(
        `Failed to parse MFE_CONFIG environment variable: ${String(err)}`
      );
    }

    return resolved;
  }

  return function microfrontendsMiddleware(
    request: NextRequest
  ): NextResponse | null {
    const config = getConfig();
    const { pathname } = request.nextUrl;

    // 1. Try to match against child app routing rules
    const routeMatch = matchPath(pathname, config);
    if (routeMatch) {
      if (debug) {
        console.log(
          `[nextjs-microfrontends] Routing ${pathname} → ${routeMatch.app.name} (${routeMatch.targetUrl})`
        );
      }

      const url = new URL(routeMatch.targetUrl);
      // Preserve query string
      url.search = request.nextUrl.search;

      return NextResponse.rewrite(url, {
        headers: {
          'x-mfe-zone': routeMatch.app.name,
          'x-mfe-source': config.defaultApp.name
        }
      });
    }

    // 2. Try to match static asset paths
    const assetMatch = matchStaticAssetPath(pathname, config);
    if (assetMatch) {
      if (debug) {
        console.log(
          `[nextjs-microfrontends] Asset ${pathname} → ${assetMatch.app.name} (${assetMatch.targetUrl})`
        );
      }

      const assetUrl = new URL(assetMatch.targetUrl);
      // Preserve query string (e.g. cache-busting params)
      assetUrl.search = request.nextUrl.search;

      return NextResponse.rewrite(assetUrl);
    }

    // 3. No match — let the default app handle it
    return null;
  };
}

/**
 * Convenience function to run microfrontend middleware in one call.
 * Use `createMicrofrontendsMiddleware()` for better performance when calling repeatedly.
 *
 * @param request - The Next.js request
 * @param opts    - Options
 * @returns A `NextResponse` rewrite if matched, or `null`
 */
export function runMicrofrontendsMiddleware(
  request: NextRequest,
  opts?: CreateMiddlewareOptions
): NextResponse | null {
  const handler = createMicrofrontendsMiddleware(opts);
  return handler(request);
}

/**
 * Generate the `config.matcher` array for Next.js middleware.
 *
 * This ensures the middleware runs on:
 * 1. All child app routing paths
 * 2. All child app static asset paths
 * 3. The well-known microfrontends endpoint
 *
 * @param configOrPath - Config object or path to config file
 * @returns Array of path patterns for the middleware matcher
 */
export function getMicrofrontendsMatcher(
  configOrPath?: string | MicrofrontendsConfig
): string[] {
  // getMicrofrontendsMatcher is typically called at build time (next.config.ts),
  // so it can be used with a config object. File-path resolution needs parser.ts.
  let config: ResolvedConfig;
  if (typeof configOrPath === 'string') {
    // File path — this function should only be called from Node.js context
    throw new MicrofrontendsConfigError(
      'getMicrofrontendsMatcher() does not support file paths in Edge Runtime. ' +
        'Pass the config object directly instead.'
    );
  } else if (configOrPath) {
    config = resolveConfigObject(configOrPath);
  } else {
    const envConfig = process.env.MFE_CONFIG;
    if (!envConfig) {
      throw new MicrofrontendsConfigError(
        'MFE_CONFIG environment variable is not set.'
      );
    }
    config = JSON.parse(envConfig) as ResolvedConfig;
  }
  const matchers: string[] = [];

  for (const app of config.childApps) {
    for (const group of app.routing) {
      matchers.push(...group.paths);
    }
    // Static asset pattern
    matchers.push(`/${app.name}-static/:path*`);
  }

  return matchers;
}
