#!/usr/bin/env node
import { createCli } from 'curzon';
import { description, name, version } from '../package.json';
import { BumpCommand } from './commands/bump.ts';
import { ChangelogCommand } from './commands/changelog.ts';
import { PublishCommand } from './commands/publish.ts';

const cli = createCli({
  appName: 'Better NPM Publish',
  binaryName: name,
  description,
  version,
});

cli.use([PublishCommand, ChangelogCommand, BumpCommand]);

cli.run();
