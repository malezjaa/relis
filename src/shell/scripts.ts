import path from 'node:path';
import { dirname, resolve } from 'pathe';
import which from 'which';
import { Configuration } from '../configuration.ts';
import { Project } from '../project.ts';
import { cmdEscape, shEscape } from './escape.ts';

export const runScript = async (script: string, project: Project) => {
  if (!project.packageJson.scripts || !project.packageJson.scripts[script]) {
    return;
  }

  const env = buildPath(process.cwd(), {
    ...process.env,
    npm_lifecycle_event: script,
    npm_lifecycle_script: project.packageJson.scripts[script],
    npm_package_name: project.packageJson.name,
    npm_package_json: resolve(process.cwd(), 'package.json'),
    npm_package_version: project.packageJson.version,
    // eslint-disable-next-line unicorn/prefer-module
    npm_config_node_gyp: require.resolve('node-gyp/bin/node-gyp.js'),
  });

  await runBasedOnRuntime({
    script: project.packageJson.scripts[script],
    env,
  });
};

// Based on https://github.com/npm/promise-spawn and https://github.com/npm/run-script

const findInObject = (obj: Record<any, any>, key: string) => {
  key = key.toLowerCase();
  for (const objKey of Object.keys(obj).sort()) {
    if (objKey.toLowerCase() === key) {
      return obj[objKey];
    }
  }
};

const runBasedOnRuntime = async (options: {
  script: string;
  env: Record<string, any>;
  windowsVerbatimArguments?: boolean;
}) => {
  const command = process.platform === 'win32' ? process.env.ComSpec : 'sh';

  const realArgs = [];
  const cmd = options.script;
  let script = cmd;

  const isCmd = /(?:^|\\)cmd(?:\.exe)?$/i.test(command as string);
  if (isCmd) {
    let doubleEscape = false;

    let initialCmd = '';
    let insideQuotes = false;
    for (let i = 0; i < cmd.length; ++i) {
      const char = cmd.charAt(i);
      if (char === ' ' && !insideQuotes) {
        break;
      }

      initialCmd += char;
      if (char === '"' || char === "'") {
        insideQuotes = !insideQuotes;
      }
    }

    let pathToInitial;
    try {
      pathToInitial = which
        .sync(initialCmd, {
          path:
            (options.env && findInObject(options.env, 'PATH')) ||
            process.env.PATH,
          // @ts-expect-error Error
          pathext:
            (options.env && findInObject(options.env, 'PATHEXT')) ||
            process.env.PATHEXT,
        })
        .toLowerCase();
    } catch {
      pathToInitial = initialCmd.toLowerCase();
    }

    doubleEscape =
      pathToInitial.endsWith('.cmd') || pathToInitial.endsWith('.bat');

    script = cmdEscape(script, doubleEscape);
    realArgs.push('/d', '/s', '/c', script);
    options.windowsVerbatimArguments = true;
  } else {
    script = shEscape(script);
    realArgs.push('-c', script);
  }

  // if (Configuration.useBun) {
  //   return Bun.spawnSync([command as string, ...realArgs], {
  //     env: options.env,
  //     windowsVerbatimArguments: options.windowsVerbatimArguments,
  //     stdout: 'inherit',
  //     stderr: 'inherit',
  //   });
  // }
  //
  // const execa = await import('execa');
  //
  // await execa.execa(command as string, realArgs, {
  //   env: options.env,
  //   stderr: 'inherit',
  //   stdout: 'inherit',
  //   windowsVerbatimArguments: options.windowsVerbatimArguments,
  // });

  await runCommand(command as string, realArgs, {
    env: options.env,
    windowsVerbatimArguments: options.windowsVerbatimArguments,
  });
};

export const runCommand = async (
  command: string,
  args: string[],
  opts: any = {},
) => {
  if (Configuration.useBun) {
    return Bun.spawnSync([command, ...args], {
      env: process.env,
      stdio: [
        'pipe',
        opts.silent ? 'pipe' : 'inherit',
        opts.silent ? 'pipe' : 'inherit',
      ],
      ...opts,
    });
  }

  const execa = await import('execa');

  return execa.execa(command, args, {
    env: process.env,
    stdio: [
      'pipe',
      opts.silent ? 'pipe' : 'inherit',
      opts.silent ? 'pipe' : 'inherit',
    ],
    ...opts,
  });
};

export const runCommandWithStdout = async (
  command: string,
  args: string[],
  opts: any = {},
) => {
  return await runCommand(command, args, {
    ...opts,
    silent: true,
  }).then((result) => {
    return result.stdout?.toString() || undefined;
  });
};

const nodeGypPath = resolve(import.meta.dirname, 'node-gyp-bin');

const buildPath = (projectPath = process.cwd(), env: Record<string, any>) => {
  const PATH = Object.keys(env)
    .filter((p) => /^path$/i.test(p) && env[p])
    .map((p) => env[p].split(path.delimiter))
    .reduce(
      (set, p) => [
        ...set,
        ...p.filter((concatted: any) => !set.includes(concatted)),
      ],
      [],
    )
    .join(path.delimiter);

  const pathArr = [];

  let p = projectPath;
  let pp;

  do {
    pathArr.push(resolve(p, 'node_modules', '.bin'));
    pp = p;
    p = dirname(p);
  } while (p !== pp);

  pathArr.push(nodeGypPath, PATH);

  const pathVal = pathArr.join(path.delimiter);

  for (const key of Object.keys(env)) {
    if (/^path$/i.test(key)) {
      env[key] = pathVal;
    }
  }

  return env;
};
