// NOTE: 'use client' is added by tsup banner — do not add it here

/**
 * nextjs-microfrontends — Dev Toolbar
 *
 * A floating developer toolbar inspired by Vercel's Microfrontends Toolbar.
 * Shows the current zone indicator, lists all microfrontend apps with their
 * resolved URLs, and provides debug controls.
 *
 * **Only renders when `process.env.NODE_ENV !== 'production'`.**
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { MfeDevToolbar } from 'nextjs-microfrontends/next/dev-toolbar';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <MfeDevToolbar />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type JSX
} from 'react';
import { getClientConfig, getCurrentApp } from './client';
import type { ResolvedApplication } from '../config/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOLBAR_ID = 'mfe-dev-toolbar';
const PANEL_ID = 'mfe-dev-toolbar-panel';

// ---------------------------------------------------------------------------
// Styles (inline — dev-only component, no CSS module overhead)
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#111',
  bgHover: '#222',
  bgPanel: '#1a1a1a',
  border: '#333',
  text: '#e5e5e5',
  textMuted: '#888',
  accent: '#0ea5e9',
  accentDim: '#0c4a6e',
  success: '#22c55e',
  warning: '#eab308',
  badge: '#0ea5e9'
} as const;

const styles = {
  root: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: 99999,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: '13px',
    lineHeight: '1.4',
    color: COLORS.text
  } as React.CSSProperties,

  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '9999px',
    cursor: 'pointer',
    transition: 'background 150ms, box-shadow 150ms',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    userSelect: 'none'
  } as React.CSSProperties,

  pillHover: {
    background: COLORS.bgHover,
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
  } as React.CSSProperties,

  dot: (active: boolean): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: active
      ? COLORS.success
      : /* istanbul ignore next */ COLORS.warning,
    flexShrink: 0
  }),

  panel: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    right: '0',
    width: '360px',
    maxHeight: '480px',
    overflowY: 'auto',
    background: COLORS.bgPanel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    padding: '0'
  } as React.CSSProperties,

  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderBottom: `1px solid ${COLORS.border}`
  } as React.CSSProperties,

  panelTitle: {
    fontWeight: 600,
    fontSize: '14px',
    color: COLORS.text,
    margin: 0
  } as React.CSSProperties,

  zoneIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    background: COLORS.accentDim + '33',
    borderBottom: `1px solid ${COLORS.border}`,
    fontSize: '12px',
    color: COLORS.accent
  } as React.CSSProperties,

  appList: {
    listStyle: 'none',
    margin: 0,
    padding: '4px 0'
  } as React.CSSProperties,

  appItem: (isCurrent: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '10px 16px',
    borderLeft: isCurrent
      ? `3px solid ${COLORS.accent}`
      : '3px solid transparent',
    background: isCurrent ? COLORS.accentDim + '1a' : 'transparent',
    transition: 'background 100ms'
  }),

  appName: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: 600,
    fontSize: '13px'
  } as React.CSSProperties,

  badge: (color: string): React.CSSProperties => ({
    fontSize: '10px',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '4px',
    background: color + '22',
    color,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }),

  appUrl: {
    fontSize: '11px',
    color: COLORS.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  } as React.CSSProperties,

  appRoutes: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '4px'
  } as React.CSSProperties,

  routeChip: {
    fontSize: '10px',
    fontFamily: 'monospace',
    padding: '1px 6px',
    borderRadius: '4px',
    background: COLORS.border,
    color: COLORS.textMuted
  } as React.CSSProperties,

  panelFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderTop: `1px solid ${COLORS.border}`,
    fontSize: '12px'
  } as React.CSSProperties,

  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    color: COLORS.textMuted,
    fontSize: '12px',
    padding: '4px 0'
  } as React.CSSProperties,

  toggleSwitch: (on: boolean): React.CSSProperties => ({
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    background: on ? COLORS.accent : COLORS.border,
    position: 'relative',
    transition: 'background 150ms',
    flexShrink: 0
  }),

  toggleKnob: (on: boolean): React.CSSProperties => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: '2px',
    left: on ? '14px' : '2px',
    transition: 'left 150ms'
  }),

  closeBtn: {
    background: 'none',
    border: 'none',
    color: COLORS.textMuted,
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    fontSize: '16px',
    lineHeight: 1
  } as React.CSSProperties
} as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ZoneIndicator({
  currentApp
}: Readonly<{ currentApp: string }>): JSX.Element {
  const pathname =
    globalThis.window !== undefined
      ? globalThis.window.location.pathname
      : /* istanbul ignore next */ '/';
  return (
    <div style={styles.zoneIndicator} role="status" aria-live="polite">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <span>
        <strong>{currentApp || /* istanbul ignore next */ 'unknown'}</strong> is
        serving <code style={{ fontSize: '11px' }}>{pathname}</code>
      </span>
    </div>
  );
}

function AppItem({
  app,
  isCurrent
}: Readonly<{
  app: ResolvedApplication;
  isCurrent: boolean;
}>): JSX.Element {
  return (
    <li style={styles.appItem(isCurrent)}>
      <div style={styles.appName}>
        <span style={styles.dot(true)} aria-hidden="true" />
        {app.name}
        {app.isDefault && (
          <span style={styles.badge(COLORS.accent)}>gateway</span>
        )}
        {isCurrent && <span style={styles.badge(COLORS.success)}>current</span>}
      </div>
      <div style={styles.appUrl} title={app.resolvedUrl}>
        {app.resolvedUrl}
      </div>
      {app.routing.length > 0 && (
        <div style={styles.appRoutes}>
          {app.routing.flatMap((g) =>
            g.paths.map((p) => (
              <span key={p} style={styles.routeChip}>
                {p}
              </span>
            ))
          )}
        </div>
      )}
    </li>
  );
}

