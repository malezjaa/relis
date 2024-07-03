import { Coloid, createColoid } from 'coloid';
import { join } from 'pathe';
import { PackageJson, readPackageJSON, writePackageJSON } from 'pkg-types';
import { Config, Configuration } from './configuration.ts';
import { MissingWorkspaceError } from './errors.ts';
import { fetchRemote } from './git.ts';

export class Project {
  public config: Config;
  public logger: Coloid;
  public packageJson: PackageJson;

  private constructor(config: Config, pkgJson: PackageJson) {
    this.config = config;
    this.logger = createColoid(this.config.coloidOptions);

    this.packageJson = pkgJson;
  }

  static async init(noNpmConfig: boolean = false) {
    const config = await Configuration.init(noNpmConfig);

    let pkgJson: PackageJson;
    try {
      pkgJson = await readPackageJSON(process.cwd(), {
        startingFrom: process.cwd(),
        reverse: false,
      });
    } catch {
      throw new MissingWorkspaceError();
    }

    if (!config.repository) {
      config.repository = pkgJson.repository || (await fetchRemote());
    }

    return new Project(config, pkgJson);
  }

  get scope() {
    const parts = this.packageJson.name?.split('/');

    if (!parts || parts.length < 2) {
      return null;
    }

    return parts[0];
  }

  get name() {
    const parts = this.packageJson.name?.split('/');

    if (parts && parts.length >= 2) {
      return parts[1];
    }

    return this.packageJson.name;
  }

  get fullName() {
    return this.packageJson.name;
  }

  get version(): string | undefined {
    return this.packageJson.version;
  }

  set version(version: string) {
    this.packageJson.version = version;
  }

  async save() {
    try {
      await writePackageJSON(
        join(process.cwd(), 'package.json'),
        this.packageJson,
      );
    } catch (error) {
      throw new Error(`Failed to save package.json: ${error}`);
    }
  }
}
