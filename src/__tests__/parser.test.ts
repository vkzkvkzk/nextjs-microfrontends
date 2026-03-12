/**
 * Unit tests for the configuration parser.
 */

import { resolveConfig, MicrofrontendsConfigError } from '../config/parser';
import type { MicrofrontendsConfig } from '../config/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides?: Partial<MicrofrontendsConfig>
): MicrofrontendsConfig {
  return {
    applications: {
      'ivi-client': {
        default: true,
        development: { port: 3003 },
        production: { url: 'http://ivi-client:3003' }
      },
      backoffice: {
        routing: [{ paths: ['/backoffice', '/backoffice/:path*'] }],
        development: { port: 3300 },
        production: { url: 'http://ivi-backoffice:3000' }
      }
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveConfig', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    // Clean up env vars
    delete process.env.MFE_IVI_CLIENT_URL;
    delete process.env.MFE_BACKOFFICE_URL;
    delete process.env.BACKOFFICE_PROXY_URL;
    delete process.env.ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
      configurable: true
    });
  });

  it('resolves a valid config with default and child apps (development)', () => {
    // In non-production, localhost:port is preferred over production.url
    const result = resolveConfig(makeConfig());

    expect(result.defaultApp.name).toBe('ivi-client');
    expect(result.defaultApp.isDefault).toBe(true);
    expect(result.defaultApp.resolvedUrl).toBe('http://localhost:3003');
    expect(result.childApps).toHaveLength(1);
    expect(result.childApps[0]!.name).toBe('backoffice');
    expect(result.childApps[0]!.resolvedUrl).toBe('http://localhost:3300');
  });

  it('resolves production URLs when NODE_ENV=production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    const result = resolveConfig(makeConfig());

    expect(result.defaultApp.resolvedUrl).toBe('http://ivi-client:3003');
    expect(result.childApps[0]!.resolvedUrl).toBe('http://ivi-backoffice:3000');
  });

  it('resolves URL from MFE_*_URL env var (highest priority)', () => {
    process.env.MFE_BACKOFFICE_URL = 'http://custom-backoffice:9999';
    const result = resolveConfig(makeConfig());
    expect(result.childApps[0]!.resolvedUrl).toBe(
      'http://custom-backoffice:9999'
    );
  });

  it('resolves URL from legacy *_PROXY_URL env var', () => {
    process.env.BACKOFFICE_PROXY_URL = 'http://legacy-proxy:8888';
    const result = resolveConfig(makeConfig());
    expect(result.childApps[0]!.resolvedUrl).toBe('http://legacy-proxy:8888');
  });

  it('MFE_*_URL takes priority over *_PROXY_URL', () => {
    process.env.MFE_BACKOFFICE_URL = 'http://mfe-url:1111';
    process.env.BACKOFFICE_PROXY_URL = 'http://proxy-url:2222';
    const result = resolveConfig(makeConfig());
    expect(result.childApps[0]!.resolvedUrl).toBe('http://mfe-url:1111');
  });

  it('resolves environment-specific URL when ENV is set (production mode)', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    process.env.ENV = 'stag';
    const config = makeConfig({
      applications: {
        'ivi-client': {
          default: true,
          development: { port: 3003 },
          production: { url: 'http://ivi-client:3003' },
          environments: {
            stag: { url: 'http://stag-ivi-client:3003' }
          }
        },
        backoffice: {
          routing: [{ paths: ['/backoffice', '/backoffice/:path*'] }],
          development: { port: 3300 },
          production: { url: 'http://ivi-backoffice:3000' },
          environments: {
            stag: { url: 'http://stag-backoffice:3000' }
          }
        }
      }
    });
    const result = resolveConfig(config);
    expect(result.defaultApp.resolvedUrl).toBe('http://stag-ivi-client:3003');
    expect(result.childApps[0]!.resolvedUrl).toBe(
      'http://stag-backoffice:3000'
    );
  });

  it('environments[ENV] takes priority over production.url', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    process.env.ENV = 'dev';
    const config = makeConfig({
      applications: {
        'ivi-client': {
          default: true,
          development: { port: 3003 },
          production: { url: 'http://prod-ivi:3003' },
          environments: {
            dev: { url: 'http://dev-ivi:3003' }
          }
        },
        backoffice: {
          routing: [{ paths: ['/backoffice', '/backoffice/:path*'] }],
          development: { port: 3300 },
          production: { url: 'http://prod-bo:3000' }
        }
      }
    });
    const result = resolveConfig(config);
    // ivi-client has dev env → uses it
    expect(result.defaultApp.resolvedUrl).toBe('http://dev-ivi:3003');
    // backoffice has no dev env → falls back to production.url
    expect(result.childApps[0]!.resolvedUrl).toBe('http://prod-bo:3000');
  });

  it('MFE_*_URL still takes priority over environments[ENV]', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    process.env.ENV = 'uat';
    process.env.MFE_BACKOFFICE_URL = 'http://override:9999';
    const config = makeConfig({
      applications: {
        'ivi-client': {
          default: true,
          development: { port: 3003 },
          production: { url: 'http://ivi-client:3003' }
        },
        backoffice: {
          routing: [{ paths: ['/backoffice', '/backoffice/:path*'] }],
          development: { port: 3300 },
          production: { url: 'http://ivi-backoffice:3000' },
          environments: {
            uat: { url: 'http://uat-backoffice:3000' }
          }
        }
      }
    });
    const result = resolveConfig(config);
    expect(result.childApps[0]!.resolvedUrl).toBe('http://override:9999');
  });

  it('falls back to production.url when ENV is set but no matching environment', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    process.env.ENV = 'unknown-env';
    const result = resolveConfig(makeConfig());
    expect(result.defaultApp.resolvedUrl).toBe('http://ivi-client:3003');
    expect(result.childApps[0]!.resolvedUrl).toBe('http://ivi-backoffice:3000');
  });

  it('falls back to development port when no production URL', () => {
    const config = makeConfig();
    delete config.applications['backoffice']!.production;
    const result = resolveConfig(config);
    expect(result.childApps[0]!.resolvedUrl).toBe('http://localhost:3300');
  });

  it('stores devPort on resolved applications', () => {
    const result = resolveConfig(makeConfig());
    expect(result.defaultApp.devPort).toBe(3003);
    expect(result.childApps[0]!.devPort).toBe(3300);
  });

  it('indexes all applications by name', () => {
    const result = resolveConfig(makeConfig());
    expect(Object.keys(result.applications)).toEqual([
      'ivi-client',
      'backoffice'
    ]);
  });
});

