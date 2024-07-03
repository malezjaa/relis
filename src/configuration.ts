import NpmConfig from '@npmcli/config';
// @ts-expect-error Missing type definitions
import pkg from '@npmcli/config/lib/definitions/index.js';
const { definitions, shorthands, flatten } = pkg;
import { loadConfig } from 'c12';
import { ColoidOptions } from 'coloid';
import { resolve } from 'pathe';
import { PackageJson } from 'pkg-types';

export type Config = {
  coloidOptions: ColoidOptions;
  templates: {
    commit: string;
    tagBody: string;
    tagMessage: string;
  };
  changelogFile: string;
  npmConfig?: NpmConfig;
  repository?: PackageJson['repository'];
  types: Record<string, string>;
};

export type Options = Partial<Omit<Config, 'npmConfig'>>;

export const defaultTypes: Record<string, string> = {
  fix: '🔨 Fixes',
  feat: '🚚 Features',
  docs: '📚 Documentation',
  ench: '🎨 Enhancements',
  perf: '🔥 Performance',
  refactor: '🔧 Refactor',
  test: '🧪 Tests',
  chore: '🧹 Chores',
  ci: '🚀 CI',
  style: '💅 Style',
  build: '🏗 Build',
  examples: '📦 Examples',
};

const defaults: any = {
  coloidOptions: {
    tag: 'bnp',
    level: 'debug',
  },
  templates: {
    commit: 'chore(release): v{{newVersion}}',
    tagMessage: 'v{{newVersion}}',
    tagBody: 'v{{newVersion}}',
  },
  changelogFile: 'CHANGELOG.md',
  types: defaultTypes,
};

export class Configuration {
  static fileName = 'bnp';
  static useBun = typeof Bun !== 'undefined';

  static async init(noNpmConfig: boolean = false) {
    const { config } = await loadConfig<Config>({
      name: Configuration.fileName,
      defaultConfig: defaults,
      jitiOptions: {
        experimentalBun: Configuration.useBun,
      },
    });

    if (!noNpmConfig) {
      config.npmConfig = new NpmConfig({
        npmPath: resolve(import.meta.dirname, '..'),
        definitions,
        shorthands,
        flatten,
      });

      await config.npmConfig.load();
    }

    return config;
  }
}

export const defineConfig = (options: Options) => {
  return options;
};
