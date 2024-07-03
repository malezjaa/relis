import { BaseCommand, options } from 'curzon';
import { bumpVersion } from '../bump.ts';
import { UsageError } from '../errors.ts';
import { Project } from '../project.ts';

export class BumpCommand extends BaseCommand {
  static paths = ['bump'];

  patch = options.boolean('patch', {
    description: 'Bump patch version',
    short: 'p',
  });
  minor = options.boolean('minor', {
    description: 'Bump minor version',
    short: 'm',
  });
  major = options.boolean('major', {
    description: 'Bump major version',
    short: 'r',
  });
  prepatch = options.boolean('prepatch', {
    description: 'Bump prepatch version',
  });
  preminor = options.boolean('preminor', {
    description: 'Bump preminor version',
  });
  premajor = options.boolean('premajor', {
    description: 'Bump premajor version',
  });

  async run() {
    const project = await Project.init();

    const bumpType = this.getBumpType();
    if (!bumpType) throw new UsageError('Only one version bump is allowed!');

    await bumpVersion(project, bumpType);
  }

  getBumpType() {
    const bumpTypes = [
      'patch',
      'minor',
      'major',
      'prepatch',
      'preminor',
      'premajor',
    ];
    const selected = bumpTypes.filter((type) => this[type as keyof this]);
    return selected.length === 1 ? selected[0] : null;
  }
}
