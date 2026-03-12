/**
 * nextjs-microfrontends — Configuration Parser & Resolver
 *
 * Reads `mfe.config.json`, validates it, and resolves runtime URLs
 * from environment variables.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MicrofrontendsConfig, ResolvedConfig } from './schema';
import { resolveConfigObject, MicrofrontendsConfigError } from './resolver';

// Re-export for backwards compatibility
export { MicrofrontendsConfigError } from './resolver';

// ---------------------------------------------------------------------------
// Constants (Node.js only — file names for auto-discovery)
// ---------------------------------------------------------------------------

const CONFIG_FILE_NAMES = ['mfe.config.json', 'mfe.config.jsonc'];

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

/**
 * Find the `mfe.config.json` config file by searching upward from `startDir`.
 * Searches the given directory, then its parent, up to the repo root.
 */
export function findConfigFile(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();

  // Search up to 10 levels
  for (let i = 0; i < 10; i++) {
    for (const filename of CONFIG_FILE_NAMES) {
      const candidate = join(dir, filename);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Remove JSONC-style comments (single-line and multi-line) from a string. */
function stripJsonComments(text: string): string {
  // Remove single-line comments
  let result = text.replace(/\/\/[^\n]*$/gm, '');
  // Remove multi-line comments (non-greedy)
  result = result.replace(/\/\*[^]*?\*\//g, '');
  return result;
}

/**
 * Parse a `mfe.config.json` (or `.jsonc`) file and return the raw config.
 */
export function parseConfigFile(filePath: string): MicrofrontendsConfig {
  if (!existsSync(filePath)) {
    throw new MicrofrontendsConfigError(
      `Configuration file not found: ${filePath}`
    );
  }

  const raw = readFileSync(filePath, 'utf-8');
  const stripped = filePath.endsWith('.jsonc') ? stripJsonComments(raw) : raw;

  try {
    return JSON.parse(stripped) as MicrofrontendsConfig;
  } catch (err) {
    throw new MicrofrontendsConfigError(
      `Failed to parse configuration file: ${filePath}\n${String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main Resolver (Node.js — delegates to Edge-safe resolveConfigObject)
// ---------------------------------------------------------------------------

/**
 * Parse, validate, and resolve a microfrontends configuration.
 *
 * **This function uses `node:fs` / `node:path` and is NOT Edge-safe.**
 * For Edge Runtime (middleware/proxy), use `resolveConfigObject()` from `./resolver` instead.
 *
 * @param configOrPath - Either a file path to `mfe.config.json`, or the
 *   raw config object.
 * @returns The fully resolved configuration with runtime URLs.
 */
export function resolveConfig(
  configOrPath?: string | MicrofrontendsConfig
): ResolvedConfig {
  let config: MicrofrontendsConfig;

  if (typeof configOrPath === 'string') {
    config = parseConfigFile(configOrPath);
  } else if (configOrPath) {
    config = configOrPath;
  } else {
    // Auto-discover config file
    const found = findConfigFile();
    if (!found) {
      throw new MicrofrontendsConfigError(
        'Could not find mfe.config.json. ' +
          'Please create one in your repository root or specify the path explicitly.'
      );
    }
    config = parseConfigFile(found);
  }

  return resolveConfigObject(config);
}
