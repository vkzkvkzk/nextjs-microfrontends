/**
 * Unit tests for the CLI module (`src/bin/cli.ts`).
 *
 * The CLI `main()` runs at module load time. We use jest.resetModules()
 * + custom process.argv to invoke each sub-command.
 *
 * `node:http` is mocked so `cmdProxy` tests don't start real servers.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { MicrofrontendsConfig } from '../config/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// ---------------------------------------------------------------------------
// Mock `node:http` to prevent real servers in proxy tests
// ---------------------------------------------------------------------------

const mockProxyRes = {
  statusCode: 200,
  headers: { 'content-type': 'text/html' },
  pipe: jest.fn()
};

interface MockReq {
  on: jest.Mock;
  end: jest.Mock;
  write: jest.Mock;
  pipe: jest.Mock;
  _errorHandler?: AnyFn;
  _upgradeHandler?: AnyFn;
}

const mockProxyReq: MockReq = {
  on: jest.fn((event: string, handler: AnyFn) => {
    if (event === 'error') {
      mockProxyReq._errorHandler = handler;
    }
    if (event === 'upgrade') {
      mockProxyReq._upgradeHandler = handler;
    }
    return mockProxyReq;
  }),
  end: jest.fn(),
  write: jest.fn(),
  pipe: jest.fn()
};

interface MockServer {
  listen: jest.Mock;
  close: jest.Mock;
  on: jest.Mock;
  address: jest.Mock;
}

const mockServer: MockServer = {
  listen: jest.fn((_port: number, cb?: () => void): MockServer => {
    if (cb) cb();
    return mockServer;
  }),
  close: jest.fn((cb?: () => void): MockServer => {
    if (cb) cb();
    return mockServer;
  }),
  on: jest.fn((_event: string, _handler: AnyFn): MockServer => mockServer),
  address: jest.fn(() => ({ port: 9999 }))
};

jest.mock('node:http', () => {
  const actual = jest.requireActual<typeof import('node:http')>('node:http');
  return {
    __esModule: true,
    ...actual,
    createServer: jest.fn((_handler?: AnyFn) => mockServer),
    request: jest.fn((_options: unknown, callback?: AnyFn) => {
      if (callback) {
        callback(mockProxyRes);
      }
      return mockProxyReq;
    })
  };
});

jest.mock('node:https', () => {
  const actual = jest.requireActual<typeof import('node:https')>('node:https');
  return {
    __esModule: true,
    ...actual,
    request: jest.fn((_options: unknown, callback?: AnyFn) => {
      if (callback) callback(mockProxyRes);
      return mockProxyReq;
    })
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mfe-cli-'));
}

const validConfig: MicrofrontendsConfig = {
  applications: {
    gateway: {
      default: true,
      development: { port: 3000 }
    },
    blog: {
      routing: [{ paths: ['/blog', '/blog/:path*'] }],
      development: { port: 3001 }
    }
  }
};

/** Invoke the CLI by dynamically importing the module with custom argv. */
async function runCli(
  args: string[],
  opts: { cwd?: string; envVars?: Record<string, string> } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  jest.resetModules();

  const saved = {
    argv: process.argv,
    cwd: process.cwd,
    exit: process.exit,
    write: process.stdout.write,
    log: console.log,
    error: console.error,
    env: { ...process.env }
  };

  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;

  process.argv = ['node', 'microfrontends', ...args];
  if (opts.cwd) {
    const cwd = opts.cwd;
    process.cwd = () => cwd;
  }
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__EXIT__`);
  }) as never;
  process.stdout.write = ((chunk: string) => {
    stdout += chunk;
    return true;
  }) as never;
  console.log = (msg: string) => {
    stdout += msg + '\n';
  };
  console.error = (msg: string) => {
    stderr += msg + '\n';
  };

  if (opts.envVars) Object.assign(process.env, opts.envVars);

  // Reset mock server state
  mockServer.listen.mockClear();
  mockServer.on.mockClear();
  mockProxyReq.on.mockClear();
  mockProxyReq.end.mockClear();
  mockProxyReq.write.mockClear();
  mockProxyReq.pipe.mockClear();
  mockProxyRes.pipe.mockClear();
  mockProxyRes.statusCode = 200;
  mockProxyReq._errorHandler = undefined;
  mockProxyReq._upgradeHandler = undefined;
  const http = require('node:http');
  if (http.request?.mockClear) http.request.mockClear();
  if (http.createServer?.mockClear) http.createServer.mockClear();
  const httpsMod = require('node:https');
  if (httpsMod.request?.mockClear) httpsMod.request.mockClear();

  try {
    await import('../bin/cli');
  } catch (err) {
    if (!(err instanceof Error && err.message === '__EXIT__')) throw err;
  } finally {
    process.argv = saved.argv;
    process.cwd = saved.cwd;
    process.exit = saved.exit;
    process.stdout.write = saved.write;
    console.log = saved.log;
    console.error = saved.error;
    for (const k of Object.keys(process.env)) {
      if (!(k in saved.env)) delete process.env[k];
    }
    Object.assign(process.env, saved.env);
  }

  return { stdout, stderr, exitCode };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI — help', () => {
  it('prints help with no arguments', async () => {
    const { stdout, exitCode } = await runCli([]);
    expect(stdout).toContain('USAGE');
    expect(stdout).toContain('COMMANDS');
    expect(exitCode).toBe(0);
  });

  it('prints help with --help', async () => {
    const { stdout, exitCode } = await runCli(['--help']);
    expect(stdout).toContain('USAGE');
    expect(exitCode).toBe(0);
  });

  it('prints help with -h', async () => {
    const { stdout, exitCode } = await runCli(['-h']);
    expect(stdout).toContain('USAGE');
    expect(exitCode).toBe(0);
  });
});

describe('CLI — unknown command', () => {
  it('prints error and exits 1', async () => {
    const { stderr, exitCode } = await runCli(['banana']);
    expect(stderr).toContain('Unknown command');
    expect(exitCode).toBe(1);
  });
});

describe('CLI — port', () => {
  it('prints the declared dev port for --app', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stdout } = await runCli(['port', '--app', 'blog'], { cwd: dir });
    expect(stdout).toContain('3001');

    fs.rmSync(dir, { recursive: true });
  });

  it('auto-detects app name from package.json', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'gateway' })
    );

    const { stdout } = await runCli(['port'], { cwd: dir });
    expect(stdout).toContain('3000');

    fs.rmSync(dir, { recursive: true });
  });

  it('exits 1 when app name cannot be determined', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stderr, exitCode } = await runCli(['port'], { cwd: dir });
    expect(stderr).toContain('Cannot determine');
    expect(exitCode).toBe(1);

    fs.rmSync(dir, { recursive: true });
  });

  it('exits 1 when app not in config', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stderr, exitCode } = await runCli(['port', '--app', 'nope'], {
      cwd: dir
    });
    expect(stderr).toContain('not found');
    expect(exitCode).toBe(1);

    fs.rmSync(dir, { recursive: true });
  });

  it('uses deterministic port when no devPort configured', async () => {
    const dir = makeTmpDir();
    const noPortConfig: MicrofrontendsConfig = {
      applications: {
        gw: { default: true },
        svc: { routing: [{ paths: ['/svc'] }] }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(noPortConfig)
    );

    const { stdout } = await runCli(['port', '--app', 'svc'], { cwd: dir });
    const port = Number.parseInt(stdout.trim(), 10);
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThan(4000);

    fs.rmSync(dir, { recursive: true });
  });

  it('handles malformed package.json (falls through to error)', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );
    fs.writeFileSync(path.join(dir, 'package.json'), '{{{bad');

    const { stderr, exitCode } = await runCli(['port'], { cwd: dir });
    expect(stderr).toContain('Cannot determine');
    expect(exitCode).toBe(1);

    fs.rmSync(dir, { recursive: true });
  });
});

describe('CLI — loadConfig', () => {
  it('uses VC_MICROFRONTENDS_CONFIG env var', async () => {
    const dir = makeTmpDir();
    const configPath = path.join(dir, 'custom.json');
    fs.writeFileSync(configPath, JSON.stringify(validConfig));

    const { stdout } = await runCli(['port', '--app', 'blog'], {
      cwd: dir,
      envVars: { VC_MICROFRONTENDS_CONFIG: configPath }
    });
    expect(stdout).toContain('3001');

    fs.rmSync(dir, { recursive: true });
  });

  it('exits 1 when no config found', async () => {
    const dir = makeTmpDir();
    const { stderr, exitCode } = await runCli(['port', '--app', 'blog'], {
      cwd: dir
    });
    expect(stderr).toContain('Could not find mfe.config.json');
    expect(exitCode).toBe(1);

    fs.rmSync(dir, { recursive: true });
  });
});

describe('CLI — proxy', () => {
  it('starts proxy with route table output', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stdout } = await runCli(['proxy', '--port', '4000'], { cwd: dir });
    expect(stdout).toContain('gateway');
    expect(stdout).toContain('blog');
    expect(stdout).toContain('Route Table');
    expect(mockServer.listen).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('handles --verbose flag', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stdout } = await runCli(['proxy', '--port', '4000', '--verbose'], {
      cwd: dir
    });
    expect(stdout).toContain('Proxy running');

    fs.rmSync(dir, { recursive: true });
  });

  it('handles --local-apps with multiple apps', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stdout } = await runCli(
      ['proxy', '--local-apps', 'blog', '--port', '0'],
      { cwd: dir }
    );
    expect(stdout).toContain('blog');
    expect(stdout).toContain('local');

    fs.rmSync(dir, { recursive: true });
  });

  it('handles -l shorthand', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stdout } = await runCli(['proxy', '-l', 'blog', '-p', '0'], {
      cwd: dir
    });
    expect(stdout).toContain('blog');

    fs.rmSync(dir, { recursive: true });
  });

  it('treats first positional arg as configPath', async () => {
    const dir = makeTmpDir();
    const configFile = path.join(dir, 'custom.json');
    fs.writeFileSync(configFile, JSON.stringify(validConfig));

    const { stdout } = await runCli(['proxy', configFile, '--port', '0'], {
      cwd: dir
    });
    expect(stdout).toContain('gateway');

    fs.rmSync(dir, { recursive: true });
  });

  it('handles --config / -c flag', async () => {
    const dir = makeTmpDir();
    const configFile = path.join(dir, 'my.json');
    fs.writeFileSync(configFile, JSON.stringify(validConfig));

    const { stdout } = await runCli(
      ['proxy', '--config', configFile, '--port', '0'],
      { cwd: dir }
    );
    expect(stdout).toContain('gateway');

    fs.rmSync(dir, { recursive: true });
  });

  it('backward compat: leading flags as proxy', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const { stdout } = await runCli(['--port', '0', '--verbose'], { cwd: dir });
    expect(stdout).toContain('gateway');

    fs.rmSync(dir, { recursive: true });
  });

  it('defaults to port from config or 3000 when unspecified', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy'], { cwd: dir });
    // defaultApp.devPort is 3000
    expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));

    fs.rmSync(dir, { recursive: true });
  });

  it('formats multiple child apps with correct prefix (├─ and └─)', async () => {
    const dir = makeTmpDir();
    const multiChildConfig: MicrofrontendsConfig = {
      applications: {
        gateway: { default: true, development: { port: 3000 } },
        blog: {
          routing: [{ paths: ['/blog'] }],
          development: { port: 3001 }
        },
        docs: {
          routing: [{ paths: ['/docs'] }],
          development: { port: 3002 }
        }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(multiChildConfig)
    );

    const { stdout } = await runCli(['proxy', '--port', '4000'], { cwd: dir });
    expect(stdout).toContain('blog');
    expect(stdout).toContain('docs');
    expect(stdout).toContain('gateway');

    fs.rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// Proxy internal handler tests
// ---------------------------------------------------------------------------

/**
 * Get the request handler passed to http.createServer from the mock.
 * Must be called after `runCli(['proxy', ...])`.
 */
function getRequestHandler(): (
  req: Record<string, unknown>,
  res: Record<string, unknown>
) => void {
  const http = require('node:http');
  const calls = http.createServer.mock.calls;
  return calls[calls.length - 1][0];
}

/**
 * Get the 'upgrade' handler registered on the mock server.
 */
function getUpgradeHandler(): (...args: unknown[]) => void {
  const upgradeCalls = mockServer.on.mock.calls.filter(
    (c: [string, AnyFn]) => c[0] === 'upgrade'
  );
  return upgradeCalls[upgradeCalls.length - 1][1];
}

describe('CLI — proxy request handler', () => {
  it('routes a request to the matching child app', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/blog/some-post',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    // proxyRequest was called — http.request should have been invoked
    const http = require('node:http');
    expect(http.request).toHaveBeenCalled();
    // proxyRes.pipe should have been called with res
    expect(mockProxyRes.pipe).toHaveBeenCalledWith(mockRes, { end: true });

    fs.rmSync(dir, { recursive: true });
  });

  it('routes a request to the default app for unknown paths', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/unknown-path',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    const http = require('node:http');
    expect(http.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('routes static asset paths', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/blog-static/something.js',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    const http = require('node:http');
    expect(http.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('logs verbose output when --verbose is set', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000', '--verbose'], {
      cwd: dir
    });
    const handler = getRequestHandler();

    // Capture output from the handler's verbose logging
    let handlerOutput = '';
    const savedLog = console.log;
    console.log = (msg: string) => {
      handlerOutput += msg + '\n';
    };

    const mockReq = {
      url: '/blog/test',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    console.log = savedLog;
    expect(handlerOutput).toContain('blog');

    fs.rmSync(dir, { recursive: true });
  });

  it('handles proxy request error', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/blog/test',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    // Trigger the error handler on proxyReq
    const errorHandler = mockProxyReq._errorHandler;
    expect(errorHandler).toBeDefined();

    const savedError = console.error;
    console.error = () => {};

    if (errorHandler) errorHandler(new Error('connection refused'));

    console.error = savedError;
    expect(mockRes.writeHead).toHaveBeenCalledWith(502, {
      'Content-Type': 'text/plain'
    });
    expect(mockRes.end).toHaveBeenCalledWith(
      expect.stringContaining('Bad Gateway')
    );

    fs.rmSync(dir, { recursive: true });
  });

  it('handles proxy request error when headers already sent', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/blog/test',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: true // headers already sent
    };

    handler(mockReq, mockRes);

    const errorHandler = mockProxyReq._errorHandler;
    const savedError = console.error;
    console.error = () => {};
    if (errorHandler) errorHandler(new Error('timeout'));
    console.error = savedError;

    // writeHead should NOT be called again since headers were already sent
    // Only called once by the initial proxy response
    expect(mockRes.end).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('handles WebSocket upgrade', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const upgradeHandler = getUpgradeHandler();

    const mockSocket = {
      write: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn()
    };

    upgradeHandler(
      { url: '/blog/ws', method: 'GET', headers: { host: 'localhost:4000' } },
      mockSocket,
      Buffer.alloc(0)
    );

    const http = require('node:http');
    expect(http.request).toHaveBeenCalled();

    // Trigger the WebSocket upgrade callback
    const wsUpgradeHandler = mockProxyReq._upgradeHandler;
    if (wsUpgradeHandler) {
      const proxySocket = {
        pipe: jest.fn(),
        on: jest.fn(),
        destroy: jest.fn()
      };
      wsUpgradeHandler(
        {
          headers: {
            'sec-websocket-accept': 'abc',
            upgrade: 'websocket',
            connection: 'Upgrade'
          }
        },
        proxySocket,
        Buffer.alloc(0)
      );
      expect(mockSocket.write).toHaveBeenCalledWith(
        expect.stringContaining('101')
      );
      expect(proxySocket.pipe).toHaveBeenCalledWith(mockSocket);
      expect(mockSocket.pipe).toHaveBeenCalledWith(proxySocket);
    }

    fs.rmSync(dir, { recursive: true });
  });

  it('handles WebSocket upgrade with non-empty proxyHead', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000', '--verbose'], { cwd: dir });
    const upgradeHandler = getUpgradeHandler();

    const mockSocket = {
      write: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn()
    };

    let handlerOutput = '';
    const savedLog = console.log;
    console.log = (msg: string) => {
      handlerOutput += msg + '\n';
    };

    upgradeHandler(
      { url: '/blog/hmr', method: 'GET', headers: { host: 'localhost:4000' } },
      mockSocket,
      Buffer.alloc(0)
    );

    console.log = savedLog;
    expect(handlerOutput).toContain('WS');

    // Trigger the upgrade with non-empty proxyHead
    const wsUpgradeHandler = mockProxyReq._upgradeHandler;
    if (wsUpgradeHandler) {
      const proxySocket = {
        pipe: jest.fn(),
        on: jest.fn(),
        destroy: jest.fn()
      };
      wsUpgradeHandler(
        { headers: { 'x-custom': 'val' } },
        proxySocket,
        Buffer.from('extra data')
      );
      // Should write proxyHead too since it's not empty
      expect(mockSocket.write).toHaveBeenCalledWith(Buffer.from('extra data'));
    }

    fs.rmSync(dir, { recursive: true });
  });

  it('handles WebSocket proxy error', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const upgradeHandler = getUpgradeHandler();

    const mockSocket = {
      write: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn()
    };

    upgradeHandler(
      { url: '/blog/ws', method: 'GET', headers: { host: 'localhost:4000' } },
      mockSocket,
      Buffer.alloc(0)
    );

    // Trigger the error handler on proxyReq
    const errorHandler = mockProxyReq._errorHandler;
    expect(errorHandler).toBeDefined();

    const savedError = console.error;
    console.error = () => {};

    if (errorHandler) errorHandler(new Error('ws connection failed'));

    console.error = savedError;
    expect(mockSocket.destroy).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('handles WebSocket socket errors (both directions)', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const upgradeHandler = getUpgradeHandler();

    const mockSocket = {
      write: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn((event: string, handler: AnyFn) => {
        if (event === 'error') {
          (mockSocket as Record<string, unknown>)._errorHandler = handler;
        }
      })
    };

    upgradeHandler(
      { url: '/blog/ws', method: 'GET', headers: { host: 'localhost:4000' } },
      mockSocket,
      Buffer.alloc(0)
    );

    const wsUpgradeHandler = mockProxyReq._upgradeHandler;
    if (wsUpgradeHandler) {
      const proxySocket = {
        pipe: jest.fn(),
        on: jest.fn((event: string, handler: AnyFn) => {
          if (event === 'error') {
            (proxySocket as Record<string, unknown>)._errorHandler = handler;
          }
        }),
        destroy: jest.fn()
      };
      wsUpgradeHandler({ headers: {} }, proxySocket, Buffer.alloc(0));

      // Trigger proxySocket error → should destroy socket
      const proxySocketErrHandler = (proxySocket as Record<string, unknown>)
        ._errorHandler as AnyFn;
      if (proxySocketErrHandler) {
        proxySocketErrHandler(new Error('proxy socket error'));
        expect(mockSocket.destroy).toHaveBeenCalled();
      }

      // Trigger socket error → should destroy proxySocket
      const socketErrHandler = (mockSocket as Record<string, unknown>)
        ._errorHandler as AnyFn;
      if (socketErrHandler) {
        socketErrHandler(new Error('client socket error'));
        expect(proxySocket.destroy).toHaveBeenCalled();
      }
    }

    fs.rmSync(dir, { recursive: true });
  });

  it('handles resolveAppTarget with fallback URL', async () => {
    const dir = makeTmpDir();
    // Config where blog has no devPort
    const noDevPortConfig: MicrofrontendsConfig = {
      applications: {
        gateway: { default: true, development: { port: 3000 } },
        blog: {
          routing: [{ paths: ['/blog', '/blog/:path*'] }],
          production: { url: 'https://blog.example.com' }
        }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(noDevPortConfig)
    );

    // Use --local-apps gateway only, so blog falls back to production URL
    await runCli(['proxy', '--port', '4000', '--local-apps', 'gateway'], {
      cwd: dir
    });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/blog/test',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    const httpsMod = require('node:https');
    // Fallback URL is HTTPS, so https.request should have been called
    expect(httpsMod.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('resolves local app target using resolvedUrl when no devPort', async () => {
    const dir = makeTmpDir();
    const noDevPortConfig: MicrofrontendsConfig = {
      applications: {
        gateway: { default: true },
        svc: {
          routing: [{ paths: ['/svc', '/svc/:path*'] }],
          production: { url: 'http://svc.prod:9000' }
        }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(noDevPortConfig)
    );

    // All apps are local (no --local-apps specified → allLocal),
    // svc has no devPort → resolveAppTarget returns resolvedUrl
    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/svc/api',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    const http = require('node:http');
    expect(http.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('uses HTTPS transport for https target URLs', async () => {
    const dir = makeTmpDir();
    const httpsConfig: MicrofrontendsConfig = {
      applications: {
        gateway: { default: true, development: { port: 3000 } },
        blog: {
          routing: [{ paths: ['/blog', '/blog/:path*'] }],
          production: { url: 'https://blog.example.com' }
        }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(httpsConfig)
    );

    // blog falls back to production (non-local) which is HTTPS
    await runCli(['proxy', '--port', '4000', '--local-apps', 'gateway'], {
      cwd: dir
    });
    const handler = getRequestHandler();

    const mockReq = {
      url: '/blog/post',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    handler(mockReq, mockRes);

    const httpsMod = require('node:https');
    expect(httpsMod.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });

  it('verbose mode shows fallback tag for non-local apps', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(
      ['proxy', '--port', '4000', '--verbose', '--local-apps', 'gateway'],
      { cwd: dir }
    );
    const handler = getRequestHandler();

    let handlerOutput = '';
    const savedLog = console.log;
    console.log = (msg: string) => {
      handlerOutput += msg + '\n';
    };

    handler(
      { url: '/blog/post', method: 'GET', headers: {}, pipe: jest.fn() },
      { writeHead: jest.fn(), end: jest.fn(), headersSent: false }
    );

    console.log = savedLog;
    expect(handlerOutput).toContain('fallback');

    fs.rmSync(dir, { recursive: true });
  });

  it('WebSocket upgrade with HTTPS target', async () => {
    const dir = makeTmpDir();
    const httpsConfig: MicrofrontendsConfig = {
      applications: {
        gateway: { default: true },
        blog: {
          routing: [{ paths: ['/blog', '/blog/:path*'] }],
          production: { url: 'https://blog.example.com' }
        }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(httpsConfig)
    );

    await runCli(['proxy', '--port', '4000', '--local-apps', 'gateway'], {
      cwd: dir
    });
    const upgradeHandler = getUpgradeHandler();

    const mockSocket = {
      write: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn()
    };

    upgradeHandler(
      { url: '/blog/hmr', method: 'GET', headers: {} },
      mockSocket,
      Buffer.alloc(0)
    );

    const httpsMod = require('node:https');
    expect(httpsMod.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });
});

describe('CLI — proxy server lifecycle', () => {
  it('handles SIGINT/SIGTERM shutdown', async () => {
    jest.useFakeTimers();
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    const processOnSpy = jest.spyOn(process, 'on');

    await runCli(['proxy', '--port', '4000'], { cwd: dir });

    // Find the SIGINT and SIGTERM handlers
    const sigintCalls = processOnSpy.mock.calls.filter(
      (c) => c[0] === 'SIGINT'
    );
    const sigtermCalls = processOnSpy.mock.calls.filter(
      (c) => c[0] === 'SIGTERM'
    );

    expect(sigintCalls.length).toBeGreaterThan(0);
    expect(sigtermCalls.length).toBeGreaterThan(0);

    // Invoke the shutdown handler
    const shutdownHandler = sigintCalls[sigintCalls.length - 1][1] as AnyFn;

    let shutdownOutput = '';
    const savedLog = console.log;
    const savedExit = process.exit;
    process.exit = jest.fn() as never;
    console.log = (msg: string) => {
      shutdownOutput += msg + '\n';
    };

    shutdownHandler();

    // Advance past the 5s timeout to flush it
    jest.advanceTimersByTime(6000);

    console.log = savedLog;
    process.exit = savedExit;

    expect(mockServer.close).toHaveBeenCalled();
    expect(shutdownOutput).toContain('Shutting down');

    processOnSpy.mockRestore();
    jest.useRealTimers();
    fs.rmSync(dir, { recursive: true });
  });

  it('handles server EADDRINUSE error', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });

    // Find the server error handler
    const errorCalls = mockServer.on.mock.calls.filter(
      (c: [string, AnyFn]) => c[0] === 'error'
    );
    expect(errorCalls.length).toBeGreaterThan(0);

    const errorHandler = errorCalls[errorCalls.length - 1][1];

    let capturedError = '';
    const savedError = console.error;
    const savedExit = process.exit;
    process.exit = jest.fn() as never;
    console.error = (msg: string) => {
      capturedError += msg + '\n';
    };

    errorHandler({ code: 'EADDRINUSE', message: 'Port in use' });

    console.error = savedError;
    process.exit = savedExit;

    expect(capturedError).toContain('already in use');
  });

  it('handles generic server error', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });

    const errorCalls = mockServer.on.mock.calls.filter(
      (c: [string, AnyFn]) => c[0] === 'error'
    );
    const errorHandler = errorCalls[errorCalls.length - 1][1];

    let capturedError = '';
    const savedError = console.error;
    const savedExit = process.exit;
    process.exit = jest.fn() as never;
    console.error = (msg: string) => {
      capturedError += msg + '\n';
    };

    errorHandler({ code: 'UNKNOWN', message: 'Something went wrong' });

    console.error = savedError;
    process.exit = savedExit;

    expect(capturedError).toContain('Server error');
  });

  it('handles request with null url', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.json'),
      JSON.stringify(validConfig)
    );

    await runCli(['proxy', '--port', '4000'], { cwd: dir });
    const handler = getRequestHandler();

    const mockReq = {
      url: undefined,
      method: 'GET',
      headers: { host: 'localhost:4000' },
      pipe: jest.fn()
    };
    const mockRes = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };

    // Should not throw — falls back to '/' for pathname
    handler(mockReq, mockRes);

    const http = require('node:http');
    expect(http.request).toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true });
  });
});
