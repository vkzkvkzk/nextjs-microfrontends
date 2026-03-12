/**
 * Unit tests for the Next.js config wrapper (`withMicrofrontends`).
 *
 * The wrapper depends on:
 * - `../config/parser` — for file-based config resolution (Node.js only)
 * - `process.cwd()/package.json` — for auto-detecting app name
 *
 * We mock the parser and package.json to isolate the wrapper logic.
 */

import type { NextConfig } from 'next';
import type { ResolvedConfig, ResolvedApplication } from '../config/schema';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockResolvedConfig: ResolvedConfig = {
  defaultApp: {
    name: 'auth',
    isDefault: true,
    routing: [],
    resolvedUrl: 'http://auth:3000',
    fallbackUrl: 'http://auth:3000',
    devPort: 3000
  },
  childApps: [
    {
      name: 'safetydb',
      isDefault: false,
      routing: [{ paths: ['/safetydb', '/safetydb/:path*'] }],
      resolvedUrl: 'http://safetydb:3001',
      fallbackUrl: 'http://safetydb:3001',
      devPort: 3001
    },
    {
      name: 'tube',
      isDefault: false,
      routing: [{ paths: ['/tube', '/tube/:path*'] }],
      resolvedUrl: 'http://tube:3002',
      fallbackUrl: 'http://tube:3002',
      devPort: 3002
    }
  ],
  applications: {} as Record<string, ResolvedApplication>
};

// Populate applications index
mockResolvedConfig.applications['auth'] = mockResolvedConfig.defaultApp;
for (const app of mockResolvedConfig.childApps) {
  mockResolvedConfig.applications[app.name] = app;
}

