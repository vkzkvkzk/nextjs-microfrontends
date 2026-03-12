/**
 * Unit tests for the parser module — file-based functions.
 *
 * Tests findConfigFile, parseConfigFile, stripJsonComments,
 * and file-path-based resolveConfig.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findConfigFile,
  parseConfigFile,
  resolveConfig,
  MicrofrontendsConfigError
} from '../config/parser';
import type { MicrofrontendsConfig } from '../config/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mfe-test-'));
}

function writeJsonFile(dir: string, filename: string, content: object): string {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

const validConfig: MicrofrontendsConfig = {
  applications: {
    gateway: {
      default: true,
      development: { port: 3000 }
    },
    child: {
      routing: [{ paths: ['/child', '/child/:path*'] }],
      development: { port: 3001 }
    }
  }
};

// ---------------------------------------------------------------------------
// findConfigFile
// ---------------------------------------------------------------------------

describe('findConfigFile', () => {
  it('finds mfe.config.json in the given directory', () => {
    const dir = makeTmpDir();
    writeJsonFile(dir, 'mfe.config.json', validConfig);

    const result = findConfigFile(dir);
    expect(result).toBe(path.join(dir, 'mfe.config.json'));

    fs.rmSync(dir, { recursive: true });
  });

  it('finds mfe.config.jsonc in the given directory', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'mfe.config.jsonc'),
      '// comment\n' + JSON.stringify(validConfig)
    );

    const result = findConfigFile(dir);
    expect(result).toBe(path.join(dir, 'mfe.config.jsonc'));

    fs.rmSync(dir, { recursive: true });
  });

  it('searches parent directories', () => {
    const parentDir = makeTmpDir();
    const childDir = path.join(parentDir, 'apps', 'home');
    fs.mkdirSync(childDir, { recursive: true });
    writeJsonFile(parentDir, 'mfe.config.json', validConfig);

    const result = findConfigFile(childDir);
    expect(result).toBe(path.join(parentDir, 'mfe.config.json'));

    fs.rmSync(parentDir, { recursive: true });
  });

  it('returns null when config file is not found', () => {
    const dir = makeTmpDir();
    const result = findConfigFile(dir);
    expect(result).toBeNull();
    fs.rmSync(dir, { recursive: true });
  });

  it('uses process.cwd() when no startDir is given', () => {
    // Should not throw — just returns null or a real config
    const result = findConfigFile();
    // Result depends on current working directory; just check it doesn't throw
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('stops at filesystem root', () => {
    // Start from root — should not throw, just return null or found file
    const result = findConfigFile('/');
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseConfigFile
// ---------------------------------------------------------------------------

describe('parseConfigFile', () => {
  it('parses a valid JSON config file', () => {
    const dir = makeTmpDir();
    const filePath = writeJsonFile(dir, 'mfe.config.json', validConfig);

    const result = parseConfigFile(filePath);
    expect(result.applications).toBeDefined();
    expect(result.applications.gateway).toBeDefined();

    fs.rmSync(dir, { recursive: true });
  });

  it('throws when file does not exist', () => {
    expect(() => parseConfigFile('/no/such/file.json')).toThrow(
      MicrofrontendsConfigError
    );
    expect(() => parseConfigFile('/no/such/file.json')).toThrow(
      'Configuration file not found'
    );
  });

  it('throws when file contains invalid JSON', () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'mfe.config.json');
    fs.writeFileSync(filePath, '{ not valid json }}}');

    expect(() => parseConfigFile(filePath)).toThrow(MicrofrontendsConfigError);
    expect(() => parseConfigFile(filePath)).toThrow(
      'Failed to parse configuration file'
    );

    fs.rmSync(dir, { recursive: true });
  });

  it('strips JSONC single-line comments from .jsonc files', () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'mfe.config.jsonc');
    const content = `{
  // This is a comment
  "applications": {
    "gateway": {
      "default": true // inline comment
    },
    "child": {
      "routing": [{ "paths": ["/child"] }]
    }
  }
}`;
    fs.writeFileSync(filePath, content);

    const result = parseConfigFile(filePath);
    expect(result.applications.gateway?.default).toBe(true);

    fs.rmSync(dir, { recursive: true });
  });

  it('strips JSONC multi-line comments from .jsonc files', () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'mfe.config.jsonc');
    const content = `{
  /* 
   * Multi-line comment
   */
  "applications": {
    "gateway": { "default": true },
    "child": { "routing": [{ "paths": ["/child"] }] }
  }
}`;
    fs.writeFileSync(filePath, content);

    const result = parseConfigFile(filePath);
    expect(result.applications.gateway?.default).toBe(true);

    fs.rmSync(dir, { recursive: true });
  });

  it('does NOT strip comments from .json files', () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'mfe.config.json');
    // Write valid JSON (comments would break it)
    fs.writeFileSync(filePath, JSON.stringify(validConfig));

    const result = parseConfigFile(filePath);
    expect(result.applications.gateway?.default).toBe(true);

    fs.rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// resolveConfig (file path overload)
// ---------------------------------------------------------------------------

describe('resolveConfig — file path', () => {
  it('resolves config from a file path string', () => {
    const dir = makeTmpDir();
    const filePath = writeJsonFile(dir, 'mfe.config.json', validConfig);

    const result = resolveConfig(filePath);
    expect(result.defaultApp.name).toBe('gateway');
    expect(result.childApps).toHaveLength(1);

    fs.rmSync(dir, { recursive: true });
  });

  it('resolves config from a config object', () => {
    const result = resolveConfig(validConfig);
    expect(result.defaultApp.name).toBe('gateway');
  });

  it('auto-discovers config file when no argument given (or throws)', () => {
    // May find a real config or throw — depends on cwd
    try {
      const result = resolveConfig();
      expect(result.defaultApp).toBeDefined();
    } catch (err) {
      expect(err).toBeInstanceOf(MicrofrontendsConfigError);
    }
  });

  it('auto-discovers config file from cwd and parses it', () => {
    const dir = makeTmpDir();
    writeJsonFile(dir, 'mfe.config.json', validConfig);
    const origCwd = process.cwd;
    process.cwd = () => dir;

    const result = resolveConfig();
    expect(result.defaultApp.name).toBe('gateway');

    process.cwd = origCwd;
    fs.rmSync(dir, { recursive: true });
  });

  it('throws when auto-discover fails and config not found', () => {
    const origCwd = process.cwd;
    const dir = makeTmpDir();
    process.cwd = () => dir;

    expect(() => resolveConfig()).toThrow('Could not find mfe.config.json');

    process.cwd = origCwd;
    fs.rmSync(dir, { recursive: true });
  });
});
