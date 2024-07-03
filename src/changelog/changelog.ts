import { existsSync, readFileSync } from 'fs-extra';
import { join } from 'pathe';
import {
  GitCommit,
  getCurrentRef,
  getGitDiff,
  getLastTag,
  parseCommits,
  parseGitCommit,
} from '../git.ts';
import { Project } from '../project.ts';

export class Changelog {
  public project: Project;
  public from: string | undefined = undefined;
  public to: string | undefined = undefined;
  public commits: GitCommit[] | undefined = undefined;

  private constructor(
    project: Project,
    from: string | undefined,
    to: string | undefined,
    commits: GitCommit[] | undefined,
  ) {
    this.project = project;
    this.from = from;
    this.to = to;
    this.commits = commits;
  }

  static async init(project: Project) {
    const from = await getLastTag();
    const to = await getCurrentRef();
    const rawCommits = await getGitDiff(from, to);
    const commits = await parseCommits(rawCommits);

    return new Changelog(project, from, to, commits);
  }

  getCommits() {
    return this.commits;
  }

  getCommitsByType(type: string) {
    return this.commits?.filter((commit) => commit.type === type);
  }

  changelogPath() {
    return join(process.cwd(), this.project.config.changelogFile);
  }

  readChangelog() {
    if (existsSync(this.changelogPath())) {
      return readFileSync(this.changelogPath(), 'utf8');
    }
  }
}