jest.mock('../config/parser', () => ({
  resolveConfig: jest.fn(() => mockResolvedConfig)
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withMicrofrontends', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.MFE_CURRENT_APPLICATION;
    delete process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION;
    delete process.env.MFE_CONFIG;
    delete process.env.NEXT_PUBLIC_MFE_CONFIG;
    delete process.env.MFE_DEBUG;
  });

  afterEach(() => {
    // Restore env
    process.env.MFE_CURRENT_APPLICATION = originalEnv.MFE_CURRENT_APPLICATION;
    process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION =
      originalEnv.NEXT_PUBLIC_MFE_CURRENT_APPLICATION;
  });

  const getConfigModule = async () => import('../next/config');

  // --- Gateway (default) app ---

  it('configures the default app as a gateway with rewrites', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const nextConfig: NextConfig = {};

    const result = withMicrofrontends(nextConfig, { appName: 'auth' });

    // Should have rewrites function
    expect(typeof result.rewrites).toBe('function');

    // Should set env vars
    expect(result.env?.MFE_CONFIG).toBeDefined();
    expect(result.env?.MFE_CURRENT_APPLICATION).toBe('auth');
    expect(result.env?.NEXT_PUBLIC_MFE_CONFIG).toBeDefined();
    expect(result.env?.NEXT_PUBLIC_MFE_CURRENT_APPLICATION).toBe('auth');
  });

  it('generates rewrite rules for each child app', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({}, { appName: 'auth' });

    const rewrites = await (
      result.rewrites as () => Promise<
        Array<{ source: string; destination: string }>
      >
    )();

    // Should have rewrites for safetydb and tube routes + static assets
    expect(rewrites.length).toBeGreaterThanOrEqual(4);

    const sources = rewrites.map((r) => r.source);
    expect(sources).toContain('/safetydb');
    expect(sources).toContain('/safetydb/:path*');
    expect(sources).toContain('/tube');
    expect(sources).toContain('/tube/:path*');
    // Static asset rewrites
    expect(sources).toContain('/safetydb-static/:path*');
    expect(sources).toContain('/tube-static/:path*');
  });

  it('merges with existing rewrites (function)', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const existingRewrite = {
      source: '/api/:path*',
      destination: '/api/:path*'
    };
    const nextConfig: NextConfig = {
      rewrites: async () => [existingRewrite]
    };

    const result = withMicrofrontends(nextConfig, { appName: 'auth' });
    const rewrites = await (
      result.rewrites as () => Promise<
        Array<{ source: string; destination: string }>
      >
    )();

    // Should have both MFE rewrites and existing rewrites
    const sources = rewrites.map((r) => r.source);
    expect(sources).toContain('/api/:path*');
    expect(sources).toContain('/safetydb');
  });

  it('merges with existing rewrites (object with phases)', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const nextConfig: NextConfig = {
      rewrites: async () => ({
        beforeFiles: [{ source: '/before', destination: '/before-dest' }],
        afterFiles: [{ source: '/after', destination: '/after-dest' }],
        fallback: []
      })
    };

    const result = withMicrofrontends(nextConfig, { appName: 'auth' });
    const rewrites = await (
      result.rewrites as () => Promise<
        Array<{ source: string; destination: string }>
      >
    )();

    const sources = rewrites.map((r) => r.source);
    expect(sources).toContain('/before');
    expect(sources).toContain('/after');
    expect(sources).toContain('/safetydb');
  });

  it('merges with existing rewrites (partial phases — missing keys)', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const nextConfig: NextConfig = {
      rewrites: async () => ({}) as never
    };

    const result = withMicrofrontends(nextConfig, { appName: 'auth' });
    const rewrites = await (
      result.rewrites as () => Promise<
        Array<{ source: string; destination: string }>
      >
    )();

    // Only MFE rewrites since the phased object has no entries
    const sources = rewrites.map((r) => r.source);
    expect(sources).toContain('/safetydb');
  });

  it('enables multiZoneDraftMode', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({}, { appName: 'auth' });

    expect(result.experimental?.multiZoneDraftMode).toBe(true);
  });

  it('does not override existing multiZoneDraftMode setting', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends(
      { experimental: { multiZoneDraftMode: false } },
      { appName: 'auth' }
    );

    expect(result.experimental?.multiZoneDraftMode).toBe(false);
  });

  it('sets MFE_CURRENT_APPLICATION process env', async () => {
    const { withMicrofrontends } = await getConfigModule();
    withMicrofrontends({}, { appName: 'auth' });

    expect(process.env.MFE_CURRENT_APPLICATION).toBe('auth');
    expect(process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION).toBe('auth');
  });

  // --- Child app ---

  it('configures a child app with basePath and assetPrefix', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({}, { appName: 'safetydb' });

    expect(result.basePath).toBe('/safetydb');
    expect(result.assetPrefix).toBe('/safetydb-static');
  });

  it('does not override existing basePath', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends(
      { basePath: '/custom' },
      { appName: 'safetydb' }
    );

    expect(result.basePath).toBe('/custom');
  });

  it('does not override existing assetPrefix', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends(
      { assetPrefix: '/my-assets' },
      { appName: 'safetydb' }
    );

    expect(result.assetPrefix).toBe('/my-assets');
  });

  it('child app still gets env vars injected', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({}, { appName: 'tube' });

    expect(result.env?.MFE_CONFIG).toBeDefined();
    expect(result.env?.MFE_CURRENT_APPLICATION).toBe('tube');
    expect(result.env?.NEXT_PUBLIC_MFE_CONFIG).toBeDefined();
    expect(result.env?.NEXT_PUBLIC_MFE_CURRENT_APPLICATION).toBe('tube');
  });

  // --- App name detection ---

  it('uses MFE_CURRENT_APPLICATION env var when available', async () => {
    process.env.MFE_CURRENT_APPLICATION = 'tube';
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({});

    expect(result.basePath).toBe('/tube');
  });

  it('throws if app name cannot be determined', async () => {
    // No env var, no option, mock a missing package.json
    const { withMicrofrontends } = await getConfigModule();
    // Mock process.cwd to a non-existent location
    const origCwd = process.cwd;
    process.cwd = () => '/non-existent-path-12345';

    expect(() => withMicrofrontends({})).toThrow(
      'Could not determine current application name'
    );

    process.cwd = origCwd;
  });

  it('throws if app name is not found in config', async () => {
    const { withMicrofrontends } = await getConfigModule();

    expect(() =>
      withMicrofrontends({}, { appName: 'non-existent-app' })
    ).toThrow('not found in config');
  });

  // --- Config serialization ---

  it('serializes resolved config as JSON in MFE_CONFIG', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({}, { appName: 'auth' });

    const parsed = JSON.parse(result.env!['MFE_CONFIG']!);
    expect(parsed.defaultApp.name).toBe('auth');
    expect(parsed.childApps).toHaveLength(2);
  });

  it('NEXT_PUBLIC_MFE_CONFIG matches MFE_CONFIG', async () => {
    const { withMicrofrontends } = await getConfigModule();
    const result = withMicrofrontends({}, { appName: 'auth' });

    expect(result.env!['NEXT_PUBLIC_MFE_CONFIG']).toBe(
      result.env!['MFE_CONFIG']
    );
  });

  // --- Debug logging ---

  it('logs when debug option is true', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const { withMicrofrontends } = await getConfigModule();
    withMicrofrontends({}, { appName: 'auth', debug: true });
    expect(logSpy).toHaveBeenCalledWith(
      '[nextjs-microfrontends]',
      expect.stringContaining('Current application')
    );
    logSpy.mockRestore();
  });

  it('logs when MFE_DEBUG env var is "true"', async () => {
    process.env.MFE_DEBUG = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const { withMicrofrontends } = await getConfigModule();
    withMicrofrontends({}, { appName: 'auth' });
    expect(logSpy).toHaveBeenCalledWith(
      '[nextjs-microfrontends]',
      expect.stringContaining('Current application')
    );
    logSpy.mockRestore();
    delete process.env.MFE_DEBUG;
  });

  // --- Package.json scope stripping ---

  it('strips scope prefix from package.json name', async () => {
    await getConfigModule();
    // Verify that above call doesn't throw without appName
    jest.resetModules();
    const origCwd = process.cwd;
    const tmpDir = os.tmpdir();
    const scopeDir = path.join(tmpDir, 'mfe-scope-test-' + Date.now());
    fs.mkdirSync(scopeDir, { recursive: true });
    fs.writeFileSync(
      path.join(scopeDir, 'package.json'),
      JSON.stringify({ name: '@myorg/auth' })
    );
    process.cwd = () => scopeDir;

    const mod = await import('../next/config');
    const result = mod.withMicrofrontends({});

    expect(result.env!['MFE_CURRENT_APPLICATION']).toBe('auth');

    process.cwd = origCwd;
    fs.rmSync(scopeDir, { recursive: true });
  });
});
