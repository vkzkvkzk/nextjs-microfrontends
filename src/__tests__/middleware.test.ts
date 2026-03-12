/**
 * Unit tests for the Next.js middleware module.
 *
 * The middleware depends on Next.js types (`NextRequest`, `NextResponse`).
 * We mock `next/server` so the tests run without installing the full
 * Next.js framework in the test environment.
 */

import type { ResolvedConfig, ResolvedApplication } from '../config/schema';

// ---------------------------------------------------------------------------
// Mocks — next/server
// ---------------------------------------------------------------------------

const rewriteMock = jest.fn(
  (dest: string | URL, init?: { headers?: Record<string, string> }) => ({
    type: 'rewrite',
    destination: typeof dest === 'string' ? dest : dest.toString(),
    headers: init?.headers ?? {}
  })
);

jest.mock('next/server', () => ({
  NextResponse: {
    rewrite: rewriteMock
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(
  name: string,
  paths: string[],
  url = `http://${name}:3000`
): ResolvedApplication {
  return {
    name,
    isDefault: false,
    routing: [{ paths }],
    resolvedUrl: url,
    fallbackUrl: url
  };
}

function makeConfig(childApps: ResolvedApplication[]): ResolvedConfig {
  const defaultApp: ResolvedApplication = {
    name: 'auth',
    isDefault: true,
    routing: [],
    resolvedUrl: 'http://auth:3000',
    fallbackUrl: 'http://auth:3000'
  };

  const applications: Record<string, ResolvedApplication> = {
    auth: defaultApp
  };
  for (const app of childApps) {
    applications[app.name] = app;
  }

  return { defaultApp, childApps, applications };
}

/** Minimal mock for NextRequest */
function mockNextRequest(
  pathname: string,
  search = ''
): { nextUrl: { pathname: string; search: string } } {
  return {
    nextUrl: { pathname, search }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMicrofrontendsMiddleware', () => {
  const safetydb = makeApp(
    'safetydb',
    ['/safetydb', '/safetydb/:path*'],
    'http://safetydb:3001'
  );
  const tube = makeApp('tube', ['/tube', '/tube/:path*'], 'http://tube:3002');
  const config = makeConfig([safetydb, tube]);
  const serializedConfig = JSON.stringify(config);

  beforeEach(() => {
    jest.resetModules();
    rewriteMock.mockClear();
    delete process.env.MFE_CONFIG;
    delete process.env.MFE_DEBUG;
  });

  const getMiddlewareModule = async () => import('../next/middleware');

  it('routes matching path to the correct child app via rewrite', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    const request = mockNextRequest('/safetydb/dashboard');
    handler(request as unknown as Parameters<typeof handler>[0]);

    expect(rewriteMock).toHaveBeenCalledTimes(1);
    const [urlArg, optsArg] = rewriteMock.mock.calls[0] as [
      URL,
      { headers: Record<string, string> }
    ];
    expect(urlArg.toString()).toContain('safetydb:3001/safetydb/dashboard');
    expect(optsArg.headers['x-mfe-zone']).toBe('safetydb');
    expect(optsArg.headers['x-mfe-source']).toBe('auth');
  });

  it('returns null for paths not matching any child app', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    const result = handler(
      mockNextRequest('/dashboard') as unknown as Parameters<typeof handler>[0]
    );
    expect(result).toBeNull();
    expect(rewriteMock).not.toHaveBeenCalled();
  });

  it('preserves query string on route rewrites', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    handler(
      mockNextRequest('/safetydb', '?page=2&sort=asc') as unknown as Parameters<
        typeof handler
      >[0]
    );

    expect(rewriteMock).toHaveBeenCalledTimes(1);
    const [urlArg] = rewriteMock.mock.calls[0] as [URL];
    expect(urlArg.toString()).toContain('?page=2&sort=asc');
  });

  it('rewrites static asset paths to the correct child app', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    handler(
      mockNextRequest(
        '/safetydb-static/_next/static/chunks/main.js'
      ) as unknown as Parameters<typeof handler>[0]
    );

    expect(rewriteMock).toHaveBeenCalledTimes(1);
    const [urlArg] = rewriteMock.mock.calls[0] as [URL];
    expect(urlArg.toString()).toContain(
      'safetydb:3001/safetydb-static/_next/static/chunks/main.js'
    );
  });

  it('preserves query string on static asset rewrites', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    handler(
      mockNextRequest(
        '/safetydb-static/_next/static/chunks/main.js',
        '?v=abc123'
      ) as unknown as Parameters<typeof handler>[0]
    );

    expect(rewriteMock).toHaveBeenCalledTimes(1);
    const [urlArg] = rewriteMock.mock.calls[0] as [URL];
    expect(urlArg.toString()).toContain('?v=abc123');
  });

  it('throws if MFE_CONFIG env var is not set', async () => {
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    expect(() =>
      handler(
        mockNextRequest('/safetydb') as unknown as Parameters<typeof handler>[0]
      )
    ).toThrow('MFE_CONFIG environment variable is not set');
  });

  it('throws if MFE_CONFIG contains invalid JSON', async () => {
    process.env.MFE_CONFIG = 'not-valid-json';
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    expect(() =>
      handler(
        mockNextRequest('/safetydb') as unknown as Parameters<typeof handler>[0]
      )
    ).toThrow('Failed to parse MFE_CONFIG');
  });

  it('accepts explicit config object (deprecated opts.config)', async () => {
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const rawConfig = {
      applications: {
        auth: { default: true, development: { port: 3000 } },
        safetydb: {
          routing: [{ paths: ['/safetydb', '/safetydb/:path*'] }],
          development: { port: 3001 }
        }
      }
    };
    const handler = createMicrofrontendsMiddleware({ config: rawConfig });

    handler(
      mockNextRequest('/safetydb/page') as unknown as Parameters<
        typeof handler
      >[0]
    );
    expect(rewriteMock).toHaveBeenCalledTimes(1);
  });

  it('caches resolved config across multiple calls', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const { createMicrofrontendsMiddleware } = await getMiddlewareModule();
    const handler = createMicrofrontendsMiddleware();

    handler(
      mockNextRequest('/safetydb') as unknown as Parameters<typeof handler>[0]
    );
    handler(
      mockNextRequest('/tube') as unknown as Parameters<typeof handler>[0]
    );
    handler(
      mockNextRequest('/unknown') as unknown as Parameters<typeof handler>[0]
    );

    // All calls use the same cached config — rewrite for safetydb and tube
    expect(rewriteMock).toHaveBeenCalledTimes(2);
  });
});

