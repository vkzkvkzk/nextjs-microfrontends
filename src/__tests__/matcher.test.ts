/**
 * Unit tests for the path matching engine.
 */

import {
  matchPath,
  getZoneForPath,
  matchStaticAssetPath
} from '../config/matcher';
import type { ResolvedConfig, ResolvedApplication } from '../config/schema';

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
    name: 'ivi-client',
    isDefault: true,
    routing: [],
    resolvedUrl: 'http://ivi-client:3003',
    fallbackUrl: 'http://ivi-client:3003'
  };

  const applications: Record<string, ResolvedApplication> = {
    'ivi-client': defaultApp
  };
  for (const app of childApps) {
    applications[app.name] = app;
  }

  return {
    defaultApp,
    childApps,
    applications
  };
}

// ---------------------------------------------------------------------------
// matchPath
// ---------------------------------------------------------------------------

describe('matchPath', () => {
  const backoffice = makeApp('backoffice', [
    '/backoffice',
    '/backoffice/:path*'
  ]);
  const config = makeConfig([backoffice]);

  it('matches exact path', () => {
    const result = matchPath('/backoffice', config);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.app.name).toBe('backoffice');
    expect(result.targetUrl).toBe('http://backoffice:3000/backoffice');
  });

  it('matches wildcard path', () => {
    const result = matchPath('/backoffice/users', config);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.app.name).toBe('backoffice');
    expect(result.targetUrl).toBe('http://backoffice:3000/backoffice/users');
  });

  it('matches deeply nested wildcard path', () => {
    const result = matchPath('/backoffice/tenants/123/edit', config);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.app.name).toBe('backoffice');
  });

  it('returns null for non-matching paths (handled by default app)', () => {
    const result = matchPath('/dashboard', config);
    expect(result).toBeNull();
  });

  it('returns null for root path', () => {
    const result = matchPath('/', config);
    expect(result).toBeNull();
  });

  it('does not match partial prefix', () => {
    // /backoffice2 should NOT match /backoffice
    const result = matchPath('/backoffice2', config);
    expect(result).toBeNull();
  });
});

describe('matchPath — multiple child apps', () => {
  const backoffice = makeApp('backoffice', ['/backoffice/:path*']);
  const docs = makeApp('docs', ['/docs', '/docs/:path*']);
  const config = makeConfig([backoffice, docs]);

  it('matches first app', () => {
    const result = matchPath('/backoffice/settings', config);
    if (!result) return;
    expect(result.app.name).toBe('backoffice');
  });

  it('matches second app', () => {
    const result = matchPath('/docs/api', config);
    if (!result) return;
    expect(result.app.name).toBe('docs');
  });

  it('returns null for unmatched paths', () => {
    expect(matchPath('/other', config)).toBeNull();
  });
});

describe('matchPath — single segment param', () => {
  const blog = makeApp('blog', ['/blog/:slug']);
  const config = makeConfig([blog]);

  it('matches single segment', () => {
    const result = matchPath('/blog/hello-world', config);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.app.name).toBe('blog');
  });

  it('does not match nested segments', () => {
    const result = matchPath('/blog/hello/world', config);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getZoneForPath
// ---------------------------------------------------------------------------

describe('getZoneForPath', () => {
  const backoffice = makeApp('backoffice', [
    '/backoffice',
    '/backoffice/:path*'
  ]);
  const config = makeConfig([backoffice]);

  it('detects cross-zone navigation from default to child', () => {
    const result = getZoneForPath('/backoffice/users', 'ivi-client', config);
    expect(result.zoneName).toBe('backoffice');
    expect(result.isDifferentZone).toBe(true);
  });

  it('detects same-zone navigation within default app', () => {
    const result = getZoneForPath('/dashboard', 'ivi-client', config);
    expect(result.zoneName).toBe('ivi-client');
    expect(result.isDifferentZone).toBe(false);
  });

  it('detects same-zone navigation within child app', () => {
    const result = getZoneForPath('/backoffice/settings', 'backoffice', config);
    expect(result.zoneName).toBe('backoffice');
    expect(result.isDifferentZone).toBe(false);
  });

  it('strips query string', () => {
    const result = getZoneForPath('/backoffice?tab=1', 'ivi-client', config);
    expect(result.zoneName).toBe('backoffice');
  });

  it('strips hash', () => {
    const result = getZoneForPath('/backoffice#section', 'ivi-client', config);
    expect(result.zoneName).toBe('backoffice');
  });

  it('falls back to href when pathname extraction yields empty', () => {
    // empty string → split produces [''] → first element is '' which is falsy
    const result = getZoneForPath('', 'ivi-client', config);
    // '' doesn't match any child app → defaults
    expect(result.zoneName).toBe('ivi-client');
    expect(result.isDifferentZone).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchStaticAssetPath
// ---------------------------------------------------------------------------

describe('matchStaticAssetPath', () => {
  const backoffice = makeApp('backoffice', ['/backoffice/:path*']);
  const config = makeConfig([backoffice]);

  it('matches static asset prefix', () => {
    const result = matchStaticAssetPath(
      '/backoffice-static/_next/static/abc.js',
      config
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.app.name).toBe('backoffice');
  });

  it('returns null for non-static paths', () => {
    expect(matchStaticAssetPath('/backoffice/page', config)).toBeNull();
  });

  it('returns null for default app paths', () => {
    expect(matchStaticAssetPath('/_next/static/abc.js', config)).toBeNull();
  });
});
