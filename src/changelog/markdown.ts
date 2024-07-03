import { convert } from 'convert-gitmoji';
import { UsageError } from '../errors.ts';
import { GitCommit } from '../git.ts';
import { Project } from '../project.ts';
import { Changelog } from './changelog.ts';
import {
  domains,
  extractRepoPath,
  formatRef,
  resolveProvider,
  resolveRepo,
} from './utils.ts';

export const generateChangelog = async (
  project: Project,
  changelog: Changelog,
) => {
  if (!project.version) {
    throw new UsageError('No version found in project.');
  }

  const lines: string[] = [];
  const version = `v${project.version}`;

  let repo = resolveRepo(project);
  if (repo) {
    repo = extractRepoPath(repo);
  }

  let compareChanges = '';
  if (repo && changelog.to) {
    const provider = resolveProvider(repo);
    const compare = provider === 'bitbucket' ? 'branches/compare' : 'compare';
    const url = `${domains[provider]}/${repo}/${compare}/${changelog.from || ''}...${changelog.to}`;

    compareChanges = `<sup>[View changes](${url})</sup>`;
  }

  const title = `## ${version}`;

  lines.push(title, '');

  const authors: Map<string, Author> = new Map();
  for (const type in project.config.types) {
    const commits = changelog.getCommitsByType(type);
    if (!commits || commits.length === 0) {
      continue;
    }

    lines.push(`### ${project.config.types[type]}`, '');

    for (const commit of commits.reverse()) {
      if (commit.authors) {
        for (const author of commit.authors) {
          if (!author.name || author.name.includes('[bot]')) {
            continue;
          }

          if (authors.has(author.name)) {
            const entry = authors.get(author.name);
            entry?.email.add(commit.author.email);
          } else {
            authors.set(author.name, {
              email: new Set([commit.author.email]),
              name: author.name,
            });
          }
        }
      }

      lines.push(formatCommit(commit, repo as string));
    }

    lines.push('');
  }

  lines.push(await generateAuthors(authors), '');

  if (compareChanges) {
    lines.push(compareChanges, '');
  }

  return convert(lines.join('\n').trim(), true);
};

type Author = {
  name: string;
  email: Set<string>;
  github?: string;
};

export const generateAuthors = async (
  _authors: Map<string, Author>,
): Promise<string> => {
  // https://github.com/unjs/changelogen/blob/42972f29e6d2c178fe27c8fad1e894858fab220a/src/markdown.ts#L71-L86
  await Promise.all(
    [..._authors.keys()].map(async (authorName) => {
      const meta = _authors.get(authorName) as unknown as Author;
      if (!meta) {
        return;
      }
      for (const email of meta.email) {
        const { user } = await fetch(`https://ungh.cc/users/find/${email}`)
          .then((r) => r.json())
          .catch(() => ({ user: null }));
        if (user) {
          meta.github = user.username;
          break;
        }
      }

      if (!meta.github) {
        const { user } = await fetch(`https://ungh.cc/users/find/${authorName}`)
          .then((r) => r.json())
          .catch(() => ({ user: null }));
        if (user) {
          meta.github = user.username;
        }
      }
    }),
  );

  const authors = [..._authors.entries()].map((e) => ({ name: e[0], ...e[1] }));

  if (!authors || authors.length === 0) {
    return '';
  }

  const formatName = (author: Author) => {
    if (author.github) {
      return `[@${author.name}](${domains.github}/${author.github})`;
    }

    return author.name;
  };

  if (authors.length === 1) {
    return `#### Contributors \nHuge thanks to ${formatName(authors[0])} for contributing to this release!`;
  }

  const authorNames = authors.map((author) => formatName(author));
  const last = authorNames.pop();

  return `#### Contributors \nHuge thanks to ${authorNames.join(', ')} and ${last} for contributing to this release!`;
};

export const formatCommit = (commit: GitCommit, repo: string) => {
  const provider = resolveProvider(repo);
  let msg = '-';
  if (commit.scope) {
    msg += ` **${commit.scope}:**`;
  }

  msg += ` ${commit.description}`;

  for (const ref of commit.references) {
    msg += ` (${formatRef(ref, provider, repo)})`;
  }

  return msg;
};
