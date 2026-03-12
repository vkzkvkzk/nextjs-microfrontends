/**
 * Unit tests for the configuration resolver (Edge-safe).
 *
 * Tests `resolveConfigObject`, `validateConfig`, and the URL resolution logic.
 * `parser.test.ts` already exercises `resolveConfig()` which delegates to
 * `resolveConfigObject()` internally — these tests target the resolver
 * module's public API directly and cover additional edge cases.
 */

import {
  resolveConfigObject,
  validateConfig,
  MicrofrontendsConfigError
} from '../config/resolver';
import type { MicrofrontendsConfig } from '../config/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides?: Partial<MicrofrontendsConfig>
): MicrofrontendsConfig {
  return {
    applications: {
      auth: {
        default: true,
        development: { port: 3000 },
        production: { url: 'http://auth:3000' }
      },
      safetydb: {
        routing: [{ paths: ['/safetydb', '/safetydb/:path*'] }],
        development: { port: 3001 },
        production: { url: 'http://safetydb:3001' }
      },
      tube: {
        routing: [{ paths: ['/tube', '/tube/:path*'] }],
        development: { port: 3002 },
        production: { url: 'http://tube:3002' }
      }
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  it('passes for a valid config', () => {
    expect(() => validateConfig(makeConfig())).not.toThrow();
  });

  it('throws if applications is undefined', () => {
    expect(() =>
      validateConfig({
        applications: undefined
      } as unknown as MicrofrontendsConfig)
    ).toThrow(MicrofrontendsConfigError);
  });

  it('throws if applications is not an object', () => {
    expect(() =>
      validateConfig({ applications: 'bad' } as unknown as MicrofrontendsConfig)
    ).toThrow('"applications" field is required');
  });

  it('throws if applications is empty', () => {
    expect(() => validateConfig({ applications: {} })).toThrow(
      'at least one application'
    );
  });

  it('throws if no default app', () => {
    expect(() =>
      validateConfig({
        applications: {
          child: { routing: [{ paths: ['/child'] }] }
        }
      })
    ).toThrow('None found');
  });

  it('throws if multiple default apps', () => {
    expect(() =>
      validateConfig({
        applications: {
          a: { default: true },
          b: { default: true }
        }
      })
    ).toThrow('Found 2');
  });

  it('throws if default app has routing rules', () => {
    expect(() =>
      validateConfig({
        applications: {
          gateway: { default: true, routing: [{ paths: ['/foo'] }] }
        }
      })
    ).toThrow('should not have routing');
  });

  it('throws if child app has no routing rules', () => {
    expect(() =>
      validateConfig({
        applications: {
          gateway: { default: true },
          child: {}
        }
      })
    ).toThrow('must have at least one routing rule');
  });

  it('throws if child app has empty routing array', () => {
    expect(() =>
      validateConfig({
        applications: {
          gateway: { default: true },
          child: { routing: [] }
        }
      })
    ).toThrow('must have at least one routing rule');
  });
});

// ---------------------------------------------------------------------------
// resolveConfigObject — structure
// ---------------------------------------------------------------------------

describe('resolveConfigObject — structure', () => {
  it('returns defaultApp, childApps, and applications', () => {
    const result = resolveConfigObject(makeConfig());

    expect(result.defaultApp).toBeDefined();
    expect(result.defaultApp.name).toBe('auth');
    expect(result.defaultApp.isDefault).toBe(true);

    expect(result.childApps).toHaveLength(2);
    expect(result.childApps.map((a) => a.name).sort()).toEqual([
      'safetydb',
      'tube'
    ]);

    expect(Object.keys(result.applications).sort()).toEqual([
      'auth',
      'safetydb',
      'tube'
    ]);
  });

  it('preserves routing rules on child apps', () => {
    const result = resolveConfigObject(makeConfig());
    const safetydb = result.applications['safetydb']!;
    expect(safetydb.routing).toEqual([
      { paths: ['/safetydb', '/safetydb/:path*'] }
    ]);
  });

  it('default app has empty routing', () => {
    const result = resolveConfigObject(makeConfig());
    expect(result.defaultApp.routing).toEqual([]);
  });

  it('stores devPort on resolved applications', () => {
    const result = resolveConfigObject(makeConfig());
    expect(result.defaultApp.devPort).toBe(3000);
    expect(result.applications['safetydb']!.devPort).toBe(3001);
    expect(result.applications['tube']!.devPort).toBe(3002);
  });
});

// ---------------------------------------------------------------------------
// resolveConfigObject — URL resolution
// ---------------------------------------------------------------------------

describe('resolveConfigObject — URL resolution', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    delete process.env.MFE_AUTH_URL;
    delete process.env.MFE_SAFETYDB_URL;
    delete process.env.MFE_TUBE_URL;
    delete process.env.SAFETYDB_PROXY_URL;
    delete process.env.ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
      configurable: true
    });
  });

  it('uses localhost:port in development mode', () => {
    const result = resolveConfigObject(makeConfig());
    expect(result.defaultApp.resolvedUrl).toBe('http://localhost:3000');
    expect(result.applications['safetydb']!.resolvedUrl).toBe(
      'http://localhost:3001'
    );
  });

  it('uses production.url in production mode', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    const result = resolveConfigObject(makeConfig());
    expect(result.defaultApp.resolvedUrl).toBe('http://auth:3000');
    expect(result.applications['safetydb']!.resolvedUrl).toBe(
      'http://safetydb:3001'
    );
  });

  it('MFE_*_URL env var takes highest priority', () => {
    process.env.MFE_SAFETYDB_URL = 'http://override:9999';
    const result = resolveConfigObject(makeConfig());
    expect(result.applications['safetydb']!.resolvedUrl).toBe(
      'http://override:9999'
    );
  });

  it('legacy *_PROXY_URL env var is used as second priority', () => {
    process.env.SAFETYDB_PROXY_URL = 'http://legacy:8888';
    const result = resolveConfigObject(makeConfig());
    expect(result.applications['safetydb']!.resolvedUrl).toBe(
      'http://legacy:8888'
    );
  });

  it('MFE_*_URL takes priority over *_PROXY_URL', () => {
    process.env.MFE_SAFETYDB_URL = 'http://mfe:1111';
    process.env.SAFETYDB_PROXY_URL = 'http://proxy:2222';
    const result = resolveConfigObject(makeConfig());
    expect(result.applications['safetydb']!.resolvedUrl).toBe(
      'http://mfe:1111'
    );
  });

  it('uses environments[ENV].url in production mode', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    process.env.ENV = 'stag';
    const config = makeConfig({
      applications: {
        auth: {
          default: true,
          development: { port: 3000 },
          production: { url: 'http://auth:3000' },
          environments: { stag: { url: 'http://stag-auth:3000' } }
        },
        safetydb: {
          routing: [{ paths: ['/safetydb', '/safetydb/:path*'] }],
          development: { port: 3001 },
          production: { url: 'http://safetydb:3001' },
          environments: { stag: { url: 'http://stag-safetydb:3001' } }
        }
      }
    });
    const result = resolveConfigObject(config);
    expect(result.defaultApp.resolvedUrl).toBe('http://stag-auth:3000');
    expect(result.childApps[0]!.resolvedUrl).toBe('http://stag-safetydb:3001');
  });

  it('falls back to production.url when ENV is set but no matching environment', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    process.env.ENV = 'unknown';
    const result = resolveConfigObject(makeConfig());
    expect(result.defaultApp.resolvedUrl).toBe('http://auth:3000');
  });

  it('handles hyphenated app names in env var lookup (e.g., ivi-client → IVI_CLIENT)', () => {
    process.env.MFE_AUTH_URL = 'http://custom-auth:7777';
    const config = makeConfig();
    const result = resolveConfigObject(config);
    expect(result.defaultApp.resolvedUrl).toBe('http://custom-auth:7777');
  });

  it('resolves fallbackUrl separately from resolvedUrl', () => {
    // In dev mode, resolvedUrl = localhost, but fallbackUrl uses production.url
    const result = resolveConfigObject(makeConfig());
    expect(result.defaultApp.resolvedUrl).toBe('http://localhost:3000');
    expect(result.defaultApp.fallbackUrl).toBe('http://auth:3000');
  });

  it('fallbackUrl uses env var when set', () => {
    process.env.MFE_SAFETYDB_URL = 'http://env-override:5555';
    const result = resolveConfigObject(makeConfig());
    expect(result.applications['safetydb']!.fallbackUrl).toBe(
      'http://env-override:5555'
    );
  });
});