function ToggleSwitch({
  on,
  onToggle,
  label,
  id
}: Readonly<{
  on: boolean;
  onToggle: () => void;
  label: string;
  id: string;
}>): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={on}
      onClick={onToggle}
      style={styles.toggle}>
      <span>{label}</span>
      <span style={styles.toggleSwitch(on)} aria-hidden="true">
        <span style={styles.toggleKnob(on)} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main toolbar component
// ---------------------------------------------------------------------------

export interface MfeDevToolbarProps {
  /**
   * Force show the toolbar even in production.
   * @default false
   */
  forceShow?: boolean;
  /**
   * Initial position. Defaults to bottom-right.
   */
  position?: 'bottom-right' | 'bottom-left';
}

/**
 * Microfrontends dev toolbar — a floating panel that shows:
 * - **Zone indicator**: which MFE app is serving the current page
 * - **App list**: all configured apps with their resolved URLs and routes
 * - **Debug toggle**: enables MFE debug logging
 *
 * Only renders in development (`NODE_ENV !== 'production'`) unless
 * `forceShow` is set.
 *
 * Accessibility: keyboard navigable, proper ARIA roles, focus management.
 */
export function MfeDevToolbar(
  // istanbul ignore next -- default parameter branch
  { forceShow = false, position = 'bottom-right' }: MfeDevToolbarProps = {}
): JSX.Element | null {
  // -----------------------------------------------------------------------
  // ALL hooks must be called unconditionally, before any early return.
  // (Rules of Hooks: https://react.dev/reference/rules/rules-of-hooks)
  // -----------------------------------------------------------------------
  const [isOpen, setIsOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const panelRef = useRef<HTMLDialogElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  const config = getClientConfig();
  const currentApp = getCurrentApp();
  const allApps = useMemo(
    () => Object.values(config.applications),
    [config.applications]
  );

  const isDev = process.env.NODE_ENV !== 'production';
  const shouldRender = isDev || forceShow;
  const hasConfig = Boolean(config.defaultApp.name);

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const toggleDebug = useCallback(() => {
    setDebugMode((prev) => {
      const next = !prev;
      // Store in cookie so middleware can read it
      if (typeof document !== 'undefined') {
        document.cookie = next
          ? 'MFE_DEBUG=true;path=/;max-age=86400'
          : 'MFE_DEBUG=;path=/;max-age=0';
      }
      return next;
    });
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        pillRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      const toolbar = document.getElementById(TOOLBAR_ID);
      if (toolbar && !toolbar.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Read debug state from cookie on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const hasCookie = document.cookie
        .split(';')
        .some((c) => c.trim().startsWith('MFE_DEBUG=true'));
      if (hasCookie) setDebugMode(true);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Conditional returns — safe because all hooks are above
  // -----------------------------------------------------------------------
  if (!shouldRender) return null;
  if (!hasConfig) return null;

  const positionStyle: React.CSSProperties =
    position === 'bottom-left'
      ? { ...styles.root, right: 'auto', left: '16px' }
      : styles.root;

  const panelPositionStyle: React.CSSProperties =
    position === 'bottom-left'
      ? { ...styles.panel, right: 'auto', left: '0' }
      : styles.panel;

  return (
    <div id={TOOLBAR_ID} style={positionStyle}>
      {/* Expandable panel */}
      {isOpen && (
        <dialog
          open
          id={PANEL_ID}
          ref={panelRef}
          aria-label="Microfrontends developer toolbar"
          style={panelPositionStyle}>
          {/* Header */}
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Microfrontends</h2>
            <button
              type="button"
              onClick={togglePanel}
              style={styles.closeBtn}
              aria-label="Close microfrontends panel">
              ✕
            </button>
          </div>

          {/* Zone indicator */}
          <ZoneIndicator currentApp={currentApp} />

          {/* App list */}
          <ul style={styles.appList} aria-label="Microfrontend applications">
            {allApps.map((app) => (
              <AppItem
                key={app.name}
                app={app}
                isCurrent={app.name === currentApp}
              />
            ))}
          </ul>

          {/* Footer controls */}
          <div style={styles.panelFooter}>
            <ToggleSwitch
              id="mfe-debug-toggle"
              on={debugMode}
              onToggle={toggleDebug}
              label="Debug Mode"
            />
            <span style={{ color: COLORS.textMuted, fontSize: '11px' }}>
              {allApps.length} app{allApps.length === 1 ? '' : 's'}
            </span>
          </div>
        </dialog>
      )}

      {/* Trigger pill */}
      <button
        ref={pillRef}
        type="button"
        onClick={togglePanel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...styles.pill,
          ...(isHovered ? styles.pillHover : {})
        }}
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
        aria-label={`Microfrontends: ${currentApp}. ${isOpen ? 'Close' : 'Open'} developer panel`}>
        {/* Zone dot */}
        <span style={styles.dot(true)} aria-hidden="true" />
        <span style={{ fontWeight: 500 }}>{currentApp || 'MFE'}</span>
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms'
          }}>
          <path d="M3 5l3-3 3 3" />
        </svg>
      </button>
    </div>
  );
}
