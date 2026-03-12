/**
 * Verify re-exports from barrel files.
 */

describe('src/index.ts re-exports', () => {
  it('exports config utilities and types', async () => {
    const mod = await import('../index');
    expect(typeof mod.findConfigFile).toBe('function');
    expect(typeof mod.parseConfigFile).toBe('function');
    expect(typeof mod.resolveConfig).toBe('function');
    expect(typeof mod.matchPath).toBe('function');
    expect(typeof mod.getZoneForPath).toBe('function');
    expect(typeof mod.matchStaticAssetPath).toBe('function');
  });
});

describe('src/config/index.ts re-exports', () => {
  it('exports parser, resolver, and error class', async () => {
    const mod = await import('../config/index');
    expect(typeof mod.resolveConfig).toBe('function');
    expect(typeof mod.parseConfigFile).toBe('function');
    expect(typeof mod.findConfigFile).toBe('function');
    expect(typeof mod.MicrofrontendsConfigError).toBe('function');
    expect(typeof mod.resolveConfigObject).toBe('function');
    expect(typeof mod.validateConfig).toBe('function');
  });
});
