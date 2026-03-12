/**
 * nextjs-microfrontends — CLI
 *
 * Subcommands:
 *   port                  Print the dev port for the current application
 *   proxy [configPath]    Start a local development proxy
 *
 * Usage:
 *   microfrontends port
 *   microfrontends proxy --local-apps auth safetydb
 *   microfrontends proxy mfe.config.json --local-apps auth --port 4000
 *
 * The proxy routes requests between locally running microfrontends and
 * production/deployment fallbacks so developers only need to run the
 * app they're working on.
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { findConfigFile, parseConfigFile } from '../config/parser';
import { resolveConfigObject } from '../config/resolver';
import { matchPath, matchStaticAssetPath } from '../config/matcher';
import type {
  MicrofrontendsConfig,
  ResolvedApplication,
  ResolvedConfig
} from '../config/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

function log(msg: string): void {
  console.log(msg);
}

function logError(msg: string): void {
  console.error(`${RED}  ✗ ${msg}${RESET}`);
}

/**
 * Generate a deterministic port from an application name.
 * Uses a simple hash to map the name to a port in the 3000-3999 range.
 */
function deterministicPort(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    // codePointAt(i) is always defined when i < name.length
    hash = Math.trunc(hash * 31 + name.codePointAt(i)!);
  }
  return 3000 + (Math.abs(hash) % 1000);
}

/**
 * Load config from a path, env var, or auto-detect.
 */
function loadConfig(configPath?: string): {
  config: MicrofrontendsConfig;
  filePath: string;
} {
  // 1. Explicit path
  if (configPath) {
    return {
      config: parseConfigFile(configPath),
      filePath: configPath
    };
  }

  // 2. VC_MICROFRONTENDS_CONFIG env var (polyrepo compat)
  const envPath = process.env.VC_MICROFRONTENDS_CONFIG;
  if (envPath && fs.existsSync(envPath)) {
    return {
      config: parseConfigFile(envPath),
      filePath: envPath
    };
  }

  // 3. Auto-detect
  const found = findConfigFile(process.cwd());
  if (!found) {
    logError(
      'Could not find mfe.config.json.\n' +
        '  Create one in your repo root, pass --config, or set VC_MICROFRONTENDS_CONFIG.'
    );
    process.exit(1);
  }
  return { config: parseConfigFile(found), filePath: found };
}

/**
 * Read the current package.json name from cwd (for `port` command).
 */
function readCurrentPackageName(): string | undefined {
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      name?: string;
    };
    return pkg.name;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Subcommand: port
// ---------------------------------------------------------------------------

function cmdPort(args: string[]): void {
  // Optional: --app <name> to specify a different app
  const appFlagIdx = args.indexOf('--app');
  let appName: string | undefined =
    appFlagIdx === -1 ? undefined : args[appFlagIdx + 1];

  const { config } = loadConfig();

  if (!appName) {
    // Auto-detect from package.json name
    appName = readCurrentPackageName();
  }

  if (!appName) {
    logError(
      'Cannot determine the current application.\n' +
        '  Run from an app directory with package.json, or use --app <name>.'
    );
    process.exit(1);
  }

  const appConfig = config.applications[appName];
  if (!appConfig) {
    logError(
      `Application "${appName}" not found in mfe.config.json.\n` +
        `  Available: ${Object.keys(config.applications).join(', ')}`
    );
    process.exit(1);
  }

  const port = appConfig.development?.port ?? deterministicPort(appName);
  // Print just the port number — intended for $(microfrontends port) usage
  process.stdout.write(String(port));
}

// ---------------------------------------------------------------------------
// Subcommand: proxy
// ---------------------------------------------------------------------------

interface ProxyOptions {
  configPath?: string;
  port?: number;
  localApps: string[];
  verbose: boolean;
}

function parseProxyArgs(args: string[]): ProxyOptions {
  const options: ProxyOptions = {
    localApps: [],
    verbose: false
  };

  let idx = 0;
  while (idx < args.length) {
    const arg = args[idx];

    if (arg === '--local-apps' || arg === '-l') {
      // Consume all following non-flag arguments as app names
      idx++;
      while (idx < args.length && !args[idx].startsWith('-')) {
        options.localApps.push(args[idx]);
        idx++;
      }
      continue;
    }

    if ((arg === '--port' || arg === '-p') && args[idx + 1]) {
      idx++;
      options.port = Number.parseInt(args[idx], 10);
    } else if ((arg === '--config' || arg === '-c') && args[idx + 1]) {
      idx++;
      options.configPath = args[idx];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-') && !options.configPath) {
      // Positional argument = config path
      options.configPath = arg;
    }

    idx++;
  }

  return options;
}

