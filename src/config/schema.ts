/**
 * nextjs-microfrontends — Configuration Schema
 *
 * Defines the TypeScript types for `mfe.config.json` configuration files.
 * This schema is compatible with Vercel's microfrontends concept but designed
 * to work without Vercel hosting.
 */

// ---------------------------------------------------------------------------
// Path Routing
// ---------------------------------------------------------------------------

/** A group of paths that should be routed to a specific application. */
export interface PathGroup {
  /** Optional group name for documentation purposes. */
  group?: string;
  /**
   * Path patterns using Next.js-style syntax.
   * Examples: `/dashboard`, `/blog/:slug*`, `/api/:path*`
   */
  paths: string[];
}

// ---------------------------------------------------------------------------
// Application Configuration
// ---------------------------------------------------------------------------

/** Development-time settings for an application. */
export interface DevelopmentConfig {
  /** The local port this application dev server runs on. */
  port?: number;
  /**
   * Fallback URL for development when the local server is not running.
   * Useful for pointing to a shared staging/preview environment.
   */
  fallback?: string;
}

/** Production / deployment settings for an application. */
export interface ProductionConfig {
  /**
   * The URL of the deployed application.
   * Can be overridden at runtime via `MFE_{APP_NAME}_URL` environment variable.
   * Examples: `http://backoffice-svc:3000`, `https://backoffice.example.com`
   */
  url?: string;
}

/**
 * Environment-specific URL configuration.
 * Keyed by environment name (e.g., `dev`, `stag`, `uat`).
 * Resolved via `process.env.ENV`.
 */
export interface EnvironmentConfig {
  /** The URL of the application in this environment. */
  url: string;
}

/** Configuration for a single application (child or default). */
export interface ApplicationConfig {
  /**
   * If `true`, this application is the gateway / entry-point.
   * There must be exactly one default application.
   * The default application handles all paths not routed elsewhere.
   */
  default?: boolean;
  /**
   * Routing rules for a non-default (child) application.
   * Each path group defines which URL paths should be routed to this app.
   * Default applications must NOT have routing rules.
   */
  routing?: PathGroup[];
  /** Development-time configuration. */
  development?: DevelopmentConfig;
  /** Production / deployment configuration. */
  production?: ProductionConfig;
  /**
   * Per-environment URL overrides.
   * Keys are environment names matching `process.env.ENV` (e.g., `dev`, `stag`, `uat`).
   * Takes priority over `production.url` when `ENV` matches.
   */
  environments?: Record<string, EnvironmentConfig>;
}

// ---------------------------------------------------------------------------
// Top-Level Config
// ---------------------------------------------------------------------------

/**
 * The top-level `mfe.config.json` configuration.
 *
 * @example
 * ```json
 * {
 *   "version": "1",
 *   "applications": {
 *     "web": {
 *       "default": true,
 *       "development": { "port": 3000 }
 *     },
 *     "admin": {
 *       "routing": [{ "paths": ["/admin", "/admin/:path*"] }],
 *       "development": { "port": 3100 },
 *       "production": { "url": "http://admin-svc:3000" }
 *     }
 *   }
 * }
 * ```
 */
export interface MicrofrontendsConfig {
  /** Schema version. Currently only `"1"` is supported. */
  version?: '1';
  /** Mapping of application names to their configuration. */
  applications: Record<string, ApplicationConfig>;
}

// ---------------------------------------------------------------------------
// Resolved types (used internally after parsing)
// ---------------------------------------------------------------------------

/** A fully resolved application with its name attached. */
export interface ResolvedApplication {
  /** The application name (key from the config). */
  name: string;
  /** Whether this is the default (gateway) application. */
  isDefault: boolean;
  /** Routing rules (empty array for default apps). */
  routing: PathGroup[];
  /** The resolved URL to route traffic to. */
  resolvedUrl: string;
  /** The production/environment URL (for proxy fallback to remote). */
  fallbackUrl: string;
  /** Local development port. */
  devPort?: number;
  /** Development fallback URL. */
  devFallback?: string;
}

/** The fully resolved and validated configuration. */
export interface ResolvedConfig {
  /** The default (gateway) application. */
  defaultApp: ResolvedApplication;
  /** All child (non-default) applications. */
  childApps: ResolvedApplication[];
  /** All applications indexed by name. */
  applications: Record<string, ResolvedApplication>;
}
