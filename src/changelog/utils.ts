import { Reference } from '../git.ts';
import { Project } from '../project.ts';

export const replaceValue = (
  templateName: string,
  text: string,
  value: string,
) => {
  return text.replaceAll(new RegExp(`{{\\s*${templateName}\\s*}}`, 'g'), value);
};

export const refs: Record<string, Record<string, string>> = {
  github: {
    hash: 'commit',
    issue: 'issues',
    'pull-request': 'pull',
  },
  gitlab: {
    hash: 'commit',
    issue: 'issues',
    'pull-request': 'merge_requests',
  },
  bitbucket: {
    hash: 'commits',
    issue: 'issues',
    'pull-request': 'pull-requests',
  },
};

export const formatRef = (ref: Reference, provider: string, repo: string) => {
  const refSpec = refs[provider];
  return `[${ref.value}](${domains[provider]}/${repo}/${
    refSpec[ref.type]
  }/${ref.value.replace(/^#/, '')})`;
};

export const domains: Record<string, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org',
};

export const resolveProvider = (url: string) => {
  const gitProviders: { [key: string]: RegExp } = {
    github: /github\.com|github:/,
    gitlab: /gitlab\.com|gitlab:/,
    bitbucket: /bitbucket\.org|bitbucket:/,
  };

  for (const provider in gitProviders) {
    if (gitProviders[provider].test(url)) {
      return provider;
    }
  }

  if (/^[\w-]+\/[\w-]+$/.test(url)) {
    return 'github';
  }

  return 'github';
};

export const resolveRepo = (project: Project) => {
  const repo = project.config.repository;
  if (!repo) {
    return;
  }

  if (typeof repo === 'string') {
    return repo;
  }

  return repo.url;
};

export const extractRepoPath = (url: string) => {
  const match = url.match(
    /(?:github\.com|gitlab\.com|bitbucket\.org)\/(.+?)(?:\.git)?$/,
  );
  return match ? match[1] : url;
};
