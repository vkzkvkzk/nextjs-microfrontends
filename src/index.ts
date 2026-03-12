/**
 * nextjs-microfrontends
 *
 * Universal microfrontend orchestration for Next.js monorepos.
 * Works with any hosting — AWS ECS, Docker, bare-metal, etc.
 *
 * ## Subpath Exports
 *
 * | Import path                                  | Description                        |
 * | -------------------------------------------- | ---------------------------------- |
 * | `nextjs-microfrontends`                      | Core config types & utilities      |
 * | `nextjs-microfrontends/config`               | Config parsing & path matching     |
 * | `nextjs-microfrontends/next/config`          | `withMicrofrontends()` wrapper     |
 * | `nextjs-microfrontends/next/middleware`       | Middleware for gateway routing     |
 * | `nextjs-microfrontends/next/client`          | React hooks & link components      |
 */

// Config types and schema
export type {
  MicrofrontendsConfig,
  ApplicationConfig,
  PathGroup,
  ResolvedConfig,
  ResolvedApplication
} from './config/schema';

// Config utilities
export {
  findConfigFile,
  parseConfigFile,
  resolveConfig
} from './config/parser';

// Path matching
export {
  matchPath,
  getZoneForPath,
  matchStaticAssetPath
} from './config/matcher';
export type { MatchResult } from './config/matcher';