describe('runMicrofrontendsMiddleware', () => {
  beforeEach(() => {
    jest.resetModules();
    rewriteMock.mockClear();
    delete process.env.MFE_CONFIG;
  });

  it('is a convenience wrapper that creates and invokes a middleware handler', async () => {
    const safetydb = makeApp(
      'safetydb',
      ['/safetydb', '/safetydb/:path*'],
      'http://safetydb:3001'
    );
    process.env.MFE_CONFIG = JSON.stringify(makeConfig([safetydb]));

    const { runMicrofrontendsMiddleware } = await import('../next/middleware');
    runMicrofrontendsMiddleware(
      mockNextRequest('/safetydb') as unknown as Parameters<
        typeof runMicrofrontendsMiddleware
      >[0]
    );

    expect(rewriteMock).toHaveBeenCalledTimes(1);
  });
});

describe('getMicrofrontendsMatcher', () => {
  beforeEach(() => {
    jest.resetModules();
    rewriteMock.mockClear();
    delete process.env.MFE_CONFIG;
  });

  it('generates matcher patterns from config object', async () => {
    const { getMicrofrontendsMatcher } = await import('../next/middleware');

    const rawConfig = {
      applications: {
        auth: { default: true, development: { port: 3000 } },
        safetydb: {
          routing: [{ paths: ['/safetydb', '/safetydb/:path*'] }],
          development: { port: 3001 }
        },
        tube: {
          routing: [{ paths: ['/tube', '/tube/:path*'] }],
          development: { port: 3002 }
        }
      }
    };

    const matchers = getMicrofrontendsMatcher(rawConfig);

    expect(matchers).toContain('/safetydb');
    expect(matchers).toContain('/safetydb/:path*');
    expect(matchers).toContain('/tube');
    expect(matchers).toContain('/tube/:path*');
    // Static asset patterns
    expect(matchers).toContain('/safetydb-static/:path*');
    expect(matchers).toContain('/tube-static/:path*');
  });

  it('throws for file path argument (Edge Runtime unsupported)', async () => {
    const { getMicrofrontendsMatcher } = await import('../next/middleware');
    expect(() => getMicrofrontendsMatcher('./mfe.config.json')).toThrow(
      'does not support file paths in Edge Runtime'
    );
  });

  it('uses MFE_CONFIG env var when no argument is provided', async () => {
    const safetydb = makeApp(
      'safetydb',
      ['/safetydb/:path*'],
      'http://safetydb:3001'
    );
    process.env.MFE_CONFIG = JSON.stringify(makeConfig([safetydb]));

    const { getMicrofrontendsMatcher } = await import('../next/middleware');
    const matchers = getMicrofrontendsMatcher();

    expect(matchers).toContain('/safetydb/:path*');
    expect(matchers).toContain('/safetydb-static/:path*');
  });

  it('throws if no config source is provided and MFE_CONFIG is not set', async () => {
    const { getMicrofrontendsMatcher } = await import('../next/middleware');
    expect(() => getMicrofrontendsMatcher()).toThrow(
      'MFE_CONFIG environment variable is not set'
    );
  });
});

