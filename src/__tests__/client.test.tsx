/**
 * Unit tests for the client module (React hooks & components).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { ResolvedConfig } from '../config/schema';

// ---------------------------------------------------------------------------
// Mock next/link  (static — same React instance for renderer)
// ---------------------------------------------------------------------------

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement(
      'a',
      { href, 'data-testid': 'next-link', ...props },
      children
    )
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockConfig: ResolvedConfig = {
  defaultApp: {
    name: 'home',
    isDefault: true,
    routing: [],
    resolvedUrl: 'http://home:3000',
    fallbackUrl: 'http://home:3000'
  },
  childApps: [
    {
      name: 'blog',
      isDefault: false,
      routing: [{ paths: ['/blog', '/blog/:path*'] }],
      resolvedUrl: 'http://blog:3001',
      fallbackUrl: 'http://blog:3001'
    }
  ],
  applications: {
    home: {
      name: 'home',
      isDefault: true,
      routing: [],
      resolvedUrl: 'http://home:3000',
      fallbackUrl: 'http://home:3000'
    },
    blog: {
      name: 'blog',
      isDefault: false,
      routing: [{ paths: ['/blog', '/blog/:path*'] }],
      resolvedUrl: 'http://blog:3001',
      fallbackUrl: 'http://blog:3001'
    }
  }
};

// ---------------------------------------------------------------------------
// Tests — getClientConfig & getCurrentApp (use resetModules, no rendering)
// ---------------------------------------------------------------------------

describe('getClientConfig', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_MFE_CONFIG;
    delete process.env.MFE_CONFIG;
  });

  it('parses config from NEXT_PUBLIC_MFE_CONFIG', async () => {
    process.env.NEXT_PUBLIC_MFE_CONFIG = JSON.stringify(mockConfig);
    const { getClientConfig } = await import('../next/client');
    const config = getClientConfig();
    expect(config.defaultApp.name).toBe('home');
    expect(config.childApps).toHaveLength(1);
  });

  it('falls back to MFE_CONFIG when NEXT_PUBLIC_ is not set', async () => {
    process.env.MFE_CONFIG = JSON.stringify(mockConfig);
    const { getClientConfig } = await import('../next/client');
    const config = getClientConfig();
    expect(config.defaultApp.name).toBe('home');
  });

  it('returns empty config when no env var is set', async () => {
    const { getClientConfig } = await import('../next/client');
    const config = getClientConfig();
    expect(config.defaultApp.name).toBe('');
    expect(config.childApps).toHaveLength(0);
  });

  it('returns empty config when env var contains invalid JSON', async () => {
    process.env.NEXT_PUBLIC_MFE_CONFIG = 'not-json';
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const { getClientConfig } = await import('../next/client');
    const config = getClientConfig();
    expect(config.defaultApp.name).toBe('');
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse MFE_CONFIG')
    );
    consoleWarn.mockRestore();
  });

  it('caches the parsed config', async () => {
    process.env.NEXT_PUBLIC_MFE_CONFIG = JSON.stringify(mockConfig);
    const { getClientConfig } = await import('../next/client');
    const config1 = getClientConfig();
    const config2 = getClientConfig();
    expect(config1).toBe(config2); // same reference
  });
});

describe('getCurrentApp', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION;
    delete process.env.MFE_CURRENT_APPLICATION;
  });

  it('returns NEXT_PUBLIC_MFE_CURRENT_APPLICATION', async () => {
    process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION = 'blog';
    const { getCurrentApp } = await import('../next/client');
    expect(getCurrentApp()).toBe('blog');
  });

  it('falls back to MFE_CURRENT_APPLICATION', async () => {
    process.env.MFE_CURRENT_APPLICATION = 'home';
    const { getCurrentApp } = await import('../next/client');
    expect(getCurrentApp()).toBe('home');
  });

  it('returns empty string when no env var is set', async () => {
    const { getCurrentApp } = await import('../next/client');
    expect(getCurrentApp()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests — Hook & Components (static imports — same React instance)
//
// We mock getClientConfig and getCurrentApp so we can import the module
// once (statically) to avoid dual-React issues with jest.resetModules().
// ---------------------------------------------------------------------------

// Static import for hook/component tests.
// The module's `cachedClientConfig` is null initially. We set env vars
// in beforeAll so getClientConfig() reads them on its first call.
import { useMicrofrontendZone, MicrofrontendsLink } from '../next/client';

describe('useMicrofrontendZone', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_MFE_CONFIG = JSON.stringify(mockConfig);
    process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION = 'home';
  });
  afterEach(cleanup);

  it('detects same-zone for default app paths', () => {
    function TestComponent() {
      const result = useMicrofrontendZone('/dashboard');
      return (
        <span data-testid="zone">{`${result.zoneName}:${result.isDifferentZone}`}</span>
      );
    }
    render(<TestComponent />);
    expect(screen.getByTestId('zone').textContent).toBe('home:false');
  });

  it('detects cross-zone for child app paths', () => {
    function TestComponent() {
      const result = useMicrofrontendZone('/blog/post-1');
      return (
        <span data-testid="zone">{`${result.zoneName}:${result.isDifferentZone}`}</span>
      );
    }
    render(<TestComponent />);
    expect(screen.getByTestId('zone').textContent).toBe('blog:true');
  });
});

describe('MicrofrontendsLink', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_MFE_CONFIG = JSON.stringify(mockConfig);
    process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION = 'home';
  });
  afterEach(cleanup);

  it('renders Next.js Link for same-zone navigation', () => {
    render(
      <MicrofrontendsLink href="/dashboard">Dashboard</MicrofrontendsLink>
    );
    const link = screen.getByTestId('next-link');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.textContent).toBe('Dashboard');
  });

  it('renders native <a> for cross-zone navigation', () => {
    render(
      <MicrofrontendsLink href="/blog/post-1">Blog Post</MicrofrontendsLink>
    );
    const link = screen.getByText('Blog Post');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/blog/post-1');
    expect(link.dataset.testid).toBeUndefined();
  });

  it('renders native <a> when forceReload is true', () => {
    render(
      <MicrofrontendsLink href="/dashboard" forceReload>
        Dashboard
      </MicrofrontendsLink>
    );
    const link = screen.getByText('Dashboard');
    expect(link.tagName).toBe('A');
    expect(link.dataset.testid).toBeUndefined();
  });

  it('passes extra props to the rendered element', () => {
    render(
      <MicrofrontendsLink
        href="/blog"
        className="nav-link"
        aria-label="Go to blog">
        Blog
      </MicrofrontendsLink>
    );
    const link = screen.getByText('Blog');
    expect(link.getAttribute('class')).toBe('nav-link');
    expect(link.getAttribute('aria-label')).toBe('Go to blog');
  });
});
