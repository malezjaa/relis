import semver from 'semver';
import { UsageError } from './errors.ts';
import { Project } from './project.ts';

export const bumpVersion = async (project: Project, bumpType: string) => {
  project.logger.info(`Bumping to \`${bumpType}\` version`);

  const semverVersion = semver.clean(project.version as string);
  if (!semverVersion)
    throw new UsageError(
      `Bump failed. Invalid version number: \`${project.version}\``,
    );

  const newVersion = semver.inc(semverVersion, bumpType as semver.ReleaseType);
  project.logger.info(`Bumped version to \`${newVersion}\``);

  if (!newVersion) {
    throw new UsageError(
      `Bump failed. Invalid version number: \`${newVersion}\``,
    );
  }

  project.version = newVersion;

  await project.save();
};