describe('resolveConfig — validation errors', () => {
  it('throws if no applications object', () => {
    expect(() =>
      resolveConfig({
        applications: undefined
      } as unknown as MicrofrontendsConfig)
    ).toThrow(MicrofrontendsConfigError);
  });

  it('throws if applications is empty', () => {
    expect(() => resolveConfig({ applications: {} })).toThrow(
      'at least one application'
    );
  });

  it('throws if no default app', () => {
    expect(() =>
      resolveConfig({
        applications: {
          backoffice: {
            routing: [{ paths: ['/backoffice'] }]
          }
        }
      })
    ).toThrow('default');
  });

  it('throws if multiple default apps', () => {
    expect(() =>
      resolveConfig({
        applications: {
          a: { default: true },
          b: { default: true }
        }
      })
    ).toThrow('Exactly one');
  });

  it('throws if default app has routing rules', () => {
    expect(() =>
      resolveConfig({
        applications: {
          gateway: {
            default: true,
            routing: [{ paths: ['/should-not-have-this'] }]
          }
        }
      })
    ).toThrow('should not have routing');
  });

  it('throws if child app has no routing rules', () => {
    expect(() =>
      resolveConfig({
        applications: {
          gateway: { default: true },
          child: {}
        }
      })
    ).toThrow('must have at least one routing rule');
  });
});
