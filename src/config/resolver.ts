/**
 * nextjs-microfrontends — Configuration Resolver (Edge-safe)
 *
 * Pure validation and URL resolution logic without any Node.js-specific APIs.
 * Safe to use in Vercel Edge Runtime, Next.js middleware/proxy, and browser.
 *
 * For file-system based config loading, use `parser.ts` instead (Node.js only).
 */

import type {
  MicrofrontendsConfig,
  ResolvedApplication,
  ResolvedConfig
} from './schema';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MicrofrontendsConfigError extends Error {
  constructor(message: string) {
    super(`[nextjs-microfrontends] ${message}`);
    this.name = 'MicrofrontendsConfigError';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateConfig(config: MicrofrontendsConfig): void {
  if (!config.applications || typeof config.applications !== 'object') {
    throw new MicrofrontendsConfigError(
      '"applications" field is required and must be an object.'
    );
  }

  const appNames = Object.keys(config.applications);
  if (appNames.length === 0) {
    throw new MicrofrontendsConfigError(
      '"applications" must contain at least one application.'
    );
  }

  const defaultApps = appNames.filter((n) => config.applications[n]?.default);
  if (defaultApps.length === 0) {
    throw new MicrofrontendsConfigError(
      'Exactly one application must be marked as "default": true. None found.'
    );
  }
  if (defaultApps.length > 1) {
    throw new MicrofrontendsConfigError(
      `Exactly one application must be marked as "default": true. Found ${defaultApps.length}: ${defaultApps.join(', ')}`
    );
  }

  // Default app should not have routing rules
  const defaultAppName = defaultApps[0]!;
  const defaultAppConfig = config.applications[defaultAppName]!;
  if (defaultAppConfig.routing && defaultAppConfig.routing.length > 0) {
    throw new MicrofrontendsConfigError(
      `Default application "${defaultAppName}" should not have routing rules. ` +
        'The default app handles all paths not matched by other apps.'
    );
  }

  // Child apps should have routing rules
  for (const name of appNames) {
    if (name === defaultAppName) continue;
    const appConfig = config.applications[name]!;
    if (!appConfig.routing || appConfig.routing.length === 0) {
      throw new MicrofrontendsConfigError(
        `Child application "${name}" must have at least one routing rule.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// URL Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the runtime URL for an application.
 *
 * Resolution order:
 * 1. `MFE_{APP_NAME_UPPER}_URL` environment variable (e.g., `MFE_SAFETYDB_URL`)
 * 2. `{APP_NAME_UPPER}_PROXY_URL` environment variable (legacy compat)
 * 3. In development (`NODE_ENV !== 'production'`): `http://localhost:{development.port}`
 * 4. `environments[ENV].url` — per-environment URL from config (matches `process.env.ENV`)
 * 5. `production.url` from the config
 * 6. `http://localhost:{development.port}` as final fallback
 */
function resolveAppUrl(
  name: string,
  config: MicrofrontendsConfig['applications'][string]
): string {
  // Normalize name to UPPER_SNAKE_CASE for env var lookup
  const envKey = name.replace(/-/g, '_').toUpperCase();

  // 1. MFE_*_URL env var
  const mfeUrl = process.env[`MFE_${envKey}_URL`];
  if (mfeUrl) return mfeUrl;

  // 2. Legacy *_PROXY_URL env var
  const proxyUrl = process.env[`${envKey}_PROXY_URL`];
  if (proxyUrl) return proxyUrl;

  // 3. In development mode, prefer localhost over production URL
  if (process.env.NODE_ENV !== 'production' && config?.development?.port) {
    return `http://localhost:${config.development.port}`;
  }

  // 4. Environment-specific URL (matched by process.env.ENV)
  const currentEnv = process.env.ENV;
  if (currentEnv && config?.environments?.[currentEnv]?.url) {
    return config.environments[currentEnv].url;
  }

  // 5. Production URL from config
  if (config?.production?.url) return config.production.url;

  // 6. Fallback to local dev port
  if (config?.development?.port) {
    return `http://localhost:${config.development.port}`;
  }

  // 7. Development fallback URL
  if (config?.development?.fallback) {
    return config.development.fallback;
  }

  return 'http://localhost:3000';
}

/**
 * Resolve the production/environment URL for an application (used by the
 * proxy to fall back to a deployed version when the app is not running
 * locally).
 *
 * Resolution order:
 * 1. `environments[ENV].url`
 * 2. `production.url`
 * 3. `development.fallback`
 * 4. `http://localhost:{development.port}` (last resort)
 */
function resolveFallbackUrl(
  name: string,
  config: MicrofrontendsConfig['applications'][string]
): string {
  const envKey = name.replace(/-/g, '_').toUpperCase();

  // Explicit env var overrides take precedence
  const mfeUrl = process.env[`MFE_${envKey}_URL`];
  if (mfeUrl) return mfeUrl;

  const proxyUrl = process.env[`${envKey}_PROXY_URL`];
  if (proxyUrl) return proxyUrl;

  // Environment URL
  const currentEnv = process.env.ENV;
  if (currentEnv && config?.environments?.[currentEnv]?.url) {
    return config.environments[currentEnv].url;
  }

  // Production URL
  if (config?.production?.url) return config.production.url;

  // Development fallback
  if (config?.development?.fallback) return config.development.fallback;

  // Last resort: local dev port
  if (config?.development?.port) {
    return `http://localhost:${config.development.port}`;
  }

  return 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Validate and resolve a microfrontends configuration object.
 *
 * This function is Edge-safe — it only operates on in-memory data
 * and does not use `node:fs` or `node:path`.
 *
 * @param config - The parsed `MicrofrontendsConfig` object.
 * @returns The fully resolved configuration with runtime URLs.
 */
export function resolveConfigObject(
  config: MicrofrontendsConfig
): ResolvedConfig {
  validateConfig(config);

  const applications: Record<string, ResolvedApplication> = {};
  let defaultApp: ResolvedApplication | undefined;
  const childApps: ResolvedApplication[] = [];

  for (const [name, appConfig] of Object.entries(config.applications)) {
    const resolved: ResolvedApplication = {
      name,
      isDefault: !!appConfig.default,
      routing: appConfig.routing ?? [],
      resolvedUrl: resolveAppUrl(name, appConfig),
      fallbackUrl: resolveFallbackUrl(name, appConfig),
      devPort: appConfig.development?.port,
      devFallback: appConfig.development?.fallback
    };

    applications[name] = resolved;

    if (resolved.isDefault) {
      defaultApp = resolved;
    } else {
      childApps.push(resolved);
    }
  }

  return {
    defaultApp: defaultApp!,
    childApps,
    applications
  };
}