// ---------------------------------------------------------------------------
// Debug & deprecated code paths
// ---------------------------------------------------------------------------

describe('createMicrofrontendsMiddleware — debug logging', () => {
  const safetydb = makeApp(
    'safetydb',
    ['/safetydb', '/safetydb/:path*'],
    'http://safetydb:3001'
  );
  const config = makeConfig([safetydb]);
  const serializedConfig = JSON.stringify(config);

  beforeEach(() => {
    jest.resetModules();
    rewriteMock.mockClear();
    delete process.env.MFE_CONFIG;
    delete process.env.MFE_DEBUG;
  });

  it('logs route match when debug is true', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const { createMicrofrontendsMiddleware } =
      await import('../next/middleware');
    const handler = createMicrofrontendsMiddleware({ debug: true });

    handler(mockNextRequest('/safetydb/page') as any);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Routing /safetydb/page')
    );
    logSpy.mockRestore();
  });

  it('logs asset match when debug is true', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const { createMicrofrontendsMiddleware } =
      await import('../next/middleware');
    const handler = createMicrofrontendsMiddleware({ debug: true });

    handler(mockNextRequest('/safetydb-static/_next/static/main.js') as any);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Asset /safetydb-static')
    );
    logSpy.mockRestore();
  });

  it('logs deprecated warning for opts.config with debug', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { createMicrofrontendsMiddleware } =
      await import('../next/middleware');
    const rawConfig = {
      applications: {
        auth: { default: true, development: { port: 3000 } },
        safetydb: {
          routing: [{ paths: ['/safetydb'] }],
          development: { port: 3001 }
        }
      }
    };
    const handler = createMicrofrontendsMiddleware({
      config: rawConfig,
      debug: true
    });
    handler(mockNextRequest('/safetydb') as any);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    warnSpy.mockRestore();
  });

  it('activates debug when MFE_DEBUG env is "true"', async () => {
    process.env.MFE_CONFIG = serializedConfig;
    process.env.MFE_DEBUG = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const { createMicrofrontendsMiddleware } =
      await import('../next/middleware');
    const handler = createMicrofrontendsMiddleware();

    handler(mockNextRequest('/safetydb') as any);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Routing /safetydb')
    );
    logSpy.mockRestore();
  });
});