function resolveAppTarget(
  app: ResolvedApplication,
  localApps: Set<string>
): string {
  if (localApps.has(app.name)) {
    // Route to local dev server
    return app.devPort ? `http://localhost:${app.devPort}` : app.resolvedUrl;
  }
  // Fall back to production/environment URL (not local dev port)
  return app.fallbackUrl;
}

function resolveProxyTarget(
  req: http.IncomingMessage,
  config: ResolvedConfig,
  localApps: Set<string>
): { url: string; app: ResolvedApplication } {
  const pathname = req.url?.split('?')[0] ?? '/';

  // 1. Static asset path match
  const staticMatch = matchStaticAssetPath(pathname, config);
  if (staticMatch) {
    return {
      url: resolveAppTarget(staticMatch.app, localApps),
      app: staticMatch.app
    };
  }

  // 2. Routing match
  const match = matchPath(pathname, config);
  if (match) {
    return {
      url: resolveAppTarget(match.app, localApps),
      app: match.app
    };
  }

  // 3. Default app
  return {
    url: resolveAppTarget(config.defaultApp, localApps),
    app: config.defaultApp
  };
}

function proxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetBase: string,
  verbose: boolean
): void {
  const targetUrl = new URL(req.url ?? '/', targetBase);
  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const proxyReqOptions: http.RequestOptions = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || /* istanbul ignore next */ (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  };

  if (verbose) {
    log(
      `  ${DIM}→${RESET} ${req.method} ${req.url} → ${CYAN}${targetBase}${RESET}${targetUrl.pathname}`
    );
  }

  const proxyReq = transport.request(proxyReqOptions, (proxyRes) => {
    // istanbul ignore next -- statusCode is always set by Node.js http
    res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    logError(`Proxy error for ${req.url}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end(`Bad Gateway: ${err.message}\n`);
  });

  req.pipe(proxyReq, { end: true });
}

function proxyWebSocket(
  req: http.IncomingMessage,
  socket: net.Socket,
  head: Buffer,
  targetBase: string,
  verbose: boolean
): void {
  const targetUrl = new URL(
    req.url ?? /* istanbul ignore next */ '/',
    targetBase
  );
  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  if (verbose) {
    log(
      `  ${DIM}↔${RESET} WS ${req.url} → ${CYAN}${targetBase}${RESET}${targetUrl.pathname}`
    );
  }

  const proxyReq = transport.request({
    hostname: targetUrl.hostname,
    port: targetUrl.port || /* istanbul ignore next */ (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  });

  proxyReq.on('upgrade', (_proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        Object.entries(_proxyRes.headers)
          .filter(([k]) => !['upgrade', 'connection'].includes(k.toLowerCase()))
          .map(([k, v]) => `${k}: ${v}\r\n`)
          .join('') +
        `\r\n`
    );

    if (proxyHead.length > 0) {
      socket.write(proxyHead);
    }

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('error', (err) => {
    logError(`WS proxy error: ${err.message}`);
    socket.destroy();
  });

  proxyReq.end();
}

function cmdProxy(args: string[]): void {
  const options = parseProxyArgs(args);
  const { config: rawConfig, filePath } = loadConfig(options.configPath);
  const config = resolveConfigObject(rawConfig);
  const proxyPort =
    options.port ??
    config.defaultApp.devPort ??
    /* istanbul ignore next */ 3000;
  const localApps = new Set(options.localApps);

  // If no --local-apps specified, treat ALL apps as local (backward compat)
  const allLocal = localApps.size === 0;
  if (allLocal) {
    for (const name of Object.keys(config.applications)) {
      localApps.add(name);
    }
  }

  log('');
  log(`  ${BOLD}nextjs-microfrontends${RESET} — Local Dev Proxy`);
  log(`  ${DIM}Config: ${filePath}${RESET}`);
  log('');

  // Print route table
  log('  Route Table:');

  const printApp = (app: ResolvedApplication, prefix: string): void => {
    const isLocal = localApps.has(app.name);
    const target = resolveAppTarget(app, localApps);
    const status = isLocal
      ? `${GREEN}● local${RESET}`
      : `${YELLOW}○ fallback${RESET}`;
    const patterns =
      app.routing.flatMap((g) => g.paths).join(', ') || '(default)';
    log(`  ${prefix} ${BOLD}${app.name}${RESET} → ${target} ${status}`);
    log(
      `  ${prefix.replaceAll(/[├└]/g, ' ').replaceAll('─', ' ')}   ${DIM}routes: ${patterns}${RESET}`
    );
  };

  printApp(config.defaultApp, '├─');
  config.childApps.forEach((app, idx) => {
    const prefix = idx === config.childApps.length - 1 ? '└─' : '├─';
    printApp(app, prefix);
  });

  log('');

  // Create server
  const server = http.createServer((req, res) => {
    const { url: targetUrl, app } = resolveProxyTarget(req, config, localApps);

    if (options.verbose) {
      const isLocal = localApps.has(app.name);
      const localTag = isLocal
        ? `${GREEN}(local)${RESET}`
        : `${YELLOW}(fallback)${RESET}`;
      log(
        `  ${DIM}→${RESET} ${req.method} ${req.url} → ${BOLD}${app.name}${RESET} ${localTag}`
      );
    }

    proxyRequest(req, res, targetUrl, options.verbose);
  });

  // WebSocket upgrade (HMR support)
  server.on('upgrade', (req, socket, head) => {
    const { url: targetUrl } = resolveProxyTarget(req, config, localApps);
    proxyWebSocket(
      req,
      socket as net.Socket,
      head as Buffer,
      targetUrl,
      options.verbose
    );
  });

  // Graceful shutdown
  const shutdown = (): void => {
    log(`\n  ${DIM}Shutting down proxy...${RESET}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start listening
  server.listen(proxyPort, () => {
    log(
      `  ${GREEN}✓${RESET} Proxy running at ${BOLD}http://localhost:${proxyPort}${RESET}`
    );
    log('');
    if (!allLocal) {
      log(`  ${DIM}Local apps: ${[...localApps].join(', ')}${RESET}`);
      log(
        `  ${DIM}Fallback apps route to their production/environment URLs${RESET}`
      );
      log('');
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logError(`Port ${proxyPort} is already in use`);
    } else {
      logError(`Server error: ${err.message}`);
    }
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  log(`
  ${BOLD}nextjs-microfrontends${RESET} — CLI

  ${BOLD}USAGE${RESET}
    microfrontends <command> [options]

  ${BOLD}COMMANDS${RESET}
    port                      Print the dev port for the current application
    proxy [configPath]        Start the local development proxy

  ${BOLD}PORT OPTIONS${RESET}
    --app <name>              Specify the app name (auto-detected from package.json)

  ${BOLD}PROXY OPTIONS${RESET}
    --local-apps, -l <names>  Space-separated list of locally running app names
    --config, -c <path>       Path to mfe.config.json (auto-detected if omitted)
    --port, -p <number>       Proxy listen port (default: from config or 4000)
    --verbose, -v             Enable verbose request logging

  ${BOLD}EXAMPLES${RESET}
    ${DIM}# Print port for current app${RESET}
    microfrontends port

    ${DIM}# Start proxy routing only auth to local, others to production${RESET}
    microfrontends proxy --local-apps auth

    ${DIM}# Start proxy with multiple local apps${RESET}
    microfrontends proxy --local-apps auth safetydb --verbose

    ${DIM}# Start proxy (all apps local, backward compatible)${RESET}
    microfrontends proxy

  ${BOLD}ENVIRONMENT VARIABLES${RESET}
    VC_MICROFRONTENDS_CONFIG  Path to mfe.config.json (polyrepo setup)
    MFE_DEBUG                 Enable debug logging (set to "1")
  `);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'port':
      cmdPort(subArgs);
      break;
    case 'proxy':
      cmdProxy(subArgs);
      break;
    default:
      // Backward compat: if first arg looks like a flag, treat as proxy
      if (subcommand.startsWith('-')) {
        cmdProxy(args);
      } else {
        logError(`Unknown command: ${subcommand}`);
        printHelp();
        process.exit(1);
      }
  }
}

main();
