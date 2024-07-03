import { Project } from './project.ts';
import { runCommand, runCommandWithStdout } from './shell/scripts.ts';

export const getGitStatus = async () => {
  return await runCommandWithStdout('git', ['status', '--porcelain']);
};

export const getLastTag = async () => {
  let output = await runCommandWithStdout('git', [
    'describe',
    '--tags',
    '--abbrev=0',
  ]);
  const tags = output?.split('\n').filter((tag) => tag !== '');

  return tags?.at(-1);
};

export const getCurrentBranch = async () => {
  const output = await runCommandWithStdout('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  return output?.trim();
};

export const getCurrentTag = async () => {
  return await runCommandWithStdout('git', ['tag', '--points-at', 'HEAD']);
};

export const getCurrentRef = async () => {
  return (await getCurrentTag()) || (await getCurrentBranch());
};

export interface GitCommitAuthor {
  name: string;
  email: string;
}

export interface RawGitCommit {
  message: string;
  body: string;
  shortHash: string;
  author: GitCommitAuthor;
}

export interface Reference {
  type: 'hash' | 'issue' | 'pull-request';
  value: string;
}

export interface GitCommit extends RawGitCommit {
  description: string;
  type: string;
  scope: string;
  references: Reference[];
  authors: GitCommitAuthor[];
  isBreaking: boolean;
}

export const getGitDiff = async (
  from?: string,
  to = 'HEAD',
): Promise<RawGitCommit[]> => {
  const gitLogOutput =
    (await runCommandWithStdout('git', [
      '--no-pager',
      'log',
      `${from ? `${from}...` : ''}${to}`,
      '--pretty="----%n%s|%h|%an|%ae%n%b"',
      '--name-status',
    ])) || '';
  const commitLines = gitLogOutput.split('----\n').slice(1);

  return commitLines.map((line) => {
    const [header, ...body] = line.split('\n');
    const [message, shortHash, authorName, authorEmail] = header.split('|');

    return {
      message,
      shortHash,
      author: { name: authorName, email: authorEmail },
      body: body.join('\n'),
    };
  });
};

export const parseCommits = async (
  commits: RawGitCommit[],
): Promise<GitCommit[]> => {
  const parsedCommits = await Promise.all(
    commits.map((element) => parseGitCommit(element)),
  );
  return parsedCommits.filter(Boolean) as GitCommit[];
};

const ConventionalCommitRegex =
  /(?<emoji>:.+:|(\uD83C[\uDF00-\uDFFF])|(\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF])|[\u2600-\u2B55])?( *)?(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i;
const CoAuthoredByRegex = /co-authored-by:\s*(?<name>.+)(<(?<email>.+)>)/gim;
const PullRequestRE = /\([ a-z]*(#\d+)\s*\)/gm;
const IssueRE = /(#\d+)/gm;

export const parseGitCommit = async (
  commit: RawGitCommit,
): Promise<GitCommit | null> => {
  const match = commit.message.match(ConventionalCommitRegex);
  if (!match) {
    return null;
  }

  const type = match.groups?.type;

  let scope = match.groups?.scope || '';

  const isBreaking = Boolean(match.groups?.breaking);
  let description = match.groups?.description || '';

  const references: Reference[] = [];
  for (const m of description.matchAll(PullRequestRE)) {
    references.push({ type: 'pull-request', value: m[1] });
  }
  for (const m of description.matchAll(IssueRE)) {
    if (!references.some((i) => i.value === m[1])) {
      references.push({ type: 'issue', value: m[1] });
    }
  }
  references.push({ value: commit.shortHash, type: 'hash' });

  description = description.replaceAll(PullRequestRE, '').trim();

  const authors: GitCommitAuthor[] = [commit.author];
  for (const match of commit.body.matchAll(CoAuthoredByRegex)) {
    authors.push({
      name: (match.groups?.name || '').trim(),
      email: (match.groups?.email || '').trim(),
    });
  }

  return {
    ...commit,
    authors,
    description,
    type: type || 'chore',
    scope,
    references,
    isBreaking,
  };
};

export const fetchRemote = async (remote: string = 'origin') => {
  const content = await runCommandWithStdout('git', [
    'remote',
    'get-url',
    remote,
  ]);
  return content?.trim();
};

export const addFiles = async (files: string[]) => {
  await runCommand('git', ['add', ...files], {
    silent: true,
  });
};

export const createReleaseCommit = async (
  version: string,
  project: Project,
) => {
  const commitMessage = project.config.templates.commit.replaceAll(
    /{{\s*newVersion\s*}}/g,
    version,
  );

  await runCommand('git', ['commit', '-m', commitMessage]);
};

export const createTag = async (version: string, project: Project) => {
  const tagMessage = project.config.templates.tagMessage.replaceAll(
    /{{\s*newVersion\s*}}/g,
    version,
  );
  const tagBody = project.config.templates.tagBody.replaceAll(
    /{{\s*newVersion\s*}}/g,
    version,
  );

  await runCommand('git', ['tag', '-am', tagMessage, tagBody]);
};

export const pushChanges = async () => {
  await runCommand('git', ['push', '--follow-tags']);
};
