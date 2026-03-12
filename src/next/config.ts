/**
 * nextjs-microfrontends — Next.js Config Wrapper
 *
 * Wraps a Next.js config to automatically set up rewrites, basePath,
 * assetPrefix, and other settings needed for microfrontend routing.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withMicrofrontends } from 'nextjs-microfrontends/next/config';
 *
 * const nextConfig = { ... };
 * export default withMicrofrontends(nextConfig);
 * ```
 */

import type { NextConfig } from 'next';
import type { Rewrite } from 'next/dist/lib/load-custom-routes';
import { resolveConfig } from '../config/parser';
import type { MicrofrontendsConfig, ResolvedConfig } from '../config/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WithMicrofrontendsOptions {
  /** Path to `mfe.config.json`. Auto-discovered if not specified. */
  configPath?: string;
  /** The raw config object. If specified, `configPath` is ignored. */
  config?: MicrofrontendsConfig;
  /**
   * Override the current application name.
   * By default, inferred from `MFE_CURRENT_APPLICATION` env var or package.json `name`.
   */
  appName?: string;
  /** Enable debug logging. */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(debug: boolean, ...args: unknown[]): void {
  if (debug) {
    console.log('[nextjs-microfrontends]', ...args);
  }
}

/**
 * Detect the current application name from:
 * 1. `MFE_CURRENT_APPLICATION` env var
 * 2. The `appName` option
 * 3. Package.json `name` field
 */
function getCurrentAppName(opts?: WithMicrofrontendsOptions): string {
  if (process.env.MFE_CURRENT_APPLICATION) {
    return process.env.MFE_CURRENT_APPLICATION;
  }
  if (opts?.appName) {
    return opts.appName;
  }

  // Attempt to read from package.json
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(`${process.cwd()}/package.json`);
    if (typeof pkg.name === 'string') {
      // Strip scope prefix if present (e.g., `@org/app-name` → `app-name`)
      return pkg.name.replace(/^@[^/]+\//, '');
    }
  } catch {
    // ignore
  }

  throw new Error(
    '[nextjs-microfrontends] Could not determine current application name. ' +
      'Set MFE_CURRENT_APPLICATION env var, or pass `appName` option to withMicrofrontends().'
  );
}

// ---------------------------------------------------------------------------
// Rewrite generation (for the default application)
// ---------------------------------------------------------------------------

function generateRewrites(resolved: ResolvedConfig): Rewrite[] {
  const rewrites: Rewrite[] = [];

  for (const app of resolved.childApps) {
    const destination = app.resolvedUrl.replace(/\/$/, '');

    for (const group of app.routing) {
      for (const pattern of group.paths) {
        rewrites.push({
          source: pattern,
          destination: `${destination}${pattern}`
        });
      }
    }

    // Add static asset rewrite for the child app: /{app-name}-static/* → child
    rewrites.push({
      source: `/${app.name}-static/:path*`,
      destination: `${destination}/${app.name}-static/:path*`
    });

    // Also proxy _next/static from child apps when they use assetPrefix
    // This is needed when child apps set assetPrefix to avoid conflicts
  }

  return rewrites;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Wraps a Next.js config to enable microfrontend support.
 *
 * **For the default (gateway) application:**
 * - Generates `rewrites()` to proxy requests to child applications
 * - Sets `experimental.multiZoneDraftMode: true`
 * - Injects `MFE_CONFIG` and `MFE_CURRENT_APPLICATION` env vars
 *
 * **For child applications:**
 * - Sets `basePath` to the app's routing prefix
 * - Sets `assetPrefix` to avoid static asset conflicts
 *
 * @param nextConfig - The original Next.js config
 * @param opts       - Options
 * @returns The transformed Next.js config
 */
export function withMicrofrontends(
  nextConfig: NextConfig,
  opts?: WithMicrofrontendsOptions
): NextConfig {
  const debug = opts?.debug ?? process.env.MFE_DEBUG === 'true';

  const appName = getCurrentAppName(opts);
  log(debug, `Current application: ${appName}`);

  // Resolve config
  const resolved = resolveConfig(opts?.config ?? opts?.configPath);
  const currentApp = resolved.applications[appName];

  if (!currentApp) {
    throw new Error(
      `[nextjs-microfrontends] Application "${appName}" not found in config. ` +
        `Available: ${Object.keys(resolved.applications).join(', ')}`
    );
  }

  log(
    debug,
    `Application type: ${currentApp.isDefault ? 'default (gateway)' : 'child'}`
  );
  log(debug, `Resolved URL: ${currentApp.resolvedUrl}`);

  // Store the current app name for runtime use (server + client)
  process.env.MFE_CURRENT_APPLICATION = appName;
  process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION = appName;

  // Serialize the fully-resolved config for middleware (Edge Runtime).
  // The middleware deserialises this directly as `ResolvedConfig`.
  const serializedConfig = JSON.stringify(resolved);

  const result: NextConfig = { ...nextConfig };

  // Common: Enable multi-zone draft mode
  result.experimental = {
    ...result.experimental,
    multiZoneDraftMode: result.experimental?.multiZoneDraftMode ?? true
  };

  if (currentApp.isDefault) {
    // ----- DEFAULT (GATEWAY) APPLICATION -----
    log(debug, 'Configuring as gateway application');

    // Generate rewrites
    const mfeRewrites = generateRewrites(resolved);
    log(debug, `Generated ${mfeRewrites.length} rewrite rules`);

    const originalRewrites = result.rewrites;
    result.rewrites = async () => {
      let existing: Rewrite[] = [];
      if (typeof originalRewrites === 'function') {
        const result = await originalRewrites();
        if (Array.isArray(result)) {
          existing = result;
        } else {
          existing = [
            ...(result.beforeFiles ?? []),
            ...(result.afterFiles ?? []),
            ...(result.fallback ?? [])
          ];
        }
      }

      return [...mfeRewrites, ...existing];
    };

    // Inject environment variables via Next.js env config
    // NEXT_PUBLIC_ vars are inlined at build time into client bundles
    result.env = {
      ...result.env,
      MFE_CONFIG: serializedConfig,
      MFE_CURRENT_APPLICATION: appName,
      NEXT_PUBLIC_MFE_CONFIG: serializedConfig,
      NEXT_PUBLIC_MFE_CURRENT_APPLICATION: appName
    };
  } else {
    // ----- CHILD APPLICATION -----
    log(debug, 'Configuring as child application');

    // Determine basePath from the first routing rule
    const firstPath = currentApp.routing[0]?.paths[0];
    if (firstPath) {
      // Extract the base prefix (e.g., `/backoffice/:path*` → `/backoffice`)
      const basePrefix = '/' + firstPath.split('/').filter(Boolean)[0]!;

      if (!result.basePath) {
        result.basePath = basePrefix;
        log(debug, `Set basePath: ${basePrefix}`);
      }

      // Set assetPrefix to avoid static asset conflicts
      if (!result.assetPrefix) {
        result.assetPrefix = `/${currentApp.name}-static`;
        log(debug, `Set assetPrefix: /${currentApp.name}-static`);
      }
    }

    // Inject environment variables (server + client)
    result.env = {
      ...result.env,
      MFE_CONFIG: serializedConfig,
      MFE_CURRENT_APPLICATION: appName,
      NEXT_PUBLIC_MFE_CONFIG: serializedConfig,
      NEXT_PUBLIC_MFE_CURRENT_APPLICATION: appName
    };
  }

  return result;
}
