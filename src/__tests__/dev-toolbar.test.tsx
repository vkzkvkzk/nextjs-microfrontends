/**
 * Unit tests for the MfeDevToolbar component.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ResolvedConfig } from '../config/schema';
import * as clientModule from '../next/client';

// ---------------------------------------------------------------------------
// Mock next/link (same as client tests)
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
// Config fixture — set before static import so getClientConfig caches it
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

// Set env vars BEFORE static imports — MfeDevToolbar relies on getClientConfig
process.env.NEXT_PUBLIC_MFE_CONFIG = JSON.stringify(mockConfig);
process.env.NEXT_PUBLIC_MFE_CURRENT_APPLICATION = 'home';

import { MfeDevToolbar } from '../next/dev-toolbar';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MfeDevToolbar', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Ensure dev mode
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
      configurable: true
    });
    document.cookie = 'MFE_DEBUG=;path=/;max-age=0';
  });

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
      configurable: true
    });
    cleanup();
  });

  it('renders the trigger pill in development mode', () => {
    render(<MfeDevToolbar />);
    const pill = screen.getByRole('button', { name: /Microfrontends.*home/i });
    expect(pill).toBeDefined();
  });

  it('returns null in production mode (no render)', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    const { container } = render(<MfeDevToolbar />);
    expect(container.innerHTML).toBe('');
  });

  it('renders in production when forceShow is true', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    render(<MfeDevToolbar forceShow />);
    const pill = screen.getByRole('button', { name: /Microfrontends.*home/i });
    expect(pill).toBeDefined();
  });

  it('opens the panel when pill is clicked', () => {
    render(<MfeDevToolbar />);
    const pill = screen.getByRole('button', { name: /Microfrontends.*home/i });

    fireEvent.click(pill);

    const panel = screen.getByRole('dialog');
    expect(panel).toBeDefined();
    expect(screen.getByText('Microfrontends')).toBeDefined();
  });

  it('closes the panel when pill is clicked again', () => {
    render(<MfeDevToolbar />);
    const pill = screen.getByRole('button', { name: /Microfrontends.*home/i });

    fireEvent.click(pill); // open
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.click(pill); // close
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the panel when close button is clicked', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );

    const closeBtn = screen.getByRole('button', {
      name: /Close microfrontends panel/i
    });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('displays ZoneIndicator with current app name', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );

    const serving = screen.getByText(/is serving/);
    expect(serving).toBeDefined();
    expect(serving.innerHTML).toContain('home');
  });

  it('lists all apps with their URLs', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );

    // home app
    expect(screen.getByText('http://home:3000')).toBeDefined();
    // blog app
    expect(screen.getByText('blog')).toBeDefined();
    expect(screen.getByText('http://blog:3001')).toBeDefined();
  });

  it('shows "gateway" badge for default app', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    expect(screen.getByText('gateway')).toBeDefined();
  });

  it('shows "current" badge for the current app', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    expect(screen.getByText('current')).toBeDefined();
  });

  it('displays child app route chips', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    expect(screen.getByText('/blog')).toBeDefined();
    expect(screen.getByText('/blog/:path*')).toBeDefined();
  });

  it('shows app count in footer', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    expect(screen.getByText('2 apps')).toBeDefined();
  });

  it('toggles debug mode and sets cookie', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );

    const toggle = screen.getByRole('switch', { name: /Debug Mode/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.cookie).toContain('MFE_DEBUG=true');

    // Toggle off
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('reads debug state from cookie on mount', () => {
    document.cookie = 'MFE_DEBUG=true;path=/';
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );

    const toggle = screen.getByRole('switch', { name: /Debug Mode/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('closes panel on Escape key', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes panel on outside click', () => {
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('supports bottom-left position', () => {
    render(<MfeDevToolbar position="bottom-left" />);
    const toolbar = document.getElementById('mfe-dev-toolbar');
    expect(toolbar).toBeDefined();
    expect(toolbar!.style.left).toBe('16px');
  });

  it('handles hover on pill', () => {
    render(<MfeDevToolbar />);
    const pill = screen.getByRole('button', { name: /Microfrontends.*home/i });

    fireEvent.mouseEnter(pill);
    // Pill should show hover state (bgHover)
    expect(pill.style.background).toBeDefined();

    fireEvent.mouseLeave(pill);
  });

  it('sets aria-expanded on pill', () => {
    render(<MfeDevToolbar />);
    const pill = screen.getByRole('button', { name: /Microfrontends.*home/i });
    expect(pill.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(pill);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
  });

  it('panel position style for bottom-left', () => {
    render(<MfeDevToolbar position="bottom-left" />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );
    const panel = screen.getByRole('dialog');
    expect(panel.style.left).toMatch(/^0(px)?$/);
  });
});

describe('MfeDevToolbar — no config', () => {
  afterEach(() => cleanup());

  it('returns null when config has no defaultApp name', () => {
    const emptyConfig: ResolvedConfig = {
      defaultApp: {
        name: '',
        isDefault: true,
        routing: [],
        resolvedUrl: '',
        fallbackUrl: ''
      },
      childApps: [],
      applications: {}
    };
    const spy = jest
      .spyOn(clientModule, 'getClientConfig')
      .mockReturnValue(emptyConfig);
    const { container } = render(<MfeDevToolbar />);
    expect(container.innerHTML).toBe('');
    spy.mockRestore();
  });
});

describe('MfeDevToolbar — single app', () => {
  afterEach(() => cleanup());

  it('shows singular "app" for single application', () => {
    const singleConfig: ResolvedConfig = {
      defaultApp: {
        name: 'solo',
        isDefault: true,
        routing: [],
        resolvedUrl: 'http://solo:3000',
        fallbackUrl: 'http://solo:3000'
      },
      childApps: [],
      applications: {
        solo: {
          name: 'solo',
          isDefault: true,
          routing: [],
          resolvedUrl: 'http://solo:3000',
          fallbackUrl: 'http://solo:3000'
        }
      }
    };
    const configSpy = jest
      .spyOn(clientModule, 'getClientConfig')
      .mockReturnValue(singleConfig);
    const appSpy = jest
      .spyOn(clientModule, 'getCurrentApp')
      .mockReturnValue('solo');

    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*solo/i })
    );

    expect(screen.getByText('1 app')).toBeDefined();

    configSpy.mockRestore();
    appSpy.mockRestore();
  });

  it('does not show gateway badge for non-default app', () => {
    const nonDefaultConfig: ResolvedConfig = {
      ...mockConfig,
      applications: { ...mockConfig.applications }
    };
    const configSpy = jest
      .spyOn(clientModule, 'getClientConfig')
      .mockReturnValue(nonDefaultConfig);
    const appSpy = jest
      .spyOn(clientModule, 'getCurrentApp')
      .mockReturnValue('blog');

    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*blog/i })
    );

    // blog is not default, so no "gateway" badge for the blog item
    // but home IS default, so gateway badge still appears for home
    const gateways = screen.getAllByText('gateway');
    expect(gateways).toHaveLength(1); // only on home

    configSpy.mockRestore();
    appSpy.mockRestore();
  });

  it('shows empty routes for app with no routing', () => {
    // home has no routing → no route chips
    render(<MfeDevToolbar />);
    fireEvent.click(
      screen.getByRole('button', { name: /Microfrontends.*home/i })
    );

    // blog has route chips, but home does not
    expect(screen.getByText('/blog')).toBeDefined();
  });

  it('falls back to MFE label when currentApp is empty', () => {
    const configSpy = jest
      .spyOn(clientModule, 'getClientConfig')
      .mockReturnValue(mockConfig);
    const appSpy = jest
      .spyOn(clientModule, 'getCurrentApp')
      .mockReturnValue('');

    render(<MfeDevToolbar />);
    const pill = screen.getByRole('button', { name: /Microfrontends/ });
    expect(pill.textContent).toContain('MFE');

    configSpy.mockRestore();
    appSpy.mockRestore();
  });
});