// ---------------------------------------------------------------------------
// resolveConfigObject — minimal config
// ---------------------------------------------------------------------------

describe('resolveConfigObject — minimal config', () => {
  it('resolves a config with only default app (no children)', () => {
    const config: MicrofrontendsConfig = {
      applications: {
        gateway: { default: true }
      }
    };
    const result = resolveConfigObject(config);
    expect(result.defaultApp.name).toBe('gateway');
    expect(result.childApps).toHaveLength(0);
    // No port, no production URL → falls back to localhost:3000
    expect(result.defaultApp.resolvedUrl).toBe('http://localhost:3000');
  });

  it('resolves a config without production URLs using dev port fallback', () => {
    const config: MicrofrontendsConfig = {
      applications: {
        gateway: {
          default: true,
          development: { port: 4000 }
        },
        child: {
          routing: [{ paths: ['/child/:path*'] }],
          development: { port: 4001 }
        }
      }
    };
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    const result = resolveConfigObject(config);
    // No production.url → falls back to localhost:port
    expect(result.defaultApp.resolvedUrl).toBe('http://localhost:4000');
    expect(result.childApps[0]!.resolvedUrl).toBe('http://localhost:4001');
  });

  it('resolves development.fallback URL when no other options available', () => {
    const config: MicrofrontendsConfig = {
      applications: {
        gateway: {
          default: true,
          development: { fallback: 'http://fallback-gateway:3000' }
        },
        child: {
          routing: [{ paths: ['/child/:path*'] }],
          development: { fallback: 'http://fallback-child:3000' }
        }
      }
    };
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    const result = resolveConfigObject(config);
    expect(result.defaultApp.resolvedUrl).toBe('http://fallback-gateway:3000');
    expect(result.childApps[0]!.resolvedUrl).toBe('http://fallback-child:3000');
  });
});

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

describe('MicrofrontendsConfigError', () => {
  it('has the correct name', () => {
    const error = new MicrofrontendsConfigError('test');
    expect(error.name).toBe('MicrofrontendsConfigError');
  });

  it('includes the package prefix in message', () => {
    const error = new MicrofrontendsConfigError('something went wrong');
    expect(error.message).toContain('[nextjs-microfrontends]');
    expect(error.message).toContain('something went wrong');
  });

  it('is an instance of Error', () => {
    const error = new MicrofrontendsConfigError('test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicrofrontendsConfigError);
  });
});
