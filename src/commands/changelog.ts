import { BaseCommand, options } from 'curzon';
import { writeFileSync } from 'fs-extra';
import { Changelog } from '../changelog/changelog.ts';
import { generateChangelog } from '../changelog/markdown.ts';
import { UsageError } from '../errors.ts';
import {
  addFiles,
  createReleaseCommit,
  createTag,
  getGitStatus,
  pushChanges,
} from '../git.ts';
import { Project } from '../project.ts';

export class ChangelogCommand extends BaseCommand {
  static paths = ['changelog'];

  // TODO: Add meta
  static meta = {};

  noGitChecks = options.boolean('no-git-checks', {
    description: 'Skip git check',
  });

  async run() {
    const status = await getGitStatus();

    if (!this.noGitChecks && status) {
      throw new UsageError(
        'You have uncommitted changes. Please commit or stash them before generating a changelog.',
      );
    }

    const project = await Project.init();
    const changelog = await Changelog.init(project);

    project.logger.info(
      `Generating changelog \`(${changelog.from || ''}...${changelog.to})\``,
    );

    const commits = changelog.getCommits();

    if (!commits || commits.length === 0) {
      project.logger.info('No commits found.');
      return;
    }

    const md = await generateChangelog(project, changelog);
    let markdown = '';

    const content = changelog.readChangelog();
    const addBase = !content || !!(content && !content.includes('# Changelog'));

    if (addBase) {
      markdown += '# Changelog\n\n';
    } else {
      markdown = content;
    }

    const lastEntry = markdown.match(/^##\s+.*$/m);

    if (lastEntry) {
      markdown =
        markdown.slice(0, lastEntry.index) +
        md +
        '\n\n' +
        markdown.slice(lastEntry.index);
    } else {
      markdown += '\n' + md + '\n\n';
    }

    writeFileSync(changelog.changelogPath(), markdown);

    project.logger.info(`Updated changelog: ${project.config.changelogFile}`);

    await addFiles([project.config.changelogFile, 'package.json']);
    project.logger.info('Changelog added to staging area.');

    await createReleaseCommit(project.version as string, project);
    project.logger.info('Release commit created.');

    await createTag(project.version as string, project);
    await pushChanges();
    project.logger.info('Tag created and pushed to remote.');
  }
}
