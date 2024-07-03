import { BaseCommand, options } from 'curzon';
import npa, { Result } from 'npm-package-arg';
import { MissingWorkspaceError, UsageError } from '../errors.ts';
import { pickRegistry } from '../http.ts';
import { Project } from '../project.ts';
import { publish } from '../publish/publish.ts';
import { runScript } from '../shell/scripts.ts';

export class PublishCommand extends BaseCommand {
  static paths = ['publish'];

  from = options.positional('from', {
    description: 'The package to publish',
    required: false,
  });

  access = options.string('access', {
    description: 'Access level for the package <public|restricted>',
    defaultValue: 'public',
    short: 'a',
  }) as 'public' | 'restricted';

  async run() {
    const project = await Project.init();

    if (!project.packageJson) {
      throw new MissingWorkspaceError();
    }

    if (project.packageJson.private) {
      throw new UsageError('You cannot publish a package marked as private.');
    }

    if (!project.fullName || !project.version) {
      throw new UsageError(
        "Can't publish a package without a name or version in the package.json file.",
      );
    }

    const tag = project.config.npmConfig?.get('tag');

    try {
      npa(`${project.fullName}@${tag}`);
    } catch (error) {
      throw new UsageError((error as Error).message);
    }

    const spec: Result = npa(this.from || '.');

    await runScript('prepublish', project);

    const registry = pickRegistry(project);

    // @ts-expect-error Missing type definitions
    const creds = project.config.npmConfig.getCredentialsByURI(registry);

    if (!(creds.token || creds.username || (creds.certfile && creds.keyfile))) {
      // TODO: Implement login command
      throw new UsageError(
        `You must be logged in ${registry} to publish packages. Run \`npm login\` to authenticate.`,
      );
    }

    project.logger.info(
      `Publishing \`${project.fullName}@${project.version}\` to ${registry}`,
    );

    await publish(project, registry, spec, this.access);

    await runScript('publish', project);
    await runScript('postpublish', project);
  }
}
