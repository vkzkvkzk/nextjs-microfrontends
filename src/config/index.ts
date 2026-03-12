export {
  resolveConfig,
  parseConfigFile,
  findConfigFile,
  MicrofrontendsConfigError
} from './parser';
export { resolveConfigObject, validateConfig } from './resolver';
export type {
  MicrofrontendsConfig,
  ApplicationConfig,
  PathGroup,
  DevelopmentConfig,
  ProductionConfig,
  ResolvedConfig,
  ResolvedApplication
} from './schema';
