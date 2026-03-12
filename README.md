# nextjs-microfrontends

A zero-config micro-frontends toolkit for **Next.js 14+** (App Router).

Compose multiple independent Next.js applications behind a single domain using the **multi-zone** pattern — with automatic routing, middleware, asset isolation, and a local dev proxy.

## Features

- **Declarative config** — Define apps, routing, and environments in a single `mfe.config.json`.
- **Gateway rewrites** — The default app automatically proxies routes to child apps.
- **Edge middleware** — Route requests at the edge; works with Vercel, Cloudflare, and self-hosted.
- **Static asset isolation** — Each child app gets a unique `assetPrefix` to avoid collisions.
- **Local dev proxy** — Run all apps locally and access them through one `localhost` port.
- **Dev toolbar** — Floating overlay showing which zone is active and live status of all apps.
- **Cross-zone navigation** — React hook & Link component for seamless navigation across zones.
- **Edge-safe config resolver** — No `fs` dependency; works in Edge Runtime and middleware.
- **CLI** — `microfrontends port` and `microfrontends proxy` commands for local development.

## Install

```bash
npm install nextjs-microfrontends
# or
pnpm add nextjs-microfrontends
# or
yarn add nextjs-microfrontends
```

## Quick Start

### 1. Create a config file

```jsonc
// mfe.config.json
{
  "applications": {
    "gateway": {
      "default": true,
      "development": { "port": 3000 },
      "production": { "url": "https://gateway.example.com" }
    },
    "dashboard": {
      "routing": [{ "paths": ["/dashboard", "/dashboard/:path*"] }],
      "development": { "port": 3001 },
      "production": { "url": "https://dashboard.example.com" }
    },
    "admin": {
      "routing": [{ "paths": ["/admin", "/admin/:path*"] }],
      "development": { "port": 3002 },
      "production": { "url": "https://admin.example.com" }
    }
  }
}
```

### 2. Wrap your Next.js config

```ts
// next.config.ts (gateway app)
import { withMicrofrontends } from 'nextjs-microfrontends/next/config';

const nextConfig = {};

export default withMicrofrontends(nextConfig, { appName: 'gateway' });
```

```ts
// next.config.ts (child app)
import { withMicrofrontends } from 'nextjs-microfrontends/next/config';

const nextConfig = {};

export default withMicrofrontends(nextConfig, { appName: 'dashboard' });
```

### 3. Add middleware (gateway only)

```ts
// middleware.ts
import {
  createMicrofrontendsMiddleware,
  getMicrofrontendsMatcher
} from 'nextjs-microfrontends/next/middleware';

export const middleware = createMicrofrontendsMiddleware();

export const config = {
  matcher: getMicrofrontendsMatcher()
};
```

### 4. Run the dev proxy

```bash
npx microfrontends proxy --port 8000 --config ./mfe.config.json
```

All apps are now accessible at `http://localhost:8000`.

## Config Reference

### `mfe.config.json`

```jsonc
{
  "applications": {
    "<app-name>": {
      "default": true, // Exactly one app must be default (gateway)
      "routing": [
        // Child apps only
        { "paths": ["/path", "/path/:param*"] }
      ],
      "development": {
        "port": 3000, // Local dev port
        "fallback": "http://..." // Fallback URL if port is unreachable
      },
      "production": {
        "url": "https://..." // Production URL
      },
      "environments": {
        // Per-environment overrides
        "staging": { "url": "https://staging...." },
        "dev": { "url": "https://dev...." }
      }
    }
  }
}
```

### Environment Variables

| Variable                  | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `MFE_<APP_NAME>_URL`      | Override resolved URL for an app (highest priority) |
| `<APP_NAME>_PROXY_URL`    | Legacy proxy URL override                           |
| `MFE_CURRENT_APPLICATION` | Current app name (auto-set by `withMicrofrontends`) |
| `MFE_CONFIG`              | Serialized resolved config (auto-set)               |
| `ENV`                     | Environment name for `environments[ENV]` lookup     |
| `MFE_DEBUG`               | Enable debug logging (`true` / `1`)                 |

## Subpath Exports

| Import path                              | Description                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `nextjs-microfrontends`                  | Core types and config utilities                                                      |
| `nextjs-microfrontends/config`           | Config parser, resolver, matcher                                                     |
| `nextjs-microfrontends/next/config`      | `withMicrofrontends()` Next.js config wrapper                                        |
| `nextjs-microfrontends/next/middleware`  | Edge middleware for gateway routing                                                  |
| `nextjs-microfrontends/next/client`      | React hooks (`useMicrofrontends`, `useCrossZoneNavigation`) and `MicrofrontendsLink` |
| `nextjs-microfrontends/next/dev-toolbar` | Floating dev toolbar component                                                       |

## Cross-Zone Navigation

```tsx
import { MicrofrontendsLink } from 'nextjs-microfrontends/next/client';

export function Nav() {
  return (
    <nav>
      <MicrofrontendsLink href="/dashboard">Dashboard</MicrofrontendsLink>
      <MicrofrontendsLink href="/admin">Admin</MicrofrontendsLink>
    </nav>
  );
}
```

The link component automatically detects cross-zone navigation and performs a full page navigation (via `window.location`) when the target is in a different zone.

## Dev Toolbar

```tsx
import { MfeDevToolbar } from 'nextjs-microfrontends/next/dev-toolbar';

// Add to your root layout (only renders in development)
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <MfeDevToolbar />
      </body>
    </html>
  );
}
```

## CLI

```bash
# Show available ports for each app
npx microfrontends port

# Start the local dev proxy
npx microfrontends proxy --port 8000

# Use a custom config file
npx microfrontends proxy --port 8000 --config ./custom-config.json

# Show help
npx microfrontends --help
```

## License

[MIT](./LICENSE)
